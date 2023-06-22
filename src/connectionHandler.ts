// Load .env file. This needs to happen before other files run
import { loadSync } from "https://deno.land/std@0.178.0/dotenv/mod.ts";
loadSync({ export: true });

// Imports
import { DB } from "https://deno.land/x/sqlite@v3.7.2/mod.ts";
import "./types.d.ts"; // goddamn typescript
import { fetchAPI } from "./utils.ts";
// @deno-types="https://github.com/kriszyp/msgpackr/blob/master/index.d.ts"
import { pack } from "https://deno.land/x/msgpackr@v1.9.3/index.js";

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

const dbBuffer: { sensor: Sensor; parsedData: any[] }[] = [];

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
}, 5 * 1000);

const clientsMap = new Map<number, Array<WebSocket>>();
const lastMessageTimestampMap = new Map<number, number>();
const ipToSensorMap = new Map<string, Sensor>();
const devMode = Boolean(parseInt(Deno.env.get("DEV") || "0"));
let hasDownloadedSensorsYet = false;
console.info("Dev mode: ", devMode);

// if (devMode) {
// 	ipToSensorMap.set(
// 		"192.168.1.3",
// 		JSON.parse(await Deno.readTextFile("dev-sensor.json"))
// 	);
// }

// Every minute, check all sensors to see if they've sent message in the last 10 seconds.
// If not, set the sensor to offline
setInterval(
	() => {
		for (const sensor of ipToSensorMap.values()) {
			// If no messages in the last  2 minutes, set it as offline
			if (
				(lastMessageTimestampMap.get(sensor.id) || 0) <
				Date.now() - 2 * 60 * 1000 // 2 minutes
			) {
				setState({ sensorID: sensor.id, connected: false });
			} else {
				setState({ sensorID: sensor.id, connected: true });
			}
		}
	},
	60 * 1000 // Every minute
);

function getSensor(sensorID: number): Sensor | undefined {
	for (const sensor of ipToSensorMap.values()) {
		if (sensor.id === sensorID) {
			return sensor;
		}
	}
}

// Update the sensor state in both the the online set and the API
async function setState({
	sensorID,
	connected,
}: {
	sensorID: number;
	connected: boolean;
}) {
	// Avoid spamming the API by not updating things if they haven't changed.
	const sensor = getSensor(sensorID);
	if (sensor && sensor.online !== connected) {
		// Update sensor object
		sensor.online = connected;

		if (connected === true) {
			console.info(`Sensor connected: #${sensorID}`);
		} else {
			console.info(`Sensor disconnected: #${sensorID}`);
		}

		if (devMode) return;

		const res = await fetchAPI("sensors/online", {
			method: "POST",
			body: JSON.stringify({
				sensor: sensorID,
				timestamp: Date.now(),
				connected,
			}),
		});

		if (res.status !== 200) {
			console.warn("Error setting state:", await res.text());
		}
	}
}

// Download sensor list from internship-worker
export async function downloadSensorList(): Promise<string | undefined> {
	console.info("Fetching sensor list...");

	// if (devMode) {
	// 	return;
	// }

	let sensors;
	if (devMode) {
		sensors = { 3: JSON.parse(await Deno.readTextFile("dev-sensor.json")) };
	} else {
		const res = await fetchAPI("sensors");
		const json = await res.json();

		if (!json?.privileged) {
			console.error("Non-privileged response received from worker!");
			return "Invalid token! Unable to get privileged sensor data from worker.";
		}

		sensors = json.sensors;
	}

	for (const sensor of Object.values(sensors) as Sensor[]) {
		if (!sensor.ip) {
			const clients = clientsMap.get(sensor?.id);
			if (clients) {
				// Close clients for sensors that don't exist
				clients.forEach((c) =>
					c.close(
						4404,
						`Couldn't find a sensor with that ID (${sensor.id}). Make sure it has an IP set in the dashboard.`
					)
				);
			}
			continue;
		}
		ipToSensorMap.set(sensor.ip, sensor);
	}

	hasDownloadedSensorsYet = true;
}

// Called when a sensor sends a UDP packet. Data is then forwarded to the connected websockets
export function sensorHandler(addr: Deno.Addr, rawData: Uint8Array) {
	// First get the sensor id from the ip address
	const ip = addr as Deno.NetAddr;
	const sensor = ipToSensorMap.get(ip.hostname);
	if (!sensor) {
		// console.info(
		// 	`Packet received from unknown sensor IP address: ${ip.hostname}`
		// );
		return;
	}

	try {
		// Convert the data to a JSON array to make it easier for browser clients to parse
		const message = new TextDecoder().decode(rawData);
		const parsedData = JSON.parse(
			`[${message
				.replaceAll("'", '"')
				.replace("{", "[")
				.replace("}", "]")
				.replaceAll("][", "],[")}]`
		) as (string | number)[][];
		lastMessageTimestampMap.set(sensor.id, Date.now());

		setState({ sensorID: sensor.id, connected: true });

		// Send the message to all clients, and filter out the ones that have disconnected
		clientsMap.set(
			sensor.id,
			(clientsMap.get(sensor.id) || []).filter((client) => {
				try {
					client.send(
						pack({
							type: "datagram",
							data: parsedData,
						})
					);
					return true;
				} catch (_err) {
					return false;
				}
			})
		);

		if (sensor.id == 3) {
			dbBuffer.push({ sensor, parsedData });
		}
	} catch (err) {
		console.warn("Failure when parsing/forwarding datagram: ", err);
	}
}

// Handle websocket connections
export function clientWebSocketHandler(
	request: Request,
	sensorID: number
): Response {
	const { socket: client, response } = Deno.upgradeWebSocket(request);
	client.binaryType = "arraybuffer";

	const _sensorClients = clientsMap.get(sensorID);

	const sensorClients: WebSocket[] = _sensorClients
		? _sensorClients
		: (clientsMap.set(sensorID, []).get(sensorID) as WebSocket[]);

	sensorClients.push(client);

	client.addEventListener("open", () => {
		const sensor = getSensor(sensorID);

		if (sensor) {
			client.send(
				pack({
					type: "sensor-meta",
					data: {
						// Doing this manually to avoid sending sensitive data
						id: sensor.id,
						secondary_id: sensor.secondary_id,
						type: sensor.type,
						online: sensor.online,
					},
				})
			);
		} else {
			console.warn(`Couldn't find a sensor with that ID (${sensorID}).`);
			if (hasDownloadedSensorsYet) {
				// If we've already downloaded the list, close the websocket.
				// Otherwise, keep it open in hope.
				client.close(
					4404,
					`Couldn't find a sensor with that ID (${sensorID}). Make sure it has an IP set in the dashboard.`
				);
			} else {
				client.send(
					pack({
						type: "message",
						data: { message: "Awaiting sensor list..." },
					})
				);
			}
		}
	});

	client.addEventListener("close", () => {
		sensorClients.splice(sensorClients.indexOf(client), 1);
	});

	return response;
}
