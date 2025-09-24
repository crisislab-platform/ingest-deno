import { IRequest } from "itty-router";
import { PrivateSensorMeta } from "../../types.ts";
import { getDB, log, randomizeLocation } from "../../utils.ts";

/**
 * This function creates a sensor with the given data.
 *
 * @param {Request} request
 */
export default async function createSensor(request: IRequest) {
	const data: Partial<PrivateSensorMeta> = await request.json();
	console.log(data);

	const sql = await getDB();

	if (data.location) {
		data.public_location = randomizeLocation(data.location);
	}

	// Make the server autogenerate the ID
	// If an error is getting thrown about the ID being
	// already in use, that means the sequence is out-of-sync.
	// Run `SELECT setval('sensors_id_seq', max(id)) FROM sensors;` to fix it.
	if (data.id) {
		delete data.id;
	}

	// Make type match type_fk
	if (data.type_fk) {
		data.type = data.type_fk;
	}

	const id = (await sql`INSERT INTO sensors ${sql(data)} RETURNING id;`)?.[0]?.[
		"id"
	];
	log.info("Created sensor #" + id);

	return new Response(id + "", { status: 201 });
}
