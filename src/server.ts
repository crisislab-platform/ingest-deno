import { loadSync } from "https://deno.land/std@0.197.0/dotenv/mod.ts";
import {
	serveDir,
	serveFile,
} from "https://deno.land/std@0.204.0/http/file_server.ts";
import * as Sentry from "npm:@sentry/node";
import {
	sensorHandler,
	clientWebSocketHandler,
	downloadSensorList,
} from "./connectionHandler.ts";
import { getNewTokenWithRefreshToken } from "./utils.ts";
import { IRequest, Router } from "npm:itty-router@4.0.23";
import { handleAPI } from "./api.ts";

// Load .env file. This needs to happen before other files run
loadSync({ export: true });
const devMode = Boolean(parseInt(Deno.env.get("DEV") || "0"));

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
		console.info("About to download sensor list from interval");
		downloadError = await downloadSensorList();
	},
	15 * 60 * 1000 // Every 15 minutes
);

// HTTP request handler
function getSensorIDMiddleware(req: IRequest) {
	let sensorID: number;
	try {
		sensorID = parseInt(req?.params?.id?.[0]);
		if (isNaN(sensorID))
			return new Response("Invalid sensor ID", { status: 400 });
	} catch (err) {
		console.warn("Failed to get sensor ID from URL: ", err);
		return new Response("Failed to get sensor ID from URL", { status: 400 });
	}
	req.sensorID = sensorID;
}
function downloadErrorMiddleware() {
	if (downloadError) return new Response(downloadError);
}
const router = Router<IRequest & { sensorID?: number }>();
router
	.all("/api/v1/*", handleAPI)
	.get(
		"/consume/:id/live",
		downloadErrorMiddleware,
		getSensorIDMiddleware,
		(req) => {
			if (downloadError) return new Response(downloadError);

			if (req.headers.get("Upgrade") !== "websocket") {
				return new Response("Needs websocket Upgrade header", { status: 400 });
			}
			return clientWebSocketHandler(req, req.sensorID!);
		}
	)
	.all("/assets/*", (req) =>
		serveDir(req, { fsRoot: "live-data-graphs/dist/assets", urlRoot: "assets" })
	)
	.get("/", downloadErrorMiddleware, (req) =>
		serveFile(req, "live-data-graphs/dist/index.html")
	)
	.get("/consume/*", downloadErrorMiddleware, (req) =>
		serveFile(req, "live-data-graphs/dist/index.html")
	);

const httpPort = Number(Deno.env.get("HTTP_PORT") || 8080);
// The .unref() is important so that we can also run a datagram listener
Deno.serve({ port: httpPort }, async (req) => {
	const res = await router.handle(req);

	return res;
}).unref();
console.info("HTTP listening on", httpPort);

// Start the UDP server
const socket = await Deno.listenDatagram({
	port: Number(Deno.env.get("UDP_PORT") || 2098),
	transport: "udp",
	hostname: "0.0.0.0",
});
console.info("UDP listening on", socket.addr);

// Handle incoming UDP packets
for await (const [data, addr] of socket) {
	sensorHandler(addr as Deno.NetAddr, data);
}
