import { loadSync } from "https://deno.land/std@0.197.0/dotenv/mod.ts";
import { getLogger } from "https://deno.land/std@0.197.0/log/mod.ts";
import { serveFile } from "https://deno.land/std@0.197.0/http/file_server.ts";
import * as Sentry from "npm:@sentry/node";
import {
	sensorHandler,
	clientWebSocketHandler,
	downloadSensorList,
	getNewTokenWithRefreshToken,
} from "./connectionHandler.ts";

// Load .env file. This needs to happen before other files run
loadSync({ export: true });
const devMode = Boolean(parseInt(Deno.env.get("DEV") || "0"));

function log() {
	return getLogger("main-server");
}

Sentry.init({
	dsn: "https://4d03235cf86ab4491bf144c3f1185969@o4505671371784192.ingest.sentry.io/4505671374667776",

	// Performance Monitoring
	tracesSampleRate: 1.0, // Capture 100% of the transactions, reduce in production!
	debug: devMode,
	environment: devMode ? "dev" : "prod",
});

// Imports

// Get an access token
if (!(await getNewTokenWithRefreshToken()))
	throw "Error getting token with refresh token on startup.";

// Get the list of sensors.
// Need to do this first thing to avoid spamming stuff.
let downloadError: string | undefined;
downloadError = await downloadSensorList();

// Every 15 minutes, re-download the sensor list
setInterval(
	async () => {
		log().info("About to download sensor list from interval");
		downloadError = await downloadSensorList();
	},
	15 * 60 * 1000 // Every 15 minutes
);

// HTTP request handler
async function reqHandler(request: Request) {
	if (downloadError) return new Response(downloadError);

	const url = new URL(request.url);

	const sections = url.pathname.slice(1).split("/");

	if (sections[0] === "consume" && sections[1]) {
		let sensorID: number;
		try {
			sensorID = parseInt(sections[1]);
		} catch (err) {
			log().warning("Failed to get sensor ID from URL: ", err);
			return new Response("Failed to get sensor ID from URL", { status: 400 });
		}

		if (isNaN(sensorID))
			return new Response("Invalid sensor ID", { status: 400 });

		// Websockets
		if (sections[2] === "live") {
			if (request.headers.get("Upgrade") !== "websocket") {
				return new Response("Needs websocket Upgrade header", { status: 400 });
			}

			return clientWebSocketHandler(request, sensorID);
		}

		return await serveFile(request, "live-data-graphs/dist/index.html");
	}

	if (
		Deno.env.get("SERVE_ALL")
			? true
			: sections[0] === "assets" && sections[1]?.endsWith(".js")
	)
		// FIXME: sketchy, possible path traversal
		return await serveFile(request, `live-data-graphs/dist${url.pathname}`);

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

const httpPort = Number(Deno.env.get("HTTP_PORT") || 8080);
Deno.serve(
	{
		port: httpPort,
	},
	reqHandler
);
log().info("HTTP listening on", httpPort);

// Start the UDP server
const socket = await Deno.listenDatagram({
	port: Number(Deno.env.get("UDP_PORT") || 2098),
	transport: "udp",
	hostname: "0.0.0.0",
});

log().info("UDP listening on", socket.addr);

// Handle incoming UDP packets
for await (const [data, addr] of socket) {
	sensorHandler(addr as Deno.NetAddr, data);
}
