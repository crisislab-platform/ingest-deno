import { IRequest } from "itty-router";
import { getDB } from "../../utils.ts";

export default async function listMarkers(_request: IRequest) {
	const sql = await getDB();

	const data = await sql`SELECT * FROM channel_markers;`;

	return new Response(JSON.stringify(data));
}
