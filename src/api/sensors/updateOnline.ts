import { json } from "itty-router";
import { getDB, log } from "../../utils.ts";

export default async function setOnline(request: Request): Promise<Response> {
	const data = await request.json();

	log.info("data", data);

	const { id, status_change_timestamp, online } = data as {
		id: number;
		status_change_timestamp: number;
		online?: boolean;
	};

	if (
		typeof id !== "number" ||
		typeof online !== "boolean" ||
		typeof status_change_timestamp !== "number"
	) {
		log.warn(
			`Invalid request to update online status for sensor #${id} to ${
				online ? "online" : "offline"
			}`
		);
		return new Response("Bad request", { status: 400 });
	}

	log.info(
		`Updating online status for sensor #${id}: now ${
			online === undefined ? "unknown" : online ? "online" : "offline"
		}`
	);

	const sql = await getDB();

	const oldSensor = (
		await sql<{ online?: boolean }[]>`SELECT online FROM sensors WHERE id=${id}`
	)[0];

	if (oldSensor.online === online) {
		log.info(
			"Nothing changed - old online status and new online status are equal"
		);
		return new Response("Nothing changed", { status: 400 });
	}

	await sql`UPDATE sensors SET online=${online}, status_change_timestamp=${new Date(
		status_change_timestamp
	)}
					WHERE id=${id};`;

	// TODO: New analytics to replace this
	// ONLINE_STATUS_UPDATES.writeDataPoint({
	// 	indexes: [id + ""],
	// });

	return json({ success: true });
}
