import { getDB, log } from "../../utils.ts";
import { json } from "itty-router";

type DatabaseSizeChunk = {
	range_start: Date;
	range_end: Date | null;
	total_bytes: number | string;
};

type MonthlyDatabaseSize = {
	month: string;
	size: number;
	chunkCount: number;
	hasOverlappingData: boolean;
};

export async function databaseSize() {
	const sql = await getDB();

	let size;
	let time;

	const dir = Deno.env.get("READ_FS_SIZE")
	if (dir && dir != "0") {
		const res = (await sql`SELECT size, timestamp FROM db_size_history ORDER BY timestamp DESC LIMIT 1;`)[0]
		size = res.size;
		time = res.timestamp?.toISOString();
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

export async function databaseSizeByMonth() {
	const sql = await getDB();

	const chunks = await sql<DatabaseSizeChunk[]>`
		SELECT
			chunks.range_start,
			chunks.range_end,
			chunk_sizes.total_bytes
		FROM timescaledb_information.chunks chunks
		JOIN chunks_detailed_size('sensor_data_4') chunk_sizes
			ON chunk_sizes.chunk_schema = chunks.chunk_schema
			AND chunk_sizes.chunk_name = chunks.chunk_name
		WHERE chunks.hypertable_schema = 'public'
			AND chunks.hypertable_name = 'sensor_data_4'
			AND chunks.range_start IS NOT NULL
		ORDER BY chunks.range_start;
	`;

	const sizesByMonth = new Map<string, MonthlyDatabaseSize>();

	for (const chunk of chunks) {
		const chunkMonth = String(chunk.range_start.getUTCMonth() + 1).padStart(
			2,
			"0",
		);
		const month = `${chunk.range_start.getUTCFullYear()}-${chunkMonth}`;
		const size = sizesByMonth.get(month) ?? {
			month,
			size: 0,
			chunkCount: 0,
			hasOverlappingData: false,
		};

		size.size += Number(chunk.total_bytes);
		size.chunkCount += 1;

		const nextMonthStart = new Date(
			Date.UTC(
				chunk.range_start.getUTCFullYear(),
				chunk.range_start.getUTCMonth() + 1,
				1,
			),
		);
		let extendsPastMonth = false;
		if (chunk.range_end) {
			extendsPastMonth = chunk.range_end.getTime() > nextMonthStart.getTime();
		}

		if (!chunk.range_end || extendsPastMonth) {
			size.hasOverlappingData = true;
		}

		sizesByMonth.set(month, size);
	}

	return json([...sizesByMonth.values()]);
}

export async function totalDiskSize() {
	const sql = await getDB();

	const currentSize = (await sql`SELECT value FROM system_config WHERE key = 'max_disk_size';`)[0]?.value;
	log.info("Current max disk size: " + currentSize)

	return new Response(currentSize + "");
}
