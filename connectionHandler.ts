const clients = new Map<number, Array<WebSocket>>();

const lastMessage = new Map<number, number>();
const online = new Set<number>();
const ipMap = new Map<string, Sensor>();

function _setState(sensor: number, state: boolean) {
  console.log(`${sensor} state:`, state);
  if (state) {
    online.add(sensor);
  } else {
    online.delete(sensor);
  }

  fetch("https://internship-worker.benhong.workers.dev/api/v0/sensors/online", {
    headers: {
      authorization: "bearer eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlcyI6WyJzZW5zb3JzOm9ubGluZSJdLCJlbWFpbCI6ImluZ2VzdEBiZW5ob25nLm1lIiwibmFtZSI6IkxpdmUgRGF0YSBTZXJ2ZXIiLCJpYXQiOjE2NTczNDEzMjEuODY1LCJleHAiOjE2ODg4NzczMjEuODY1LCJpc3MiOiJodHRwczovL2NyaXNpc2xhYi5vcmcubnoiLCJhdWQiOlsiYWRtaW4iXX0=.9jaINkWZNNT3iMvq-XmsNVv4ARiEFkzZA8lD_2Uw2F6dXZ-EbwK1FVzDlG8AZLlozmOXtc6YX3O52u8Tm6oEiw"
    },
    method: "POST",
    body: JSON.stringify({ sensor, timestamp: Date.now(), state })
  }).then((res) => { console.log(res.status); res.text().then(a => console.log(a)) }).catch((err) => { console.log(err); });
}

let lastUpdate = 0;

async function updateIpMap() {
  if (Date.now() - lastUpdate < 60000) return;
  const res = await fetch("https://internship-worker.benhong.workers.dev/api/v0/sensors", {
    headers: {
      authorization: "bearer eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlcyI6WyJzZW5zb3JzOm9ubGluZSJdLCJlbWFpbCI6ImluZ2VzdEBiZW5ob25nLm1lIiwibmFtZSI6IkxpdmUgRGF0YSBTZXJ2ZXIiLCJpYXQiOjE2NTczNDEzMjEuODY1LCJleHAiOjE2ODg4NzczMjEuODY1LCJpc3MiOiJodHRwczovL2NyaXNpc2xhYi5vcmcubnoiLCJhdWQiOlsiYWRtaW4iXX0=.9jaINkWZNNT3iMvq-XmsNVv4ARiEFkzZA8lD_2Uw2F6dXZ-EbwK1FVzDlG8AZLlozmOXtc6YX3O52u8Tm6oEiw"
    },
    method: "GET"
  });
  const json = await res.json();
  for (const sensor of Object.values(json.sensors)) {
    ipMap.set(sensor.ip, sensor);
  }

  console.log("ipMap", ipMap);

  lastUpdate = Date.now();
}

export async function sensorHandler(addr: Deno.Addr, data: Uint8Array) {
  const ip = addr as Deno.NetAddr;
  let sensorTemp = ipMap.get(ip.hostname);
  if (!sensorTemp) {
    await updateIpMap();
    sensorTemp = ipMap.get(ip.hostname);
    if (!sensorTemp) {
      console.log("Unknown sensor", ip.hostname);
      return;
    }
  }

  // Const is needed for type safety
  const sensor = sensorTemp;

  const message = new TextDecoder().decode(data);
  const json = message.replaceAll("'", '"').replace('{', '[').replace('}', ']');

  console.log(json)

  lastMessage.set(sensor.id, Date.now());

  if (!online.has(sensor.id)) {
    _setState(sensor.id, true);
    const interval = setInterval(() => {
      if ((lastMessage.get(sensor.id) || 0) < Date.now() - 10000) {
        _setState(sensor.id, false);
        clearInterval(interval);
      }
    }, 5000);
  }


  clients.set(
    sensor.id,
    (clients.get(sensor.id) || []).filter((client) => {
      try {
        client.send(json);
        return true;
      } catch (_err) {
        return false;
      }
    })
  );
}

export function clientHandler(request: Request) {
  if (request.headers.get("upgrade") != "websocket") {
    console.log("Upgrade header is not websocket in client handler");
    return new Response(null, { status: 501 });
  }

  const url = new URL(request.url);
  const sensorId = parseInt(
    url.pathname.split("/")[url.pathname.split("/").length - 1]
  );

  if (isNaN(sensorId)) {
    console.log("sensorId is NaN");
    return new Response(null, { status: 404 });
  }

  console.log(`client streaming ${sensorId} connected`);

  const { socket, response } = Deno.upgradeWebSocket(request);

  let sensorClients = clients.get(sensorId);

  if (!sensorClients) {
    sensorClients = [];
    clients.set(sensorId, sensorClients);
  }

  sensorClients.push(socket);

  socket.addEventListener("close", () => {
    sensorClients!.splice(sensorClients!.indexOf(socket), 1);
    // console.log("client disconnected", sensorClients);
  });

  return response;
}
