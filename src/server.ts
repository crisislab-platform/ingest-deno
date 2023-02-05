import { serve } from "https://deno.land/std/http/mod.ts";
import { serveFile } from 'https://deno.land/std/http/file_server.ts';
import { sensorHandler, clientHandler } from "./connectionHandler.ts";
import { fetchAPI } from "./utils.ts";

// HTTP request handler
async function reqHandler(request: Request) {
  const url = new URL(request.url);
  const pathname = url.pathname;

  console.log("request:", "'" + pathname + "'")

  if (pathname.startsWith("/consume/")) {
    const sensor = parseInt(pathname.split("/").pop()!);

    if (isNaN(sensor))
      return new Response("Invalid sensor id", { status: 400 });

    if (request.headers.get("Upgrade") != "websocket") {
      console.log("Upgrade header is not websocket");
      return await serveFile(request, "live-data-graphs/dist/index.html");
    }

    // if the client is requesting a websocket
    return clientHandler(request, sensor);
  }

  if (pathname === "/") return await serveFile(request, "live-data-graphs/dist/index.html");

  return await serveFile(request, "live-data-graphs/dist" + pathname); // sketchy, possible path traversal
}

// Start the HTTP server
serve(reqHandler, { port: Number(Deno.env.get("HTTP_PORT") || 8080) })

// Reset all sensors to offline
const res = await (await fetchAPI("sensors/online", {
  method: "POST",
  body: JSON.stringify({ all: true, timestamp: Date.now(), state: false })
})).text();

console.log("Reset all sensors to offline:", res);

// Start the UDP server
const socket = await Deno.listenDatagram({
  port: Number(Deno.env.get("UDP_PORT") || 2098),
  transport: "udp",
  hostname: "0.0.0.0"
});

console.log("UDP listening on", socket.addr);

// Handle incoming UDP packets
for await (const [data, addr] of socket)
  sensorHandler(addr, data);