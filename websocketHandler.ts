import authenticate from "./auth.ts";

const clients = new Map<number, Array<WebSocket>>();

const latestSessions = new Map<number, number>();
const online = new Set<number>();

export async function sensorHandler(request: Request) {
  const sensor = await authenticate(request);

  if (!sensor) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (request.headers.get("upgrade") != "websocket") {
    return new Response(null, { status: 501 });
  }
  const { socket: server, response } = Deno.upgradeWebSocket(request);

  const connectTime = Date.now();

  latestSessions.set(sensor.id, connectTime);

  if (!online.has(sensor.id)) {
    online.add(sensor.id);
    const token = (
      request.headers.get("Authorization") ||
      request.headers.get("authorization")
    )?.substring(6);
    console.log(`${sensor.id} connected`);
    fetch(
      "https://internship-worker.benhong.workers.dev/api/v0/sensors/updateMetadata",
      {
        method: "POST",
        body: JSON.stringify({
          online: true,
        }),
        headers: {
          Authorization: "Bearer " + token,
        },
      }
    );
  }

  server.addEventListener("close", () => {
    setTimeout(() => {
      if (latestSessions.get(sensor.id) === connectTime) {
        online.add(sensor.id);
        console.log(`${sensor.id} disconnected`);
        online.delete(sensor.id);
        fetch(
          "https://internship-worker.benhong.workers.dev/api/v0/sensors/updateMetadata",
          {
            method: "POST",
            body: JSON.stringify({
              online: false,
            }),
            headers: {
              Authorization: "Bearer " + sensor.token,
            },
          }
        );
      }
    }, 5000);
  });

  server.addEventListener("message", ({ data }) => {
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
