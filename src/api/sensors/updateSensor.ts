import { getDB } from "../../utils.ts";
import {
	randomizeLocation,
	getSensor,
	PrivateSensorMeta,
} from "../apiUtils.ts";
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
	const data = (await request.json()) as Partial<PrivateSensorMeta>;

	console.log("data", data);

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

	// Can't let them change the id
	delete data["id"];

	if (data.location) {
		data.public_location = randomizeLocation(data.location);
	}

	const sql = await getDB();

	await sql`UPDATE sensors SET ${sql(data)} WHERE id=${id};`;

	// return updated data
	return json({ ...oldData, ...data });
}
