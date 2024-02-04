import { IRequest, json } from "itty-router";
import { getDB, log } from "../../utils.ts";

/**
 * Deletes a sensor from the database by ID.
 * @param {Request} request - Request object from the fetch call
 * @returns {Response} - Response object to send back to the client
 */
export default async function deleteSensor(
	request: IRequest
): Promise<Response> {
	const id = parseInt(request.params.id);
	const sql = await getDB();
	log.info(`Deleting sensor #${id}...`);
	await sql`DELETE FROM sensors WHERE id=${id};`;
	log.info(`Deleted sensor #${id}`);

	return json({ status: "ok" });
}
