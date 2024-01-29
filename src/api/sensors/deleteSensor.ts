import { IRequest, json } from "itty-router";
import { getDB } from "../../utils.ts";

/**
 * Deletes a sensor from the database by ID.
 * @param {Request} request - Request object from the fetch call
 * @returns {Response} - Response object to send back to the client
 */
export default async function deleteSensor(
	request: IRequest
): Promise<Response> {
	const id = parseInt(request.params.id);
	await using sql = getDB();
	await sql`DELETE FROM sensors WHERE id=${id};`;

	return json({ status: "ok" });
}
