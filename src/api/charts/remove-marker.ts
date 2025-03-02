import { error, IRequest } from "itty-router";
import { getDB, log } from "../../utils.ts";
import { broadcastWebsocketMessage } from "../../connectionHandler.ts";

export default async function removeMarker(request: IRequest) {
	const id = request.params.id.toLowerCase();

	const sql = await getDB();

	const sensorType = (
		await sql`DELETE FROM chart_markers WHERE id=${id} RETURNING sensor_type;`
	)?.[0]?.["sensor_type"];

	if (!sensorType) {
		return error(404, "Can't find that marker");
	}

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
