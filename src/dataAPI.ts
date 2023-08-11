import { getSensor } from "./connectionHandler.ts";
import { fetchAPI, getDB } from "./utils.ts";
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
	const _from = url.searchParams.get("from");
	const _to = url.searchParams.get("to");

	if (!sensorID)
		return new Response("Specify a sensor to export from", {
			status: 400,
			headers: corsHeaders,
		});

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
		});
	}

	const sensor = getSensor(sensorID);

	if (!sensor)
		return new Response("Couldn't find a sensor with that ID", {
			status: 404,
			headers: corsHeaders,
		});

	console.log(from, to);

	const body = new ReadableStream({
		start(controller) {
			controller.enqueue(
				new TextEncoder().encode(
					"Sensor Website ID	Data Timestamp	Data Channel	Data Counts\n"
				)
			);
			sql`SELECT EXTRACT(EPOCH FROM data_timestamp) as data_timestamp, data_channel, counts_values FROM sensor_data_2 WHERE sensor_website_id=${sensor.id} AND data_timestamp >= to_timestamp(${from}) AND data_timestamp <= to_timestamp(${to});`.stream(
				(row: Record<string, string>) => {
					const message =
						[
							sensor.id,
							row["data_timestamp"],
							row["data_channel"],
							row["counts_values"],
						].join("	") + "\n";
					controller.enqueue(new TextEncoder().encode(message));
				},
				1000
			);
		},
	});

	// This is for the progress bar
	const count = parseInt(
		(
			await sql`SELECT count(sensor_website_id) FROM sensor_data_2 WHERE sensor_website_id=${sensor.id} AND  data_timestamp >= to_timestamp(${from}) AND data_timestamp <= to_timestamp(${to});`
		)[0]["count"]
	);

	console.log(count);

	return new Response(body, {
		headers: {
			"content-type": "text/csv",
			"x-number-of-records": count + "",
			...corsHeaders,
		},
	});
}
