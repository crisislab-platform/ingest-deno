import authenticate from "./auth.ts";

const clients = new Map<number, Array<WebSocket>>();

const latestSessions = new Map<number, number>();
const lastMessage = new Map<number, number>();
const online = new Set<number>();

function _setState(sensor: number, state: boolean) {
  console.log(`${sensor} state:`, state);
  if (state) {
    online.add(sensor);
  } else {
    online.delete(sensor);
  }
  fetch("https://internship-worker.benhong.workers.dev/api/v0/sensors/online", {
    headers: {
      authorization: "bearer eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlcyI6WyJzZW5zb3JzOm9ubGluZSJdLCJlbWFpbCI6ImluZ2VzdEBiZW5ob25nLm1lIiwibmFtZSI6IkxpdmUgRGF0YSBTZXJ2ZXIiLCJpYXQiOjE2NTY0ODc5MTEuNjc0LCJleHAiOjE2NTcwOTI3MTEuNjc0LCJpc3MiOiJodHRwczovL2NyaXNpc2xhYi5vcmcubnoiLCJhdWQiOlsiYWRtaW4iXX0=._kIvhTQTbQ1v7a5bHuecXEajpjMUueoyw1l-PTfBXNY2Ddv4WZhLinM79gFK3xUBpyqzJpd3DaX53WoEd-ZIiw"
    },
    method: "POST",
    body: JSON.stringify({ sensor, timestamp: Date.now(), state })
  }).then((res) => { console.log(res.status); }).catch((err) => { console.log(err); });
}

export async function sensorHandler(request: Request) {
  const sensor = await authenticate(request);

  const setState = (state: boolean) => _setState(sensor.id, state);

  if (!sensor) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (request.headers.get("upgrade") != "websocket") {
    return new Response(null, { status: 501 });
  }
  const { socket: server, response } = Deno.upgradeWebSocket(request);

  const connectTime = Date.now();

  latestSessions.set(sensor.id, connectTime);

  server.addEventListener("close", () => {
    setTimeout(() => {
      if (latestSessions.get(sensor.id) === connectTime)
        setState(false)
    }, 5000);
  });

  server.addEventListener("message", ({ data }) => {
    lastMessage.set(sensor.id, Date.now());

    if (!online.has(sensor.id)) {
      setState(true);
      const interval = setInterval(() => {
        if ((lastMessage.get(sensor.id) || 0) < Date.now() - 10000) {
          setState(false);
          clearInterval(interval);
        }
      }, 5000);
    }


    clients.set(
      sensor.id,
      (clients.get(sensor.id) || []).filter((client) => {
        try {
          client.send(data);
          return true;
        } catch (_err) {
          return false;
        }
      })
    );
  });

  server.addEventListener("error", () => {
    setTimeout(() => {
      if (latestSessions.get(sensor.id) === connectTime)
        setState(false)
    }, 5000);
  })

  return response;
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
