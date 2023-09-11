/// <reference lib="webworker" />
import { getDB } from "./utils.ts";

const sql = await getDB();

// console.info("Database connected: ", dbClient.connected);
console.info("Should store to database: ", Deno.env.get("SHOULD_STORE"));

let dbBuffer: {
	sensor: Sensor;
	parsedData: [string, number, ...number[]][];
}[] = [];
self.addEventListener("message", (event: MessageEvent) => {
	dbBuffer.push(event.data);
});

// Table setup
await sql`
CREATE TABLE IF NOT EXISTS sensor_data_2 (
	sensor_website_id int NOT NULL,
	data_timestamp timestamptz NOT NULL,
	data_channel char(3) NOT NULL,
	counts_values int[] NOT NULL
);
`;

await sql`SELECT create_hypertable('sensor_data_2','data_timestamp', if_not_exists => TRUE);`;
try {
	// These sometimes throw because timescale is being silly
	await sql`ALTER TABLE sensor_data_2 SET (timescaledb.compress, timescaledb.compress_segmentby = 'sensor_website_id');`;
	await sql`SELECT add_compression_policy('sensor_data_2', INTERVAL '2 days', if_not_exists => TRUE);`;
} catch (err) {
	console.error(err);
}

setInterval(async () => {
	if (!parseInt(Deno.env.get("SHOULD_STORE") || "0")) return;
	console.info("Starting to save data to DB...");
	for (const { sensor, parsedData } of dbBuffer) {
		for (const packet of parsedData) {
			const channel = packet[0];
			const timestamp = packet[1];

			const rawDataValues = packet.slice(2) as number[];

			await sql`
			INSERT INTO sensor_data_2 (sensor_website_id, data_timestamp, data_channel, counts_values) 
							 VALUES (${sensor.id}, to_timestamp(${timestamp}), ${channel}, ${
				"{" + rawDataValues.join(",") + "}"
			});`;
		}
	}
	dbBuffer = [];
	console.info("Done saving data.");
}, 5 * 1000);
