import { getSensor } from "./connectionHandler.ts";
import { fetchAPI, getDB } from "./utils.ts";

const corsHeaders = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Headers": "Authorization",
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
	} catch (err) {
		console.warn(err);
		return new Response("Invalid user token", {
			status: 500,
			headers: corsHeaders,
		});
	}
	console.log(userDetails);
	if (!userDetails.roles.includes("sensor-data:bulk-export"))
		return new Response("Missing permissions", {
			status: 401,
			headers: corsHeaders,
		});

	const sensorID = url.searchParams.get("sensor_id");

	if (!sensorID)
		return new Response("Specify a sensor to export from", {
			status: 400,
			headers: corsHeaders,
		});

	const sensor = getSensor(sensorID);

	if (!sensor)
		return new Response("Couldn't find a sensor with that ID", {
			status: 404,
			headers: corsHeaders,
		});

	const body = new ReadableStream({
		start(controller) {
			controller.enqueue(
				new TextEncoder().encode(
					"Sensor ID	RS Station ID	Data Timestamp	Data Channel	Data Counts\n"
				)
			);
			sql`SELECT data_timestamp, data_channel, counts_values FROM sensor_data WHERE sensor_website_id=${sensor.id}`.stream(
				(row: Record<string, string>) => {
					const message =
						[
							sensor.id,
							sensor.secondary_id,
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

	return new Response(body, {
		headers: {
			"content-type": "text/csv",
			"x-content-type-options": "nosniff",
			...corsHeaders,
		},
	});
}
