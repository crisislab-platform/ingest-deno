import { loadSync as loadENV } from "https://deno.land/std@0.197.0/dotenv/mod.ts";
import {
	serveDir,
	serveFile,
} from "https://deno.land/std@0.204.0/http/file_server.ts";
import * as Sentry from "sentry";
import { sensorHandler, handleWebSockets } from "./connectionHandler.ts";
import { getDB, log } from "./utils.ts";
import { IRequest, Router } from "itty-router";
import { handleAPI } from "./api/api.ts";
loadENV({ export: true });
const devMode = Boolean(parseInt(Deno.env.get("DEV") || "0"));

Sentry.init({
	dsn: "https://4d03235cf86ab4491bf144c3f1185969@o4505671371784192.ingest.sentry.io/4505671374667776",

	// Performance Monitoring
	tracesSampleRate: 1.0, // Capture 100% of the transactions, reduce in production!
	debug: devMode,
	environment: devMode ? "dev" : "prod",
});

// Every hour, save DB size
Deno.cron("Save DB size", "0 */1 * * *", async () => {
	const sql = await getDB();
	try {
		await sql`WITH subquery AS (SELECT pg_database_size('sensor_data') as size, NOW() as timestamp) INSERT INTO db_size_history (size, timestamp) SELECT * FROM subquery;`;
	} catch (err) {
		log.error("Error saving DB size:", err);
	} finally {
		log.info("Saved DB size");
	}
});

// Imports

// HTTP request handler
const router = Router<IRequest & { sensorID?: number }>();
router
	.all("/api/v2/*", handleAPI)
	.get("/consume/:id/live", handleWebSockets)
	.all("/assets/*", (req) =>
		serveDir(req, { fsRoot: "live-data-graphs/dist/assets", urlRoot: "assets" })
	)
	.get("/", (req) => serveFile(req, "live-data-graphs/dist/index.html"))
	.get("/consume/*", (req) =>
		serveFile(req, "live-data-graphs/dist/index.html")
	)
	.get("/status", () => new Response("HTTP works at least"));

const httpPort = Number(Deno.env.get("HTTP_PORT") || 8080);
// The .unref() is important so that we can also run a datagram listener
Deno.serve(
	{
		port: httpPort,
		hostname: "0.0.0.0",
		onListen: ({ hostname, port }) =>
			log.info(`HTTP server started http://${hostname}:${port}`),
	},
	async (req, connectionInfo) => {
		try {
			const origin = req.headers.get("Origin");

			log.info(
				`HTTP ${req.method} ${req.url} from ${
					connectionInfo.remoteAddr.hostname
				}${origin ? `(${origin})` : ""}`
			);

			const res = (await router.handle(req)) as Response | null | undefined;

			// Deno.serve is weak - if you don't return something the
			// whole server crashes.
			if (!res) {
				log.info(
					`Sending non-fatal top-level 404 response for HTTP ${req.method} ${
						req.url
					} from ${connectionInfo.remoteAddr.hostname}${
						origin ? `(${origin})` : ""
					}`
				);
				return new Response("Not found", { status: 404 });
			}

			log.info(
				`Sending non-fatal ${res.status} response for HTTP ${req.method} ${
					req.url
				} from ${connectionInfo.remoteAddr.hostname}${
					origin ? `(${origin})` : ""
				}`
			);
			return res;
		} catch (err) {
			Sentry.captureException(err);
			log.error(
				`Error handling HTTP  ${req.method} ${req.url} from ${
					connectionInfo.remoteAddr.hostname
				}${origin ? `(${origin})` : ""}: `,
				err
			);
			return new Response("Internal error", { status: 500 });
		}
	}
).unref();

// Start the UDP server
const socket = await Deno.listenDatagram({
	port: Number(Deno.env.get("UDP_PORT") || 2098),
	transport: "udp",
	hostname: "0.0.0.0",
});
const socketAddr = socket.addr as Deno.NetAddr;
log.info(`UDP listening on ${socketAddr.hostname}:${socketAddr.port}`);

// Handle incoming UDP packets
for await (const [data, addr] of socket) {
	sensorHandler(addr as Deno.NetAddr, data);
}
