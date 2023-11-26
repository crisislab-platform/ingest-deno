import { loadSync } from "https://deno.land/std@0.197.0/dotenv/mod.ts";
import * as Sentry from "npm:@sentry/node";
import "./types.d.ts";
import { pack } from "npm:msgpackr@1.9.9";
import { fetchAPI, getNewTokenWithRefreshToken, log } from "./utils.ts";
import { IRequest } from "itty-router";
import { SensorMeta } from "./api/apiUtils.ts";
import { ServerSensor } from "./types.d.ts";

// Load .env file. This needs to happen before other files run
loadSync({ export: true });

const devMode = Boolean(parseInt(Deno.env.get("DEV") || "0"));

const dataWritingWorker = new Worker(
	new URL("./dataWritingWorker.ts", import.meta.url).href,
	{
		type: "module",
	}
);

const ipToSensorMap = new Map<string, ServerSensor>();
let downloadError: string | undefined;

const sensorAPIHitMinimumGap = 1000 * 10 * 60; // 10 minutes

log.info("Dev mode: ", devMode);

// Get an access token
if (!(await getNewTokenWithRefreshToken()))
	throw "Error getting token with refresh token on startup.";

// Get the list of sensors.
// Need to do this first thing to avoid spamming stuff.
downloadError = await downloadSensorList();

export function downloadErrorMiddleware() {
	if (downloadError) return new Response(downloadError, { status: 500 });
}

// if (devMode) {
// 	ipToSensorMap.set(
// 		"192.168.1.3",
// 		JSON.parse(await Deno.readTextFile("dev-sensor.json"))
// 	);
// }

// Every minute, check all sensors to see if they've sent message in the last 10 seconds.
// If not, set the sensor to offline
setInterval(
	async () => {
		// First re-download sensor list
		log.info("About to download sensor list from interval");
		downloadError = await downloadSensorList();

		// Then go through map
		log.info("About to update sensor statuses from interval");
		for (const sensor of ipToSensorMap.values()) {
			// If no messages in the last  2 minutes, set it as offline
			if (
				Date.now() - (sensor.lastMessageTimestamp || 0) >
				5 * 60 * 1000 // 5 minutes
			) {
				setState({ sensorID: sensor.id, connected: false });
			} else {
				setState({ sensorID: sensor.id, connected: true });
			}
		}
	},
	10 * 60 * 1000 // Every 10 minutes to avoid hammering infra
);

export function getSensor(
	_sensorID: number | string
): ServerSensor | undefined {
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

	if (Date.now() - sensor.lastHitAPI < sensorAPIHitMinimumGap) return;
	sensor.lastHitAPI = Date.now();

	// Avoid spamming the API by not updating things if they haven't changed.
	if (sensor.meta?.online === connected) return;

	let res;
	if (devMode) {
		res = { ok: true, text() {} };
	} else {
		res = await fetchAPI("sensors/online", {
			method: "POST",
			body: JSON.stringify({
				sensor: sensorID,
				timestamp: sensor.lastMessageTimestamp ?? Date.now(),
				connected,
			}),
		});
	}
	if (res.ok) {
		// Update sensor object
		sensor.meta.online = connected;

		if (connected === true) {
			log.info(`Sensor connected: #${sensor.id}`);
		} else {
			log.info(`Sensor disconnected: #${sensor.id}`);
		}
	} else {
		log.warn(`Error setting state for sensor #${sensor.id}:`, await res.text());
	}
}

// Download sensor list from internship-worker
export async function downloadSensorList(): Promise<string | undefined> {
	let rawSensors: Record<string, SensorMeta>;
	if (devMode) {
		rawSensors = JSON.parse(await Deno.readTextFile("dev-sensors.json"));
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

		rawSensors = json.sensors;
	}

	// Clear the Maps to prevent issues with the sensor being a duplicate of itself
	for (const rawSensor of Object.values(rawSensors)) {
		if (rawSensor?.ip) {
			let sensorBase = ipToSensorMap.get(rawSensor.ip);

			if (!sensorBase) {
				sensorBase = {
					id: rawSensor.id,
					webSocketClients: [],
					meta: rawSensor,
					lastHitAPI: 0,
				};
				ipToSensorMap.set(rawSensor.ip, sensorBase);
			} else if (sensorBase.id !== rawSensor.id) {
				sensorBase.isDuplicateOf = rawSensor.id;
			} else {
				sensorBase.meta = rawSensor;
			}
		} else {
			log.warn(
				`Not including sensor #${rawSensor.id} because it doesn't have an IP set.`
			);
		}
	}
	log.info(`Downloaded sensor list (${ipToSensorMap.size} sensors)`);
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
		const split = message.slice(1, -1).split(", ");
		const channel = split[0].slice(1, -1);
		const timestamp = Number(split[1]);
		const values = split.slice(2).map((v) => Number(v));

		// Keep the sensor showing as online
		sensor.lastMessageTimestamp = timestamp * 1000;

		setState({ sensorID: sensor.id, connected: true });

		// Reconstruct the original data shape
		const parsedData: [string, number, ...number[]] = [
			channel,
			timestamp,
			...values,
		];

		// TODO: Change this to just send to all, and run the filtering separately
		// Send the message to all clients, and filter out the ones that have disconnected
		sensor.webSocketClients = (sensor.webSocketClients || []).filter(
			(client) => {
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
			}
		);

		dataWritingWorker.postMessage({ sensorID: sensor.id, parsedData });
	} catch (err) {
		Sentry.captureException(err);
		log.warn(
			`Failure when parsing/forwarding datagram from ${addr.hostname}: `,
			err
		);
	}
}

// Handle websocket connections
export function handleWebSockets(request: IRequest): Response {
	if (request.headers.get("Upgrade") !== "websocket") {
		return new Response("Needs websocket Upgrade header", { status: 400 });
	}

	let sensorID: number;
	try {
		sensorID = parseInt(request?.params?.id);
		if (isNaN(sensorID))
			return new Response("Invalid sensor ID", { status: 400 });
	} catch (err) {
		log.warn("Failed to get sensor ID from URL: ", err);
		return new Response("Failed to get sensor ID from URL", { status: 400 });
	}

	const sensor = getSensor(sensorID);

	const { socket: client, response } = Deno.upgradeWebSocket(request);
	client.binaryType = "arraybuffer";

	// We can't just send a regular 404 response,
	// we have to send a custom close message over the websocket,
	// otherwise the client can't understand it.
	if (!sensor) {
		client.addEventListener("open", () => {
			client.close(4404, `Couldn't find a sensor with that id (#${sensorID})`);
		});
		return response;
	}

	sensor.webSocketClients.push(client);

	client.addEventListener("open", () => {
		log.info(`Connected websocket for sensor #${sensorID}`);

		client.send(
			pack({
				type: "sensor-meta",
				data: {
					// Doing this manually to avoid sending sensitive data
					id: sensor.id,
					secondary_id: sensor.meta?.secondary_id,
					type: sensor.meta?.type,
					online: sensor.meta?.online,
				},
			})
		);
	});

	client.addEventListener("close", () => {
		sensor.webSocketClients.splice(sensor.webSocketClients.indexOf(client), 1);
	});

	return response;
}
