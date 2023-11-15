/// <reference lib="webworker" />
import { getDB, log } from "./utils.ts";
const shouldStore = Boolean(parseInt(Deno.env.get("SHOULD_STORE") || "0"));

if (!shouldStore) {
	log.info("SHOULD_STORE is false, exiting data writing worker");
	self.close();
}

log.info("SHOULD_STORE is true, setting up database");

const sql = await getDB();

// log.info("Database connected: ", dbClient.connected);

let dbBuffer: {
	sensorID: number;
	parsedData: [string, number, ...number[]][];
}[] = [];

async function flushBuffer() {
	let packetCount = 0;
	for (const { sensorID, parsedData } of dbBuffer) {
		for (const packet of parsedData) {
			packetCount++;

			const channel = packet[0];
			const timestamp = packet[1];

			const rawDataValues = packet.slice(2) as number[];

			await sql`
			INSERT INTO sensor_data_2 (sensor_website_id, data_timestamp, data_channel, counts_values) 
							 VALUES (${sensorID}, to_timestamp(${timestamp}), ${channel}, ${
				"{" + rawDataValues.join(",") + "}"
			});`;
		}
	}
	dbBuffer = [];
	log.info(`Wrote ${packetCount} packets to DB`);
}

self.addEventListener("message", (event: MessageEvent) => {
	dbBuffer.push(event.data);
	if (dbBuffer.length >= 250) {
		flushBuffer();
	}
});
// Table setup
await sql`
CREATE TABLE IF NOT EXISTS sensor_data_2 (
	sensor_website_id int NOT NULL,
	data_timestamp timestamptz NOT NULL,
	data_channel char(3) NOT NULL,
	counts_values int[] NOT NULL
);`;
await sql`CREATE EXTENSION IF NOT EXISTS timescaledb;`;
await sql`SELECT create_hypertable('sensor_data_2','data_timestamp', if_not_exists => TRUE);`;

try {
	// These sometimes throw because timescale is being silly
	await sql`ALTER TABLE sensor_data_2 SET (timescaledb.compress, timescaledb.compress_segmentby = 'sensor_website_id');`;
	await sql`SELECT add_compression_policy('sensor_data_2', INTERVAL '2 days', if_not_exists => TRUE);`;
} catch (err) {
	log.error(`Error setting up table: ${err}`);
}
