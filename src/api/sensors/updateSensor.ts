import { randomizeLocation, getSensor, Sensor } from "../apiUtils.ts";
import { IRequest, json } from "itty-router";

const staticKeys = ["id"];

function normalize(str: string | number | unknown) {
	if (typeof str == "number" || typeof str != "string") return str;
	if (!isNaN(parseFloat(str)) && parseFloat(str).toString() === str)
		return parseFloat(str);
	return str;
}

export default async function updateSensor(request: IRequest) {
	const id = parseInt(request.params.id);
	const data = (await request.json()) as Partial<Sensor>;

	console.log("data", data);

	if (!data.location && data.latitude && data.longitude) {
		data.location = {
			type: "Point",
			coordinates: [data.longitude, data.latitude],
		};
		delete data.longitude;
		delete data.latitude;
	}

	const oldData = await getSensor(id);

	if (!oldData) {
		return new Response(`Sensor with id ${id} not found`, {
			status: 404,
		});
	}

	console.log("oldData", oldData, "data", data);

	if (oldData === data) {
		console.info("oldData is the same as new data");
		return new Response("Nothing changed", { status: 400 });
	}

	for (const key of staticKeys) {
		if (data[key] && normalize(data[key]) !== normalize(oldData[key])) {
			// console.log('key', key, 'data[key]', data[key], 'oldData[key]', oldData[key])
			return new Response("Cannot update static key", {
				status: 409,
			});
		}
	}

	const newData = { ...oldData };

	for (const [key, value] of Object.entries(data)) {
		newData[key] = value;
	}

	console.log("newData", newData);

	if (newData.location?.coordinates) {
		newData.publicLocation = randomizeLocation(newData.location.coordinates);
	}

	await SENSORS.put(id + "", JSON.stringify(newData));

	// return updated data
	return json(newData);
}
