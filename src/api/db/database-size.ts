import { getDB, log } from "../../utils.ts";
import { json } from "itty-router";

export async function databaseSize() {
	const sql = await getDB();

	let size;
	let time;

	const dir = Deno.env.get("READ_FS_SIZE")
	if (dir && dir != "0") {
		const res = (await sql`SELECT size, timestamp FROM db_size_history ORDER BY timestamp LIMIT 1;`)[0]
		size = res.size;
		time = res.time?.toISOString();
	} else {

		size = (await sql`SELECT pg_database_size('sensor_data');`)[0]
			.pg_database_size;
		time = new Date().toISOString();
	}

	log.info(`Current disk size as at ${time}: ${size}`)

	return new Response(`${size},${time}`);
}

export async function databaseSizeHistory() {
	const sql = await getDB();

	const sizes = await sql<
		{ size: number; timestamp: Date }[]
	>`SELECT size, timestamp FROM db_size_history;`;

	return json(
		sizes.map((s) => ({ time: s.timestamp.toISOString(), size: s.size }))
	);
}


export async function totalDiskSize() {
	const sql = await getDB();

	const currentSize = (await sql`SELECT value FROM system_config WHERE key = 'max_disk_size';`)[0]?.value;
	log.info("Current max disk size: "+currentSize)

	return new Response(currentSize+"");
}