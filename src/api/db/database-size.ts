import { getDB } from "../../utils.ts";

export async function databaseSize() {
	const sql = await getDB();

	const size = (await sql`SELECT pg_database_size('sensor_data');`)[0]
		.pg_database_size;
	return new Response(size);
}

export async function databaseSizeHistory() {
	const sql = await getDB();

	const sizes = await sql<
		{ size: number; timestamp: Date }[]
	>`SELECT size, timestamp FROM db_size_history;`;

	return new Response(
		sizes.map((s) => `${s.timestamp.toISOString()}	${s.size}`).join("\n")
	);
}
