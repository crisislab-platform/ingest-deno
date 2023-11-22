import { IRequest, json } from "itty-router";
import { randomizeLocation, getSensors } from "../apiUtils.ts";

export default async function randomizeSensors(req: IRequest) {
	const randomizeAll = req.query.all === "true";

	const sensors = Object.values(await getSensors()).filter(
		(sensor) => !!sensor.location && !randomizeAll && !sensor.publicLocation
	);

	await Promise.all(
		sensors
			.map((sensor) => ({
				...sensor,
				location: {
					...sensor.location,
					coordinates: randomizeLocation(sensor.location.coordinates),
				},
			}))
			.map((sensor) => SENSORS.put(sensor.id! + "", JSON.stringify(sensor)))
	);

	return json({ status: "ok" });
}
