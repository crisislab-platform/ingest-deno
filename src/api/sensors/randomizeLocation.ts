import { IRequest, json } from "itty-router";
import { randomizeLocation, getSensors } from "../apiUtils.ts";
import { getDB } from "../../utils.ts";

export default async function randomizeSensors(req: IRequest) {
	const randomizeAll = req.query.all === "true";

	const sql = await getDB();

	let sensors;
	if (randomizeAll) {
		sensors = await sql<
			{ location: [number, number] }[]
		>`SELECT location FROM sensors;`;
	} else {
		sensors = await sql<
			{ location: [number, number] }[]
		>`SELECT location FROM sensors WHERE location IS NULL;`;
	}

	await Promise.all(
		sensors
			.map((sensor) => ({
				...sensor,
				location: {
					...sensor.location,
					coordinates: randomizeLocation(sensor.location),
				},
			}))
			.map((sensor) => SENSORS.put(sensor.id! + "", JSON.stringify(sensor)))
	);

	return json({ status: "ok" });
}
