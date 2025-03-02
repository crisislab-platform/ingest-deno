import { error, IRequest } from "itty-router";
import { getDB, log } from "../../utils.ts";
import { broadcastWebsocketMessage } from "../../connectionHandler.ts";
import { ChartMarker } from "../../types.ts";

export default async function updateMarker(request: IRequest) {
	const id = request.params.id.toLowerCase();
	const data: Partial<ChartMarker> = await request.json();

	// Can't let them change the id
	delete data["id"];

	const sql = await getDB();

	const sensorType = (
		await sql`SELECT sensor_type FROM channel_markers WHERE id=${id};`
	)?.[0]?.["sensor_type"];

	if (!sensorType) {
		return error(404, "Can't find that marker");
	}

	const updatedMarker = (
		await sql<
			ChartMarker[]
		> //Line break to stop highlighting breaking
		`UPDATE channel_markers SET ${sql(data)} WHERE id=${id} RETURNING *;`
	)?.[0];

	// Publish to websockets
	// First remove outdated marker
	broadcastWebsocketMessage({
		message: {
			type: "remove-markers",
			data: [id],
		},
		filterTargets: {
			sensorTypes: [sensorType],
		},
	});

	// Then (maybe) add new marker
	if (updatedMarker.enabled) {
		broadcastWebsocketMessage({
			message: {
				type: "add-markers",
				data: [updatedMarker],
			},
			filterTargets: {
				sensorTypes: [sensorType],
			},
		});
	}

	log.info(`Updated marker ${id}`);

	return new Response("Updated " + id);
}
