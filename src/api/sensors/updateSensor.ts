import { PrivateSensorMeta } from "../../types.ts";
import { randomizeLocation, getSensor, getDB, log } from "../../utils.ts";
import { IRequest, json } from "itty-router";

export default async function updateSensor(request: IRequest) {
	const id = parseInt(request.params.id);
	const data = (await request.json()) as Partial<PrivateSensorMeta>;

	log.info("data", data);

	const oldData = await getSensor(id);

	if (!oldData) {
		return new Response(`Sensor with id ${id} not found`, {
			status: 404,
		});
	}

	log.info("oldData", oldData, "data", data);

	if (oldData === data) {
		log.info("oldData is the same as new data");
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
