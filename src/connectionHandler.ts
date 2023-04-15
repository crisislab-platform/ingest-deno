// Load .env file. This needs to happen before other files run
import { loadSync } from "https://deno.land/std@0.178.0/dotenv/mod.ts";
loadSync({ export: true });

// Imports
import "./types.d.ts"; // goddamn typescript
import { fetchAPI } from "./utils.ts";
// @deno-types="https://github.com/kriszyp/msgpackr/blob/master/index.d.ts"
import { pack } from "https://deno.land/x/msgpackr@v1.8.3/index.js";

const clientsMap = new Map<number, Array<WebSocket>>();
const lastMessageTimestampMap = new Map<number, number>();
const ipToSensorMap = new Map<string, Sensor>();
const devMode = Boolean(parseInt(Deno.env.get("DEV") || "0"));
console.info("Dev mode: ", devMode);

if (devMode) {
	ipToSensorMap.set(
		"192.168.1.3",
		JSON.parse(await Deno.readTextFile("dev-sensor.json"))
	);
}

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

// Every 30 minutes, re-download the sensor list
setInterval(
	() => {
		downloadSensorList();
	},
	30 * 60 * 1000 // 1 hour
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
	if (sensor && connected !== sensor.online) {
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
export async function downloadSensorList() {
	console.info("Fetching sensor list...");

	// if (devMode) {
	// 	return;
	// }

	const res = await fetchAPI("sensors");
	const json = await res.json();

	for (const sensor of Object.values(json.sensors) as Sensor[]) {
		if (!sensor.ip) continue;
		ipToSensorMap.set(sensor.ip, sensor);
	}
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
		);
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
	} catch (err) {
		console.warn("Failure when parsing/forwarding datagram: ", err);
	}
}

// Handle websocket connections
export function clientWebSocketHandler(
	request: Request,
	sensorID: number
): Response {
	const { socket, response } = Deno.upgradeWebSocket(request);
	socket.binaryType = "arraybuffer";

	const _sensorClients = clientsMap.get(sensorID);

	const sensorClients: WebSocket[] = _sensorClients
		? _sensorClients
		: (clientsMap.set(sensorID, []).get(sensorID) as WebSocket[]);

	sensorClients.push(socket);

	socket.addEventListener("open", () => {
		const sensor = getSensor(sensorID);

		if (sensor) {
			socket.send(
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
			socket.close(
				4404,
				`Couldn't find a sensor with that ID (${sensorID}). Make sure it has an IP set in the dashboard.`
			);
		}
	});

	socket.addEventListener("close", () => {
		sensorClients.splice(sensorClients.indexOf(socket), 1);
	});

	return response;
}
