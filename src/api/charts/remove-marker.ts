import { IRequest } from "itty-router";
import { getDB, log } from "../../utils.ts";
import { broadcastWebsocketMessage } from "../../connectionHandler.ts";

export default async function removeMarker(request: IRequest) {
	const id = request.params.id.toLowerCase();

	const sql = await getDB();

	const sensorType = (
		await sql`SELECT sensor_type FROM channel_markers WHERE id=${id};`
	)?.[0]?.["sensor_type"];

	await sql`DELETE FROM channel_markers WHERE id=${id};`;

	// Publish to websockets
	const message = {
		type: "remove-markers",
		data: [id],
	};
	broadcastWebsocketMessage({
		message,
		filterTargets: {
			sensorTypes: [sensorType],
		},
	});

	log.info(`Deleted marker ${id}`);

	return new Response("Removed " + id, { status: 204 });
}
