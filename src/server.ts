// Load .env file. This needs to happen before other files run
import { loadSync } from "https://deno.land/std@0.178.0/dotenv/mod.ts";
loadSync({ export: true });

// Imports
import {
	// serveTls,
	serve,
} from "https://deno.land/std@0.178.0/http/mod.ts";
import { serveFile } from "https://deno.land/std@0.178.0/http/file_server.ts";

import {
	sensorHandler,
	clientWebSocketHandler,
	downloadSensorList,
} from "./connectionHandler.ts";

// Get the list of sensors.
// Need to do this absolute first thing to avoid spamming stuff.
await downloadSensorList();

// HTTP request handler
async function reqHandler(request: Request) {
	const url = new URL(request.url);

	const sections = url.pathname.slice(1).split("/");

	if (sections[0] === "consume" && sections[1]) {
		let sensorID: number;
		try {
			sensorID = parseInt(sections[1]);
		} catch (err) {
			console.warn("Failed to get sensor ID from URL: ", err);
			return new Response("Failed to get sensor ID from URL", { status: 400 });
		}

		if (isNaN(sensorID))
			return new Response("Invalid sensor ID", { status: 400 });

		// Websockets
		if (sections[2] === "live") {
			if (request.headers.get("Upgrade") !== "websocket") {
				return new Response("Needs websocket Upgrade header", { status: 400 });
			}
			console.info("WebSocket!");

			return clientWebSocketHandler(request, sensorID);
		}

		return await serveFile(request, "live-data-graphs/dist/index.html");
	}

	if (sections[0] === "assets" && sections[1]?.endsWith(".js"))
		return await serveFile(request, `live-data-graphs/dist${url.pathname}`); // sketchy, possible path traversal

	if (url.pathname === "/")
		return await serveFile(request, "live-data-graphs/dist/index.html");

	return new Response("No matching route found - 404", { status: 404 });
}

// Start the HTTP server
// serveTls(reqHandler, {
// 	port: Number(Deno.env.get("HTTP_PORT") || 8080),
// 	certFile: Deno.env.get("TLS_CERT_FILE"),
// 	keyFile: Deno.env.get("TLS_KEY_FILE"),
// });

serve(reqHandler, {
	port: Number(Deno.env.get("HTTP_PORT") || 8080),
});

// Start the UDP server
const socket = await Deno.listenDatagram({
	port: Number(Deno.env.get("UDP_PORT") || 2098),
	transport: "udp",
	hostname: "0.0.0.0",
});

console.info("UDP listening on", socket.addr);

// Handle incoming UDP packets
for await (const [data, addr] of socket) {
	sensorHandler(addr, data);
}
