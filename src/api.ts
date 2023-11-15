import { IRequest, Router } from "npm:itty-router@4.0.23";
import { getSensor } from "./connectionHandler.ts";
import { fetchAPI, getDB, log } from "./utils.ts";
import {
	serialiseToMiniSEEDUint8Array,
	startTimeFromDate,
} from "npm:miniseed@0.2.1";

function setCORSHeaders(req: IRequest, res: Response) {
	// itty-router's built-in cors is broken
	res.headers.set(
		"Access-Control-Allow-Methods",
		"GET, POST, PUT, PATCH, OPTIONS, DELETE"
	);
	res.headers.set("Access-Control-Allow-Headers", "*");
	res.headers.set("Access-Control-Expose-Headers", "X-Number-Of-Records");
	res.headers.set(
		"Access-Control-Allow-Origin",
		req.headers.get("origin") || "*"
	);
}

const sql = getDB();

function deArrayQueryParamsMiddleware(req: IRequest) {
	for (const [k, v] of Object.entries(req.query)) {
		if (Array.isArray(v)) req.query[k] = v.at(-1);
	}
}

function authMiddleware(roles?: string[]) {
	return async (req: IRequest) => {
		// Check Auth
		const tokenMatch = req.headers.get("Authorization")?.match(/Bearer (.+)/);
		if (!tokenMatch || tokenMatch.length < 2)
			return new Response("Unauthorised", {
				status: 401,
			});

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
			});
		}

		if (roles)
			for (const role of roles)
				if (!userDetails.roles.includes(role))
					return new Response("Missing permissions", {
						status: 401,
					});
	};
}

const apiRouter = Router({ base: "/api/v1" });
apiRouter
	.options("*", (req) => {
		const res = new Response();
		setCORSHeaders(req, res);
		return res;
	})
	.get("/database-size", authMiddleware(["sensor-data:db-size"]), async () => {
		const size = (await sql`SELECT pg_database_size('sensor_data');`)[0]
			.pg_database_size;
		return new Response(size);
	})
	.get(
		"/data-bulk-export",
		authMiddleware(["sensor-data:bulk-export"]),
		deArrayQueryParamsMiddleware,
		async (req) => {
			const sensorID = req.query["sensor_id"] as string;

			const format = (req.query["format"] as string)?.toLowerCase();
			const _channels = req.query["channels"] as string;
			const _from = req.query["from"] as string;
			const _to = req.query["to"] as string;

			if (!sensorID)
				return new Response("Specify a sensor to export from", {
					status: 400,
				});

			if (!format)
				return new Response("Specify a format to export in", {
					status: 400,
				});

			if (!["tsv1", "miniseed3"].includes(format))
				return new Response("Please choose a valid format: tsv1 or miniseed3", {
					status: 400,
				});

			if (!_channels)
				return new Response("Specify channels to export from", {
					status: 400,
				});

			const channels = _channels.split(",").map((c) => c.toUpperCase());

			if (!_from)
				return new Response("Specify the start of the time range", {
					status: 400,
				});

			if (!_to)
				return new Response("Specify the end of the time range", {
					status: 400,
				});

			let to: number;
			let from: number;
			try {
				to = parseFloat(_to);
				from = parseFloat(_from);
			} catch {
				return new Response("Please provide unix timestamps in seconds", {
					status: 400,
				});
			}

			const sensor = getSensor(sensorID);

			if (!sensor)
				return new Response("Couldn't find a sensor with that ID", {
					status: 404,
				});

			switch (format) {
				case "tsv1": {
					const channelsQuerySegment = sql(channels);
					const query = sql`SELECT EXTRACT(EPOCH FROM data_timestamp) as data_timestamp, data_channel, counts_values FROM sensor_data_2 WHERE sensor_website_id=${sensor.id} AND data_channel in ${channelsQuerySegment} AND data_timestamp >= to_timestamp(${from}) AND data_timestamp <= to_timestamp(${to});`;
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
									log.warn("Error streaming response: ", err);
									controller.error(err);
								});
						},
					});

					// This is for the progress bar
					const count = parseInt(
						(
							await sql`SELECT count(sensor_website_id) FROM sensor_data_2 WHERE sensor_website_id=${sensor.id} AND data_channel in ${channelsQuerySegment} AND data_timestamp >= to_timestamp(${from}) AND data_timestamp <= to_timestamp(${to});`
						)[0]["count"]
					);

					if (count === 0) {
						return new Response(
							`No records found for sensor #${sensor.id} at that time in those channels`,
							{
								status: 404,
								headers: {
									"x-number-of-records": "0",
								},
							}
						);
					}

					return new Response(body, {
						headers: {
							"content-type": "text/tsv",
							"x-number-of-records": count + "",
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
								sensor_rs_station_id: sensor.meta.secondary_id,
								sensor_type: sensor.meta.type,
							},
						},
						sampleRatePeriod: 100,
						sourceIdentifier: identifier,
						startTime: startTimeFromDate(startTime),
					});

					return new Response(serialised, {
						headers: {
							"content-type": "Application/vnd.fdsn.mseed",
							"x-crisislab-data-start": startTime.toISOString(),
						},
					});
				}

				default: {
					return new Response("Unsupported export format", {
						status: 400,
					});
				}
			}
		}
	)
	.get("*", () => new Response("API route not found", { status: 404 }));

export const handleAPI = async (req: IRequest) => {
	const res: Response = await apiRouter.handle(req);
	setCORSHeaders(req, res);
	return res;
};
