import { IRequest, json } from "itty-router";
import { randomizeLocation } from "../../utils.ts";
import { getDB } from "../../utils.ts";

export default async function randomizeSensors(req: IRequest) {
	const randomizeAll = req.query.all === "true";

	const sql = await getDB();

	let sensorLocations: { location: [number, number]; id: number }[];
	if (randomizeAll) {
		sensorLocations =
			await sql`SELECT location, id FROM sensors WHERE location IS NOT NULL;`;
	} else {
		sensorLocations =
			await sql`SELECT location, id FROM sensors WHERE public_location IS NULL AND location IS NOT NULL;`;
	}

	const randomized = sensorLocations
		.map(({ location, id }) => ({
			public_location: randomizeLocation(location),
			id,
		}))
		.map(
			({ public_location, id }) =>
				[public_location, id] as [[number, number], number]
		);

	await sql`
	UPDATE sensors SET public_location = update_data.public_location
	-- FIXME: Figure out this typescript error
	FROM (VALUES ${sql(randomized)}) AS update_data(public_location, id) 
	WHERE sensors.id = update_data.id;`;

	return json({ status: "ok" });
}
