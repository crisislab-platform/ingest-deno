import { loadSync } from "https://deno.land/std@0.197.0/dotenv/mod.ts";
import * as Sentry from "npm:@sentry/node";
import "./types.d.ts";
// @deno-types="https://github.com/kriszyp/msgpackr/blob/master/index.d.ts"
import { pack } from "https://deno.land/x/msgpackr@v1.9.3/index.js";
import { fetchAPI, getNewTokenWithRefreshToken, log } from "./utils.ts";

// Load .env file. This needs to happen before other files run
loadSync({ export: true });

const devMode = Boolean(parseInt(Deno.env.get("DEV") || "0"));

const dataWritingWorker = new Worker(
	new URL("./dataWritingWorker.ts", import.meta.url).href,
	{
		type: "module",
	}
);

const clientsMap = new Map<number, Array<WebSocket>>();
const lastMessageTimestampMap = new Map<number, number>();
const ipToSensorMap = new Map<string, Sensor>();
const duplicateIPSensors = new Map<number, number>();
let hasDownloadedSensorsYet = false;
log.info("Dev mode: ", devMode);

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
				Date.now() - (lastMessageTimestampMap.get(sensor.id) || 0) >
				2 * 60 * 1000 // 2 minutes
			) {
				setState({ sensorID: sensor.id, connected: false });
			} else {
				setState({ sensorID: sensor.id, connected: true });
			}
		}
	},
	60 * 1000 // Every minute
);

export function getSensor(_sensorID: number | string): Sensor | undefined {
	let sensorID = _sensorID;
	if (typeof _sensorID === "string") {
		try {
			sensorID = Number.parseInt(_sensorID);
		} catch (err) {
			log.warn("Failed to parse sensor ID: ", err);
			return undefined;
		}
	}

	for (const sensor of ipToSensorMap.values()) {
		if (sensor.id === sensorID) {
			return sensor;
		}
	}
	return undefined;
}

// Update the sensor state in both the the online set and the API
async function setState({
	sensorID,
	connected,
}: {
	sensorID: number;
	connected: boolean;
}) {
	const sensor = getSensor(sensorID);
	if (!sensor) return;

	// Avoid spamming the API by not updating things if they haven't changed.
	if (sensor.online === connected) return;

	let res;
	if (devMode) {
		res = { ok: true };
	} else {
		res = await fetchAPI("sensors/online", {
			method: "POST",
			body: JSON.stringify({
				sensor: sensorID,
				timestamp: Date.now(),
				connected,
			}),
		});
	}
	if (res.ok) {
		// Update sensor object
		sensor.online = connected;

		if (connected === true) {
			log.info(`Sensor connected: #${sensorID}`);
		} else {
			log.info(`Sensor disconnected: #${sensorID}`);
		}
	} else {
		log.warn("Error setting state:", await res.text());
	}
}

// Download sensor list from internship-worker
export async function downloadSensorList(): Promise<string | undefined> {
	let sensors;
	if (devMode) {
		sensors = { 3: JSON.parse(await Deno.readTextFile("dev-sensor.json")) };
	} else {
		// No try/catch here - we want it to throw & crash if this fetch fails
		const res = await fetchAPI("sensors");
		const json = await res.json();

		if (!json?.privileged) {
			log.error("Non-privileged response received from worker!");
			const success = await getNewTokenWithRefreshToken();
			// If it worked, try downloading again
			if (success) return await downloadSensorList();
			return "Invalid token! Unable to get privileged sensor data from worker.";
		}

		sensors = json.sensors as Record<string, Sensor>;
	}

	// Clear the Maps to prevent issues with the sensor being a duplicate of itself
	ipToSensorMap.clear();
	duplicateIPSensors.clear();
	for (const sensor of Object.values(sensors)) {
		if (sensor.ip) {
			const firstDuplicate = ipToSensorMap.get(sensor.ip);
			if (firstDuplicate) {
				duplicateIPSensors.set(sensor.id, firstDuplicate.id);
				closeSensorConnections(sensor.id);
			} else {
				ipToSensorMap.set(sensor.ip, sensor);
			}
		} else {
			log.warn(
				`Not including sensor #${sensor.id} because it doesn't have an IP set.`
			);
			closeSensorConnections(sensor.id);
		}
	}
	log.info(
		`Downloaded sensor list (${ipToSensorMap.size} sensors, ${duplicateIPSensors.size} duplicate)`
	);

	hasDownloadedSensorsYet = true;
}

function closeSensorConnections(sensorID: number) {
	const clients = clientsMap.get(sensorID);
	if (clients) {
		const firstDupeID = duplicateIPSensors.get(sensorID);
		clients.forEach((c) => {
			if (firstDupeID) {
				c.close(
					4409,
					`Sensor #${sensorID} has the same IP address set as sensor #${firstDupeID}. Make sure it has a unique IP set in the dashboard.`
				);
			} else
				c.close(
					4404,
					`Couldn't find a sensor with that ID (${sensorID}). Make sure it has a unique IP set in the dashboard.`
				);
		});
	}
	clientsMap.delete(sensorID);
}

// Called when a sensor sends a UDP packet. Data is then forwarded to the connected websockets
export function sensorHandler(addr: Deno.NetAddr, rawData: Uint8Array) {
	// First get the sensor id from the ip address
	const sensor = ipToSensorMap.get(addr.hostname);
	if (!sensor) {
		// Don't spam logs too much
		if (Math.random() < 0.001)
			log.info(
				`Packet received from unknown sensor IP address: ${addr.hostname}`
			);
		return;
	}

	try {
		// TODO: At some point in the future, get all this rubbish off
		// the main thread - we will suffer if we scale.

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

		// TODO: Change this to just send to all, and run the filtering separately
		// Send the message to all clients, and filter out the ones that have disconnected
		clientsMap.set(
			sensor.id,
			(clientsMap.get(sensor.id) || []).filter((client) => {
				try {
					// Handle race condition where a datagram is received
					// after a socket is started but before it fully opens
					if (client.readyState == WebSocket.OPEN)
						client.send(
							pack({
								type: "datagram",
								data: parsedData,
							})
						);
					else if (client.readyState == WebSocket.CONNECTING) {
						// Just drop this packet, but keep client in the list
						return true;
					} else return false;

					return true;
				} catch (err) {
					Sentry.captureException(err);
					log.error("Error sending packet: ", err);
					return false;
				}
			})
		);

		dataWritingWorker.postMessage({ sensor, parsedData });
	} catch (err) {
		Sentry.captureException(err);
		log.warn("Failure when parsing/forwarding datagram: ", err);
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
			log.info(`Connected websocket for sensor #${sensorID}`);

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
			log.info(
				`Couldn't connect websocket for sensor #${sensorID} - does it exist?`
			);
			if (hasDownloadedSensorsYet) {
				// If we've already downloaded the list, close the websocket.
				// Otherwise, keep it open in hope.
				closeSensorConnections(sensorID);
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
