import { getSensor } from "./connectionHandler.ts";
import { fetchAPI, getDB } from "./utils.ts";
import {
	serialiseToMiniSEEDUint8Array,
	startTimeFromDate,
} from "npm:miniseed@0.2.1";

const corsHeaders = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Headers": "Authorization",
	"access-control-expose-headers": "X-Number-Of-Records",
};

const sql = getDB();
export async function handleDataAPI(req: Request): Promise<Response | null> {
	const url = new URL(req.url);

	// Check that this is the right URL
	if (req.method === "OPTIONS")
		return new Response(null, {
			headers: corsHeaders,
		});
	if (req.method !== "GET") return null;
	if (!/^\/api\/v1\/data-bulk-export\/?$/.test(url.pathname)) return null;

	// Check Auth
	const tokenMatch = req.headers.get("Authorization")?.match(/Bearer (.+)/);
	if (!tokenMatch || tokenMatch.length < 2)
		return new Response("Unauthorised", { status: 401, headers: corsHeaders });

	const token = tokenMatch[1];

	let userDetails;

	// Very cursed
	try {
		// Pretend to be the user making the request to the API
		// to figure out if they have the correct role.
		userDetails = await (
			await fetchAPI("auth/me", {
				headers: { authorization: `Bearer ${token}` },
			})
		).json();
	} catch {
		return new Response("Invalid user token", {
			status: 500,
			headers: corsHeaders,
		});
	}

	if (!userDetails.roles.includes("sensor-data:bulk-export"))
		return new Response("Missing permissions", {
			status: 401,
			headers: corsHeaders,
		});

	const sensorID = url.searchParams.get("sensor_id");
	const format = url.searchParams.get("format")?.toLowerCase();
	const _channels = url.searchParams.get("channels");
	const _from = url.searchParams.get("from");
	const _to = url.searchParams.get("to");

	if (!sensorID)
		return new Response("Specify a sensor to export from", {
			status: 400,
			headers: corsHeaders,
		});

	if (!format)
		return new Response("Specify a format to export in", {
			status: 400,
			headers: corsHeaders,
		});

	if (!["tsv1", "miniseed3"].includes(format))
		return new Response("Please choose a valid format: tsv1 or miniseed3", {
			status: 400,
			headers: corsHeaders,
		});

	if (!_channels)
		return new Response("Specify channels to export from", {
			status: 400,
			headers: corsHeaders,
		});

	const channels = _channels.split(",");

	if (!_from)
		return new Response("Specify the start of the time range", {
			status: 400,
			headers: corsHeaders,
		});

	if (!_to)
		return new Response("Specify the end of the time range", {
			status: 400,
			headers: corsHeaders,
		});

	let to: number;
	let from: number;
	try {
		to = parseFloat(_to);
		from = parseFloat(_from);
	} catch {
		return new Response("Please provide unix timestamps in seconds", {
			status: 400,
			headers: corsHeaders,
		});
	}

	const sensor = getSensor(sensorID);

	if (!sensor)
		return new Response("Couldn't find a sensor with that ID", {
			status: 404,
			headers: corsHeaders,
		});

	switch (format) {
		case "tsv1": {
			const query = sql`SELECT EXTRACT(EPOCH FROM data_timestamp) as data_timestamp, data_channel, counts_values FROM sensor_data_2 WHERE sensor_website_id=${
				sensor.id
			} AND data_channel in (${channels.join(
				","
			)}) AND data_timestamp >= to_timestamp(${from}) AND data_timestamp <= to_timestamp(${to});`;

			const body = new ReadableStream({
				start(controller) {
					controller.enqueue(
						new TextEncoder().encode(
							"Sensor Website ID	Data Timestamp	Data Channel	Data Counts\n"
						)
					);
					query
						.forEach((row: Record<string, string>) => {
							const message =
								[
									sensor.id,
									row["data_timestamp"],
									row["data_channel"],
									row["counts_values"],
								].join("	") + "\n";
							controller.enqueue(new TextEncoder().encode(message));
						})
						.then(() => {
							controller.close();
						})
						.catch((err) => {
							console.warn("Error streaming response: ", err);
							controller.error(err);
						});
				},
			});

			// This is for the progress bar
			const count = parseInt(
				(
					await sql`SELECT count(sensor_website_id) FROM sensor_data_2 WHERE sensor_website_id=${sensor.id} AND  data_timestamp >= to_timestamp(${from}) AND data_timestamp <= to_timestamp(${to});`
				)[0]["count"]
			);

			return new Response(body, {
				headers: {
					"content-type": "text/tsv",
					"x-number-of-records": count + "",
					...corsHeaders,
				},
			});
		}
		case "miniseed3": {
			// TODO: Better validation
			const channel = channels[0];
			// TODO: Limit time range

			const query = sql`SELECT data_timestamp, counts_values FROM sensor_data_2 WHERE sensor_website_id=${sensor.id} AND data_channel=${channel} AND data_timestamp >= to_timestamp(${from}) AND data_timestamp <= to_timestamp(${to});`;

			const rows = await query.execute();

			if (rows.length === 0)
				return new Response("No records found", {
					status: 404,
					headers: corsHeaders,
				});

			const startTime: Date = rows[0].data_timestamp;

			// TODO: Check for gaps
			const data = rows.flatMap((row) => row.counts_values);

			// TODO: Change to a proper FDSN network code when we have a station ID
			const identifier = `https://shakemap.crisislab.org.nz/sensor/${sensor.id}`;

			const serialised = serialiseToMiniSEEDUint8Array(data, {
				encoding: "Int32",
				extraHeaderFields: {
					CRISiSLab: {
						data_channel: channel,
						sensor_website_id: sensor.id,
						sensor_rs_station_id: sensor.secondary_id,
						sensor_type: sensor.type,
					},
				},
				sampleRatePeriod: 100,
				sourceIdentifier: identifier,
				startTime: startTimeFromDate(startTime),
			});

			return new Response(serialised, {
				headers: {
					...corsHeaders,
					"content-type": "Application/vnd.fdsn.mseed",
					"x-crisislab-data-start": startTime.toISOString(),
				},
			});
		}

		default: {
			return new Response("Unsupported export format", {
				status: 400,
				headers: corsHeaders,
			});
		}
	}
}
