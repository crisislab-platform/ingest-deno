import { IRequest, json } from "itty-router";
import { getDB } from "../../utils.ts";
import { SensorType } from "../../types.ts";

export default async function getSensorType(request: IRequest) {
	const sql = await getDB();
	const { name } = request.params;
	
	const [sensorType] = await sql<SensorType[]>`SELECT name, channels FROM sensor_types WHERE name = ${name}`;
	
	if (!sensorType) {
		return new Response("Sensor type not found", { status: 404 });
	}
	
	return json(sensorType);
}