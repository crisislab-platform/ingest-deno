/// <reference lib="webworker" />
// @deno-types="https://github.com/kriszyp/msgpackr/blob/master/index.d.ts"
import { pack } from "https://deno.land/x/msgpackr@v1.9.3/index.js";
import { DB } from "https://deno.land/x/sqlite@v3.7.2/mod.ts";

let dbBuffer: { sensor: Sensor; parsedData: any[] }[] = [];

self.addEventListener("message", (event: MessageEvent) => {
	dbBuffer.push(event.data);
});

function openDB(): DB {
	return new DB("sensor-data.db");
}

const db = openDB();
db.execute(/*sql*/ `
  CREATE TABLE IF NOT EXISTS sensor_data_v3 (
    sensor_website_id INTEGER NOT NULL,
	data_channel TEXT NOT NULL,
	data_timestamp REAL NOT NULL,
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
			const compressedData = pack(packet.slice(2).join(", "));
			const query = /*sql*/ `INSERT INTO sensor_data_v3 (sensor_website_id, data_channel, data_timestamp, data_values) VALUES (?, ?, ?, ?)`;
			db.query(query, [sensor.id, packet[0], packet[1], compressedData]);
		}
	}
	db.close();
	dbBuffer = [];
	console.info("Done saving data.");
}, 5 * 1000);
