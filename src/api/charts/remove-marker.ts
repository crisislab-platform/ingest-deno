import { IRequest } from "itty-router";
import { getDB, log } from "../../utils.ts";

export default async function removeMarker(request: IRequest) {
	const id = request.params.id.toLowerCase();

	// TODO: Also publish to websockets

	const sql = await getDB();

	await sql`DELETE FROM channel_markers WHERE id=${id};`;

	log.info(`Deleted marker ${id}`);

	return new Response("Removed " + id, { status: 204 });
}
