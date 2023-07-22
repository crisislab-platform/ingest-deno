/// <reference lib="webworker" />
import { DB } from "https://deno.land/x/sqlite@v3.7.2/mod.ts";

import { deflate } from "https://deno.land/x/compress@v0.4.4/mod.ts";
import { pack } from "https://deno.land/x/msgpackr@v1.9.3/index.js";
import { toDeltas } from "../lib/compress.ts";

let dbBuffer: {
	sensor: Sensor;
	parsedData: [string, number, ...number[]][];
}[] = [];

self.addEventListener("message", (event: MessageEvent) => {
	dbBuffer.push(event.data);
});

function openDB(): DB {
	return new DB("sensor-data.db");
}

const db = openDB();
db.execute(/*sql*/ `
  CREATE TABLE IF NOT EXISTS sensor_data_v4 (
    sensor_website_id INTEGER NOT NULL,
	data_channel TEXT NOT NULL,
	data_timestamp INTEGER NOT NULL,
	data_values BLOB NOT NULL
  )
`);
db.close();

setInterval(() => {
	if (!Deno.env.get("SHOULD_STORE")) return;
	console.info("Starting to save data to DB...");
	const db = openDB();
	for (const { sensor, parsedData } of dbBuffer) {
		for (const packet of parsedData) {
			const channel = packet[0];
			const timestamp = packet[1] * 1000;

			const dataToCompress = packet.slice(2) as number[];

			const deltas = toDeltas(dataToCompress);

			const compressedData = deflate(pack(deltas));

			const query = /*sql*/ `INSERT INTO sensor_data_v4 (sensor_website_id, data_channel, data_timestamp, data_values) VALUES (?, ?, ?, ?)`;
			db.query(query, [sensor.id, channel, timestamp, compressedData]);
		}
	}
	db.close();
	dbBuffer = [];
	console.info("Done saving data.");
}, 5 * 1000);
