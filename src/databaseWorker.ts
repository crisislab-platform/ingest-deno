/// <reference lib="webworker" />

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
  CREATE TABLE IF NOT EXISTS sensor_data (
    record_id INTEGER PRIMARY KEY AUTOINCREMENT,
    sensor_website_id INTEGER NOT NULL,
	sensor_station_id TEXT,
	sensor_type TEXT,
	sensor_ip TEXT NOT NULL,
	data_channel TEXT NOT NULL,
	data_timestamp REAL NOT NULL,
	data_values TEXT NOT NULL
  )
`);
db.close();

setInterval(() => {
	if (!Deno.env.get("SHOULD_STORE")) return;

	const db = openDB();
	for (const { sensor, parsedData } of dbBuffer) {
		for (const packet of parsedData) {
			const query = /*sql*/ `INSERT INTO sensor_data (sensor_website_id, sensor_station_id, sensor_type, sensor_ip, data_channel, data_timestamp, data_values)
			VALUES (${sensor.id}, '${sensor.secondary_id}', '${sensor.type}',
			'${sensor.ip}', '${packet[0]}', ${packet[1]}, '${packet.slice(2).join(", ")}')
			`;
			db.execute(query);
		}
	}
	db.close();

	dbBuffer = [];
}, 5 * 1000);
