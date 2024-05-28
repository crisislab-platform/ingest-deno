import { loadSync } from "https://deno.land/std@0.197.0/dotenv/mod.ts";
import * as Sentry from "sentry";
import "./types.ts";
import { pack } from "msgpackr";
import { getDB, log } from "./utils.ts";
import { IRequest } from "itty-router";
import { ServerSensor, WithRequired, PrivateSensorMeta } from "./types.ts";

// Load .env file. This needs to happen before other files run
loadSync({ export: true });

const devMode = Boolean(parseInt(Deno.env.get("DEV") || "0"));

const dataWritingWorker = new Worker(
	new URL("./dataWritingWorker.ts", import.meta.url).href,
	{
		type: "module",
		name: "DB Buff&Flush",
	}
);

const ipToSensorMap = new Map<string, ServerSensor>();

log.info("Dev mode: ", devMode);

// Get the list of sensors.
// Need to do this first thing to avoid spamming stuff.
await updateSensorCache();

// if (devMode) {
// 	ipToSensorMap.set(
// 		"192.168.1.3",
// 		JSON.parse(await Deno.readTextFile("dev-sensor.json"))
// 	);
// }

// Every 2 minutes remove zombie websocket connections
// Every 15 seconds update the in-memory sensor cache
setInterval(() => {
	//Update cache
	log.info("Clearing zombie WebSockets");

	for (const [, { webSocketClients }] of ipToSensorMap) {
		for (const client of webSocketClients) {
			if (
				client.readyState === WebSocket.OPEN ||
				client.readyState === WebSocket.CONNECTING
			)
				continue;

			const index = webSocketClients.indexOf(client);
			if (index !== -1) {
				webSocketClients.splice(index, 1);
			}
		}
	}
}, 2 * 60 * 1000);

// Every 15 seconds update the in-memory sensor cache
setInterval(async () => {
	//Update cache
	await updateSensorCache();
}, 15 * 1000);

// Every minute, check all sensors to see if they've sent message in the last 10 seconds.
// If not, set the sensor to offline
setInterval(
	async () => {
		const sql = await getDB();

		// Then go through map
		let nowOnline = 0;
		let nowOffline = 0;
		for (const sensor of ipToSensorMap.values()) {
			// If no messages in the last 3 minutes, set it as offline
			if (
				Date.now() - (sensor.lastMessageTimestamp || 0) >
				3 * 60 * 1000 // 3 minutes
			) {
				if (
					await updateSensorOnlineStatus({ sensorID: sensor.id, online: false })
				)
					nowOffline++;
			} else {
				if (
					await updateSensorOnlineStatus({ sensorID: sensor.id, online: true })
				)
					nowOnline++;
			}
		}
		const online = (
			await sql`SELECT count(online) FROM sensors WHERE online IS TRUE AND removed IS NOT TRUE;`
		)?.[0]?.["count"];
		const offline = (
			await sql`SELECT count(online) FROM sensors WHERE online IS FALSE AND removed IS NOT TRUE;`
		)?.[0]?.["count"];

		log.info(
			`Updated sensor connection statuses. Online: ${online} (${
				nowOnline >= 0 ? "+" : ""
			}${nowOnline}); Offline: ${offline} (${
				nowOffline >= 0 ? "+" : ""
			}${nowOffline})`
		);
	},
	60 * 1000 // Every minute
);

function getSensorFromCacheByID(
	_sensorID: number | string
): ServerSensor | undefined {
	let sensorID = _sensorID;
	if (typeof _sensorID === "string") {
		try {
			sensorID = Number.parseInt(_sensorID.trim());
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
// Returns a boolean of weather the status changed
async function updateSensorOnlineStatus({
	sensorID,
	online,
}: {
	sensorID: number;
	online: boolean;
}): Promise<boolean> {
	const sensor = getSensorFromCacheByID(sensorID);

	if (!sensor) return false;

	// Avoid spamming the API by not updating things if they haven't changed.
	if (sensor.meta.online === online) return false;

	try {
		const sql = await getDB();

		await sql`UPDATE sensors SET ${sql({
			status_change_timestamp: sensor.lastMessageTimestamp ?? Date.now(),
			online,
		})} WHERE id=${sensor.id};`;

		sensor.meta.online = online;

		log.info(`Sensor #${sensor.id} now ${online ? "online" : "offline"}`);
		return true;
	} catch (err) {
		Sentry.captureException(err);
		log.warn(`Error setting state for sensor #${sensor.id}:`, err);
		return false;
	}
}

// Update in-memory cache of sensors
async function updateSensorCache() {
	log.info("Updating sensor cache...");
	const sql = await getDB();
	const sensorsQuery = sql<
		WithRequired<PrivateSensorMeta, "ip">[]
	>`SELECT DISTINCT ON (ip) * FROM sensors WHERE ip IS NOT NULL AND removed IS NOT TRUE;`.execute();

	const timeout = setTimeout(() => {
		sensorsQuery;
		// Cancel the query if it's taking too long.
		// This indicates a bigger issue
		log.warn("Cancelling slow query! This indicates a bigger issue!");
		sensorsQuery.cancel();
	}, 5000);

	const sensors = await sensorsQuery;
	clearTimeout(timeout);

	const mapCopy = new Map(ipToSensorMap);

	// Clear the Maps to prevent issues with the sensor being a duplicate of itself
	ipToSensorMap.clear();

	for (const meta of sensors) {
		const sensorClients = mapCopy.get(meta.ip)?.webSocketClients || [];

		const sensor = {
			id: meta.id,
			webSocketClients: sensorClients,
			meta,
		};
		ipToSensorMap.set(meta.ip, sensor);
	}
	log.info(`Updated cached sensor list (${ipToSensorMap.size} sensors)`);
}

let counter = 0;

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

	counter++;
	if (counter > 1000) {
		log.log("Latest 1000th packet received came from " + addr.hostname);
		counter = 0;
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

		updateSensorOnlineStatus({ sensorID: sensor.id, online: true });

		// Reconstruct the original data shape
		const parsedData: [string, number, ...number[]] = [
			channel,
			timestamp,
			...values,
		];

		// Saving the data is important and fast since it's on another thread
		dataWritingWorker.postMessage({ sensorID: sensor.id, parsedData });

		// Send the message to all clients, and filter out the ones that have disconnected
		for (const client of sensor.webSocketClients) {
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
			} catch (err) {
				Sentry.captureException(err);
				log.error("Error sending packet: ", err);
			}
		}
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

	const sensor = getSensorFromCacheByID(sensorID);

	const { socket: client, response } = Deno.upgradeWebSocket(request);
	client.binaryType = "arraybuffer";

	// We can't just send a regular 404 response,
	// we have to send a custom close message over the websocket,
	// otherwise the client can't understand it.
	if (!sensor) {
		log.info(`Couldn't find requested sensor #${sensorID}`);
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
