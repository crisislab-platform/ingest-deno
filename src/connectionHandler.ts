import "./types.d.ts"; // goddamn typescript
import { fetchAPI } from "./utils.ts";

const devMode = Boolean(Deno.env.get("DEV"));

const clientsMap = new Map<number, Array<WebSocket>>();
const lastMessageTimestampMap = new Map<number, number>();
const ipToSensorMap = new Map<string, Sensor>();

if (devMode) {
	ipToSensorMap.set("192.168.1.3", {
		_id: "62bade2be7a35b6a25b55cb7",
		id: 3,
		SI: 5000,
		segmentDuration: 25,
		packetLength: 50,
		online: false,
		type: "Raspberry Shake 4D",
		geoFeatures: {
			id: "address.1361664119000500",
			type: "Feature",
			place_type: ["address"],
			relevance: 1,
			properties: {
				accuracy: "point",
			},
			text: "Ngaio Road",
			place_name: "23 Ngaio Road, Kelburn, Wellington 6012, New Zealand",
			center: [174.7631385, -41.2860664],
			geometry: {
				type: "Point",
				coordinates: [174.7631385, -41.2860664],
			},
			address: "23",
			context: [
				{
					id: "postcode.18137773744869070",
					text: "6012",
				},
				{
					id: "locality.8131085753785140",
					text: "Kelburn",
				},
				{
					id: "place.13409477143181890",
					wikidata: "Q23661",
					text: "Wellington",
				},
				{
					id: "region.16657726640200620",
					short_code: "NZ-WGN",
					wikidata: "Q856010",
					text: "Wellington",
				},
				{
					id: "country.3612777343649920",
					wikidata: "Q664",
					short_code: "nz",
					text: "New Zealand",
				},
			],
		},
		location: {
			type: "Point",
			coordinates: [174.8205568, -41.3270016],
		},
		name: "Zade 1 - being fixed",
		elevation: 0,
		total_floors: 0,
		on_floor: 0,
		secondary_id: "AM.RCB47.00",
		port: null,
		ip: "192.168.1.3",
		timestamp: 1678492758141,
		publicLocation: [174.82027, -41.32732],
		latitude: -41.3270016,
		longitude: 174.8205568,
		publicGeoFeatures: {
			id: "address.7191551292873338",
			type: "Feature",
			place_type: ["address"],
			relevance: 1,
			properties: {
				accuracy: "point",
				mapbox_id:
					"dXJuOm1ieGFkcjo5MDczM2M3NC1lNGJlLTQxMTYtYWQyOS1mYTliYTYzZDA1NDc=",
			},
			text: "Strathmore Avenue",
			place_name:
				"52 Strathmore Avenue, Strathmore Park, Wellington 6022, New Zealand",
			center: [174.8203545, -41.3272984],
			geometry: {
				type: "Point",
				coordinates: [174.8203545, -41.3272984],
			},
			address: "52",
			context: [
				{
					id: "postcode.5942957",
					mapbox_id: "dXJuOm1ieHBsYzpXcTZ0",
					text: "6022",
				},
				{
					id: "locality.33278637",
					mapbox_id: "dXJuOm1ieHBsYzpBZnZLclE",
					text: "Strathmore Park",
				},
				{
					id: "place.2721965",
					wikidata: "Q23661",
					mapbox_id: "dXJuOm1ieHBsYzpLWWl0",
					text: "Wellington",
				},
				{
					id: "region.132269",
					short_code: "NZ-WGN",
					wikidata: "Q856010",
					mapbox_id: "dXJuOm1ieHBsYzpBZ1N0",
					text: "Wellington",
				},
				{
					id: "country.8877",
					short_code: "nz",
					wikidata: "Q664",
					mapbox_id: "dXJuOm1ieHBsYzpJcTA",
					text: "New Zealand",
				},
			],
		},
	});
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

// Every hour, re-download the sensor list
setInterval(
	() => {
		downloadSensorList();
	},
	60 * 60 * 1000 // 1 hour
);

function getSensor(sensorID: number): Sensor | undefined {
	return [...ipToSensorMap.values()].find((s) => s.id === sensorID);
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
let lastUpdate = 0;
export async function downloadSensorList() {
	if (Date.now() - lastUpdate < 60 * 60 * 1000) return; // Wait for an hour

	console.info("Fetching sensor list...");

	lastUpdate = Date.now();

	if (devMode) {
		return;
	}

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
		// If we don't recognise it, it might be new - download the list.
		await downloadSensorList();
		sensorTemp = ipToSensorMap.get(ip.hostname);
		if (!sensorTemp) {
			console.info(
				`Packet received from unknown sensor IP address: ${ip.hostname}`
			);
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
export function clientHandler(request: Request, sensorId: number): Response {
	const sensor = getSensor(sensorId);

	if (!sensor) {
		return new Response("Couldn't find a sensor with that ID", { status: 404 });
	}

	const { socket, response } = Deno.upgradeWebSocket(request);

	const _sensorClients = clientsMap.get(sensorId);

	const sensorClients: WebSocket[] = _sensorClients
		? _sensorClients
		: (clientsMap.set(sensorId, []).get(sensorId) as WebSocket[]);

	sensorClients.push(socket);

	socket.send(
		JSON.stringify({
			type: "sensor-meta",
			data: sensor,
		})
	);

	socket.addEventListener("close", () => {
		sensorClients.splice(sensorClients.indexOf(socket), 1);
	});

	return response;
}
