import { IRequest, text } from "itty-router";
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
	log.info(`Removing sensor #${id}...`);
	// We don't actually delete the sensor, because there are a bunch
	// of compressed records that reference it. Instead, we just mark
	// it as removed, and filter that when loading sensor lists.
	await sql`UPDATE sensors SET removed=true WHERE id=${id};`;
	log.info(`Removed sensor #${id}`);

	return text("Sensor removed");
}
