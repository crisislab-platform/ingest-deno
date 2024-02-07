/// <reference lib="webworker" />
import { getDB, log } from "./utils.ts";
const shouldStore = Boolean(parseInt(Deno.env.get("SHOULD_STORE") || "0"));
import * as Sentry from "sentry";

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

	const toInsert = dbBufferCopy.map(({ sensorID, parsedData }) => ({
		sensor_id: sensorID,
		data_timestamp: parsedData[1],
		data_channel: parsedData[0],
		data_values: parsedData.slice(2) as number[],
	}));

	if (toInsert.length > 0) {
		log.info(`Inserting ${toInsert.length} records into to DB...`);

		try {
			const query = sql`INSERT INTO sensor_data_4 ${sql(
				toInsert,
				"sensor_id",
				"data_timestamp",
				"data_channel",
				"data_values"
			)};`;

			await query.execute();
		} catch (err) {
			log.error("Error inserting data! ", err);
		}
	}
	log.info(`Flushed ${dbBufferCopy.length} packets to DB`);
}

self.addEventListener("message", (event: MessageEvent) => {
	dbBuffer.push(event.data);
	try {
		if (dbBuffer.length >= 2500) flushBuffer();
	} catch (err) {
		Sentry.captureException(err);
		log.warn("Error flushing buffer to DB: ", err);
	}
});
