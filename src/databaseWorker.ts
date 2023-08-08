/// <reference lib="webworker" />
import { Client as DBClient } from "https://deno.land/x/postgres@v0.17.0/mod.ts";

const dbClient = new DBClient({
	user: Deno.env.get("DATABASE_USERNAME"),
	password: Deno.env.get("DATABASE_PASSWORD"),
	database: "sensor_data",
	hostname: "localhost",
	port: 5432,
});
await dbClient.connect();

console.log("Database connected: ", dbClient.connected);
console.log("Should store to database: ", Deno.env.get("SHOULD_STORE"));

self.addEventListener("unload", async () => {
	await dbClient.end();
});

let dbBuffer: {
	sensor: Sensor;
	parsedData: [string, number, ...number[]][];
}[] = [];
self.addEventListener("message", (event: MessageEvent) => {
	dbBuffer.push(event.data);
});

await dbClient.queryArray(/*sql*/ `
CREATE TABLE IF NOT EXISTS sensor_data (
	sensor_website_id int NOT NULL,
	data_timestamp timestamptz NOT NULL,
	data_channel char(3),
	counts_values int[]
);
`);

setInterval(async () => {
	if (!parseInt(Deno.env.get("SHOULD_STORE") || "0")) return;
	console.info("Starting to save data to DB...");
	for (const { sensor, parsedData } of dbBuffer) {
		for (const packet of parsedData) {
			const channel = packet[0];
			const timestamp = packet[1] * 1000;

			const rawDataValues = packet.slice(2) as number[];

			await dbClient.queryArray/*sql*/ `
			INSERT INTO sensor_data (sensor_website_id, data_timestamp, data_channel, counts_values) 
							 VALUES (${sensor.id}, to_timestamp(${timestamp}), ${channel}, ${rawDataValues});`;
		}
	}
	dbBuffer = [];
	console.info("Done saving data.");
}, 5 * 1000);
