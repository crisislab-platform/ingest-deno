/// <reference lib="webworker" />
import { getDB, log } from "./utils.ts";
const shouldStore = Boolean(parseInt(Deno.env.get("SHOULD_STORE") || "0"));
import * as Sentry from "npm:@sentry/node";

if (!shouldStore) {
	log.info("SHOULD_STORE is false, exiting data writing worker");
	self.close();
}

log.info("SHOULD_STORE is true, setting up database");

const sql = await getDB();

// log.info("Database connected: ", dbClient.connected);

let dbBuffer: {
	sensorID: number;
	parsedData: [string, number, ...number[]];
}[] = [];

async function flushBuffer() {
	log.info(`Flushing ${dbBuffer.length} packets to DB...`);
	const dbBufferCopy = dbBuffer;
	dbBuffer = [];

	const toInsert = [];
	for (const { sensorID, parsedData } of dbBufferCopy) {
		const channel = parsedData[0];
		const timestamp = parsedData[1];

		const rawDataValues = parsedData.slice(2) as number[];

		toInsert.push({
			sensor_website_id: sensorID,
			data_timestamp: timestamp,
			data_channel: channel,
			data_values: rawDataValues,
		});
	}

	if (toInsert.length > 0) {
		await sql`INSERT INTO sensor_data_3 ${sql(
			toInsert,
			"sensor_website_id",
			"data_timestamp",
			"data_channel",
			"data_values"
		)};`;
	}
	log.info(`Wrote ${dbBufferCopy.length} packets to DB`);
}

self.addEventListener("message", (event: MessageEvent) => {
	dbBuffer.push(event.data);
	try {
		if (dbBuffer.length >= 2500) flushBuffer();
	} catch (err) {
		log.warn("Error flushing buffer to DB: ", err);
		Sentry.captureException(err);
	}
});

try {
	// These sometimes throw because timescale is being silly
	await sql`ALTER TABLE sensor_data_3 SET (timescaledb.compress, timescaledb.compress_segmentby = 'sensor_website_id');`;
	await sql`SELECT add_compression_policy('sensor_data_3', INTERVAL '2 days', if_not_exists => TRUE);`;
} catch (err) {
	log.error(`Error setting up table: ${err}`);
}
