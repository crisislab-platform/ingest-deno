import { IRequest, json } from "itty-router";
import { getSensor, randomizeLocation, Sensor } from "../apiUtils.ts";

/**
 * This function creates a sensor with the given data.
 *
 * @param {Request} request
 */
export default async function createSensor(request: IRequest) {
	const id = parseInt(request.params.id);
	const data: Partial<Sensor> = await request.json();

	data.id = parseInt(data.id + "");

	// Account for old API
	if (!data.location && data.latitude && data.longitude) {
		data.location = {
			type: "Point",
			coordinates: [data.longitude, data.latitude],
		};
		data.longitude = undefined;
		data.latitude = undefined;
	}

	if (data.id && id !== data.id) {
		return new Response("ID does not match with ID in data", {
			status: 409,
		});
	}

	const oldData = await getSensor(id);

	if (oldData) {
		return new Response(`Sensor with id ${id} already exists`, {
			status: 409,
		});
	}

	if (data.location?.coordinates) {
		data.publicLocation = randomizeLocation(data.location.coordinates);
	}

	await SENSORS.put(data.id + "", JSON.stringify(data));

	return json({ status: "ok" });
}
