import { getDB } from "../../utils.ts";

export async function databaseSize() {
	const sql = await getDB();

	const size = (await sql`SELECT pg_database_size('sensor_data');`)[0]
		.pg_database_size;
	return new Response(size);
}
