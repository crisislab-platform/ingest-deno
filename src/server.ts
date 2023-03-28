import { serve } from "https://deno.land/std@0.178.0/http/mod.ts";
import { serveFile } from "https://deno.land/std@0.178.0/http/file_server.ts";
import {
	sensorHandler,
	clientHandler,
	downloadSensorList,
} from "./connectionHandler.ts";

// Load .env file
import "https://deno.land/std@0.178.0/dotenv/load.ts";

// Get the list of sensors.
// Need to do this absolute first thing to avoid spamming stuff.
await downloadSensorList();

// HTTP request handler
async function reqHandler(request: Request) {
	const url = new URL(request.url);

	const sections = url.pathname.slice(1).split("/");

	if (sections[0] === "consume") {
		const sensor = parseInt(sections[1]!);

		if (isNaN(sensor))
			return new Response("Invalid sensor id", { status: 400 });

		// Websockets
		if (sections[2] === "live") {
			if (request.headers.get("Upgrade") !== "websocket")
				return new Response("Needs websocket Upgrade header", { status: 400 });

			return clientHandler(request, sensor);
		}

		return await serveFile(request, "live-data-graphs/dist/index.html");
	}

	if (sections[0] === "assets" && sections[1].endsWith(".js"))
		return await serveFile(request, `live-data-graphs/dist${url.pathname}`); // sketchy, possible path traversal

	if (url.pathname === "/")
		return await serveFile(request, "live-data-graphs/dist/index.html");

	return new Response("No matching route found - 404", { status: 404 });
}

// Start the HTTP server
serve(reqHandler, { port: Number(Deno.env.get("HTTP_PORT") || 8080) });

// Start the UDP server
const socket = await Deno.listenDatagram({
	port: Number(Deno.env.get("UDP_PORT") || 2098),
	transport: "udp",
	hostname: "0.0.0.0",
});

console.info("UDP listening on", socket.addr);

// Handle incoming UDP packets
for await (const [data, addr] of socket) sensorHandler(addr, data);
