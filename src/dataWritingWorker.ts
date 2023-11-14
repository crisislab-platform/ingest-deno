/// <reference lib="webworker" />
import { getDB } from "./utils.ts";
const shouldStore = Boolean(parseInt(Deno.env.get("SHOULD_STORE") || "0"));

if (!shouldStore) {
	console.info("SHOULD_STORE is false, exiting data writing worker");
	self.close();
} else {
	console.info("SHOULD_STORE is true, setting up database");

	const sql = await getDB();

	// console.info("Database connected: ", dbClient.connected);

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
);`;
	await sql`CREATE EXTENSION IF NOT EXISTS timescaledb;`;
	await sql`SELECT create_hypertable('sensor_data_2','data_timestamp', if_not_exists => TRUE);`;

	try {
		// These sometimes throw because timescale is being silly
		await sql`ALTER TABLE sensor_data_2 SET (timescaledb.compress, timescaledb.compress_segmentby = 'sensor_website_id');`;
		await sql`SELECT add_compression_policy('sensor_data_2', INTERVAL '2 days', if_not_exists => TRUE);`;
	} catch (err) {
		console.error(`Error setting up table: ${err}`);
	}

	setInterval(async () => {
		let packetCount = 0;
		for (const { sensor, parsedData } of dbBuffer) {
			for (const packet of parsedData) {
				packetCount++;

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
		console.info(`Wrote ${packetCount} packets to DB`);
	}, 5 * 1000);
}
