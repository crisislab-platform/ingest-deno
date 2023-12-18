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
	if (!data.id || typeof data.id !== "number") {
		return new Response("ID is required", {
			status: 400,
		});
	}

	const sql = await getDB();

	const exists =
		(await sql`SELECT count(*) FROM sensors WHERE id=${data.id};`).length > 0;

	if (exists) {
		return new Response(`Sensor with id ${data.id} already exists`, {
			status: 409,
		});
	}

	if (data.location) {
		data.public_location = randomizeLocation(data.location);
	}

	const id = (await sql`INSERT INTO sensors ${sql(data)} RETURNING id;`)?.[0]?.[
		"id"
	];
	log.info("Created sensor #" + id);

	return json({ status: "ok" });
}
