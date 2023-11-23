import postgres from "https://deno.land/x/postgresjs@v3.3.5/mod.js";

function loggerTimeAndInfo(): string {
	return `[${new Date().toISOString()}]`;
}

export const log = {
	// deno-lint-ignore no-explicit-any
	log(...data: any[]) {
		console.log(loggerTimeAndInfo(), ...data);
	},
	// deno-lint-ignore no-explicit-any
	info(...data: any[]) {
		console.info(loggerTimeAndInfo(), ...data);
	},
	// deno-lint-ignore no-explicit-any
	warn(...data: any[]) {
		console.warn(loggerTimeAndInfo(), ...data);
	},
	// deno-lint-ignore no-explicit-any
	error(...data: any[]) {
		console.error(loggerTimeAndInfo(), ...data);
	},
};

/**
 * Simplify setup by autogenerate tables
 */
async function setupTables(sql: postgres.Sql) {
	// Sensor data (timescale)
	await sql`
CREATE TABLE IF NOT EXISTS sensor_data_3 (
	sensor_website_id int NOT NULL,
	data_timestamp timestamptz NOT NULL,
	data_channel char(3) NOT NULL,
	data_values FLOAT[] NOT NULL
);`;
	await sql`CREATE EXTENSION IF NOT EXISTS timescaledb;`;
	await sql`SELECT create_hypertable('sensor_data_3','data_timestamp', if_not_exists => TRUE);`;

	// Users
	await sql`
	CREATE TABLE IF NOT EXISTS users (
		"id" serial NOT NULL
		"email" text NOT NULL,
		"name" text NOT NULL,
		"roles" text[] NOT NULL,
		"hash" text,
		"refresh" text,
		PRIMARY KEY ("id")
	);
	`;
}

let dbConn: postgres.Sql | null = null;
export async function getDB(): Promise<postgres.Sql> {
	if (dbConn !== null) return dbConn;

	try {
		log.info("Connecting to database...");
		// Connect with credentials from env
		const sql = postgres({
			user: Deno.env.get("DATABASE_USERNAME"),
			password: Deno.env.get("DATABASE_PASSWORD"),
			database: "sensor_data",
			hostname: "localhost",
			port: 5432,
		});
		log.info("Connected to database!");
		await setupTables(sql);
		dbConn = sql;
		return sql;
	} catch (err) {
		log.error("Failed to connect to database: ", err);
		if (parseInt(Deno.env.get("SHOULD_STORE") || "0")) {
			// Only kill the process if we want to store data
			log.info("Exiting due to no database connection");
			throw exit(1);
		}
	}
	throw "We should never get here";
}

export async function exit(code?: number) {
	await dbConn?.end();
	Deno.exit(code);
}

let apiToken: string | null = null;

// Helper function to fetch from the API
export function fetchAPI(path: string, options: RequestInit = {}) {
	return fetch(Deno.env.get("API_ENDPOINT") + path, {
		...options,
		headers: {
			authorization: `Bearer ${apiToken}`,
			...options.headers,
		},
	});
}

export async function getNewTokenWithRefreshToken(): Promise<boolean> {
	log.info("Attempting to get new token with refresh token...");
	const response = await fetchAPI("auth/refresh", {
		method: "POST",
		body: JSON.stringify({
			email: Deno.env.get("API_EMAIL"),
			refreshToken: Deno.env.get("API_REFRESH_TOKEN"),
		}),
	});
	const data = await response.json();
	const token = data.token;
	if (token) {
		apiToken = token;
		return true;
	} else {
		log.warn("No token found when refreshing!");
	}
	return false;
}
