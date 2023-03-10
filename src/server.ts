import { serve } from "https://deno.land/std@0.178.0/http/mod.ts";
import { serveFile } from "https://deno.land/std@0.178.0/http/file_server.ts";
import { sensorHandler, clientHandler } from "./connectionHandler.ts";
import { fetchAPI } from "./utils.ts";

console.log(Deno.env.get("DEV_MODE"));

// HTTP request handler
async function reqHandler(request: Request) {
  const url = new URL(request.url);
  const pathname = url.pathname;

  console.log("request:", `'${pathname}'`);

  if (pathname.startsWith("/consume/")) {
    const sensor = parseInt(pathname.split("/").pop()!);

    if (isNaN(sensor))
      return new Response("Invalid sensor id", { status: 400 });

    if (request.headers.get("Upgrade") !== "websocket") {
      console.log("Upgrade header is not websocket");
      return await serveFile(request, "live-data-graphs/dist/index.html");
    }

    // if the client is requesting a websocket
    return clientHandler(request, sensor);
  }

  if (pathname === "/")
    return await serveFile(request, "live-data-graphs/dist/index.html");

  return await serveFile(request, `live-data-graphs/dist${pathname}`); // sketchy, possible path traversal
}

// Start the HTTP server
serve(reqHandler, { port: Number(Deno.env.get("HTTP_PORT") || 8080) });

// Reset all sensors to offline.
// We'll wait 1 minute before doing this, to give
// sensors a chance to prove that they're online
// by sending a data packet.
// We'll keep the timestamp from when the server started,
// so that any sensors that posted data after it started
// aren't set to offline unfairly.
const startedAt = Date.now();
setTimeout(
  async () => {
    const res = await (
      await fetchAPI("sensors/online", {
        method: "POST",
        body: JSON.stringify({ all: true, timestamp: startedAt, state: false }),
      })
    ).text();

    console.info("Reset all sensors to offline:", res);
  },
  60 * 1000 // 1 Minute
);

// Start the UDP server
const socket = await Deno.listenDatagram({
  port: Number(Deno.env.get("UDP_PORT") || 2098),
  transport: "udp",
  hostname: "0.0.0.0",
});

console.info("UDP listening on", socket.addr);

// Handle incoming UDP packets
for await (const [data, addr] of socket) sensorHandler(addr, data);
