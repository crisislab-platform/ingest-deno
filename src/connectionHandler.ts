import "./types.d.ts"; // goddamn typescript
import { fetchAPI } from "./utils.ts";

const clientsMap = new Map<number, Array<WebSocket>>();
const lastMessageTimestampMap = new Map<number, number>();
const onlineIDs = new Set<number>();
const ipToSensorMap = new Map<string, Sensor>();

// Update the sensor state in both the the online set and the API
async function setState(sensor: number, state: boolean) {
  console.log(`${sensor} state:`, state);
  if (state) {
    onlineIDs.add(sensor);
  } else {
    onlineIDs.delete(sensor);
  }

  const res = await fetchAPI("sensors/online", {
    method: "POST",
    body: JSON.stringify({ sensor, timestamp: Date.now(), state }),
  });

  if (res.status !== 200) {
    console.log("Error setting state:", await res.text());
  }
}

let lastUpdate = 0;

async function updateIpMap() {
  if (Date.now() - lastUpdate < 60 * 1000) return; // Wait for 1 minute before updating again

  console.log("Fetching IPs");

  lastUpdate = Date.now();

  const res = await fetchAPI("sensors");
  const json = await res.json();

  for (const sensor of Object.values(json.sensors) as Sensor[]) {
    if (!sensor.ip) continue;
    ipToSensorMap.set(sensor.ip, sensor);
  }

  console.log("ipMap", ipToSensorMap);
}

// Called when a sensor sends a UDP packet. Data is then forwarded to the websockets
export async function sensorHandler(addr: Deno.Addr, data: Uint8Array) {
  // First get the sensor id from the ip address
  const ip = addr as Deno.NetAddr;
  let sensorTemp = ipToSensorMap.get(ip.hostname);
  if (!sensorTemp) {
    await updateIpMap();
    sensorTemp = ipToSensorMap.get(ip.hostname);
    if (!sensorTemp) {
      console.log("Unknown sensor", ip.hostname);
      return;
    }
  }

  // Const is needed for type safety
  const sensor = sensorTemp;

  // Convert the data to a JSON array to make it easier for browser clients to parse
  const message = new TextDecoder().decode(data);
  const json = message.replaceAll("'", '"').replace("{", "[").replace("}", "]");

  lastMessageTimestampMap.set(sensor.id, Date.now());

  if (!onlineIDs.has(sensor.id)) {
    console.log("Sensor connected", sensor);
    setState(sensor.id, true);
    // TODO: Use one big global interval to check this
    // Check every 5 seconds if the sensor has sent a message in the last 10 seconds
    // If not, set the sensor to offline
    const interval = setInterval(() => {
      if ((lastMessageTimestampMap.get(sensor.id) || 0) < Date.now() - 10000) {
        setState(sensor.id, false);
        clearInterval(interval);
      }
    }, 5000);
  }

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
