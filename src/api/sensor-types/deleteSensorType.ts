import { IRequest, json } from "itty-router";
import { getDB } from "../../utils.ts";

export default async function deleteSensorType(request: IRequest) {
	const sql = await getDB();
	const { name } = request.params;
	
	const [sensorsUsingType] = await sql`SELECT COUNT(*)::int as count FROM sensors WHERE type_fk = ${name} AND removed IS NOT TRUE`;
	
	if (sensorsUsingType.count > 0) {
		return new Response(`Cannot delete sensor type: ${sensorsUsingType.count} sensors are using this type`, { status: 400 });
	}
	
	const result = await sql`DELETE FROM sensor_types WHERE name = ${name}`;
	
	if (result.count === 0) {
		return new Response("Sensor type not found", { status: 404 });
	}
	
	return json({ message: "Sensor type deleted successfully" });
}