import { IRequest, json } from "itty-router";
import { getDB } from "../../utils.ts";
import { SensorType } from "../../types.ts";

export default async function listSensorTypes(request: IRequest) {
	const sql = await getDB();
	
	const sensorTypes = await sql<SensorType[]>`SELECT name, channels FROM sensor_types ORDER BY name`;
	
	return json({
		timestamp: Date.now(),
		sensorTypes,
	});
}