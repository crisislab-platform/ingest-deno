import { IRequest, json } from "itty-router";
import { getDB, log, randomizeLocation } from "../../utils.ts";
import { PrivateSensorMeta } from "../../types.ts";

/**
 * This function creates a sensor with the given data.
 *
 * @param {Request} request
 */
export default async function createSensor(request: IRequest) {
	const data: PrivateSensorMeta = await request.json();
	console.log(data);

	await using sql = getDB();

	if (data.location) {
		data.public_location = randomizeLocation(data.location);
	}

	const id = (await sql`INSERT INTO sensors ${sql(data)} RETURNING id;`)?.[0]?.[
		"id"
	];
	log.info("Created sensor #" + id);

	return new Response(id + "", { status: 201 });
}
