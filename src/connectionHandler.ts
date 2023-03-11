import "./types.d.ts"; // goddamn typescript
import { fetchAPI } from "./utils.ts";

// Load .env file
import "https://deno.land/std@0.178.0/dotenv/load.ts";

const clientsMap = new Map<number, Array<WebSocket>>();
const lastMessageTimestampMap = new Map<number, number>();
const onlineIDs = new Set<number>();
const ipToSensorMap = new Map<string, Sensor>();

// Every 5 seconds, check all sensors to see if they've sent message in the last 10 seconds.
// If not, set the sensor to offline
const _offlineCheckInterval = setInterval(() => {
	for (const sensor of ipToSensorMap.values()) {
		if ((lastMessageTimestampMap.get(sensor.id) || 0) < Date.now() - 10000) {
			setState({ sensorID: sensor.id, connected: false });
		} else {
			setState({ sensorID: sensor.id, connected: true });
		}
	}
}, 5000);

// Update the sensor state in both the the online set and the API
async function setState({
	sensorID,
	connected,
	forceUpdate = false,
}: {
	sensorID: number;
	connected: boolean;
	forceUpdate?: boolean;
}) {
	// Avoid spamming the API by not updating things if they haven't changed.
	const currentlyConnected = onlineIDs.has(sensorID);
	if (forceUpdate || connected !== currentlyConnected) {
		if (connected === true) {
			onlineIDs.add(sensorID);
			console.info(`Sensor connected: # ${sensorID}`);
		} else {
			// Remove from online list
			onlineIDs.delete(sensorID);

			console.info(`Sensor disconnected: # ${sensorID}`);
		}

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
let lastUpdate = 0;
export async function updateIpMap() {
	if (Date.now() - lastUpdate < 60 * 1000) return; // Wait for 1 minute before updating again

	console.info("Fetching sensor list...");

	lastUpdate = Date.now();

	const res = await fetchAPI("sensors");
	const json = await res.json();

	for (const sensor of Object.values(json.sensors) as Sensor[]) {
		if (!sensor.ip) continue;
		ipToSensorMap.set(sensor.ip, sensor);
	}
}

// Called when a sensor sends a UDP packet. Data is then forwarded to the connected websockets
export async function sensorHandler(addr: Deno.Addr, data: Uint8Array) {
	// First get the sensor id from the ip address
	const ip = addr as Deno.NetAddr;
	let sensorTemp = ipToSensorMap.get(ip.hostname);
	if (!sensorTemp) {
		await updateIpMap();
		sensorTemp = ipToSensorMap.get(ip.hostname);
		if (sensorTemp) {
			// Aways update the state when a new sensor connects
			setState({ sensorID: sensorTemp.id, connected: true, forceUpdate: true });
		} else {
			console.info(`Packet received from unknown sensor: ip: ${ip.hostname}`);
			return;
		}
	}

	// Const is needed for type safety
	const sensor = sensorTemp;

	// Convert the data to a JSON array to make it easier for browser clients to parse
	const message = new TextDecoder().decode(data);
	const json = message.replaceAll("'", '"').replace("{", "[").replace("}", "]");

	lastMessageTimestampMap.set(sensor.id, Date.now());

	setState({ sensorID: sensor.id, connected: true });

	// Send the message to all clients, and filter out the ones that have disconnected
	clientsMap.set(
		sensor.id,
		(clientsMap.get(sensor.id) || []).filter((client) => {
			try {
				client.send(json);
				return true;
			} catch (_err) {
				return false;
			}
		})
	);
}

// Handle websocket connections
export function clientHandler(request: Request, sensorId: number) {
	const { socket, response } = Deno.upgradeWebSocket(request);

	let sensorClients = clientsMap.get(sensorId);

	if (!sensorClients) {
		sensorClients = [];
		clientsMap.set(sensorId, sensorClients);
	}

	sensorClients.push(socket);

	socket.addEventListener("close", () => {
		sensorClients!.splice(sensorClients!.indexOf(socket), 1);
	});

	return response;
}
