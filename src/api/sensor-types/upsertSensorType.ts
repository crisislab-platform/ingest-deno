import { IRequest, json } from "itty-router";
import { SensorType } from "../../types.ts";
import { getDB } from "../../utils.ts";

export default async function upsertSensorType(request: IRequest) {
	const sql = await getDB();
	const { _name } = request.params;
	const { channels } = await request.json();

	
	if (!_name || _name.length === 0) return new Response("What's in a name?", { status: 400 });
	const name = decodeURIComponent(_name);


	if (!channels || !Array.isArray(channels)) {
		return new Response("channels must be an array", { status: 400 });
	}
	
	for (const channel of channels) {
		if (!channel.id || !channel.name || typeof channel.id !== 'string' || typeof channel.name !== 'string') {
			return new Response("each channel must have id and name strings", { status: 400 });
		}
		if (channel.id.length > 3 || channel.id.length < 1) {
			return new Response("channel id must be 1 - 3 characters", { status: 400 });
		}
	}
	
	const [sensorType] = await sql<SensorType[]>`
		INSERT INTO sensor_types (name, channels) 
		VALUES (${name}, ${JSON.stringify(channels)})
		ON CONFLICT (name) DO UPDATE SET 
			channels = EXCLUDED.channels
		RETURNING *
	`;
	
	return json(sensorType);
}