import { getDB } from "../../utils.ts";

export async function databaseSize() {
	await using sql = getDB();

	const size = (await sql`SELECT pg_database_size('sensor_data');`)[0]
		.pg_database_size;
	return new Response(size);
}
