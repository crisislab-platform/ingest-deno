import postgres from "https://deno.land/x/postgresjs@v3.4.3/mod.js";

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
	// Setup timescale first so we fail fast if it isn't here
	await sql`CREATE EXTENSION IF NOT EXISTS timescaledb;`;

	// Users
	await sql`
	CREATE TABLE IF NOT EXISTS users (
		"id" serial NOT NULL UNIQUE,
		"email" text NOT NULL UNIQUE,
		"name" text NOT NULL,
		"roles" text[] NOT NULL,
		"hash" text,
		"refresh" text,
		PRIMARY KEY ("id", "email")
	);
	`;
	// Sensors
	await sql`
	CREATE TABLE IF NOT EXISTS sensor_types (
		"name" text NOT NULL,
		"sample_delta" int4, NOT NULL, 
		PRIMARY KEY ("name")
	);`;
	await sql`
	CREATE TABLE IF NOT EXISTS sensors (
        "id" serial NOT NULL UNIQUE,
		"type" text NOT NULL,
        "ip" text,
        "online" bool,
        "location" point,
		"public_location" point,
        "name" text,
        "secondary_id" text,
        "timestamp" int8,
        "contact_email" text,
        PRIMARY KEY ("id"),
		CONSTRAINT fk_sensor_type FOREIGN KEY(type) REFERENCES sensor_types(name)
    );
	`;
	// Sensor data (timescale)
	await sql`
	CREATE TABLE IF NOT EXISTS sensor_data_4 (
		sensor_id int NOT NULL,
		data_timestamp timestamptz NOT NULL,
		data_channel char(3) NOT NULL,
		data_values FLOAT[] NOT NULL,
		CONSTRAINT fk_sensor_id FOREIGN KEY(sensor_id) REFERENCES sensors(id)
	);
	`;
	await sql`SELECT create_hypertable('sensor_data_4','data_timestamp', if_not_exists => TRUE);`;
	try {
		// These sometimes throw because timescale is being silly
		await sql`ALTER TABLE sensor_data_4 SET (timescaledb.compress, timescaledb.compress_segmentby = 'sensor_id');`;
		await sql`SELECT add_compression_policy('sensor_data_4', INTERVAL '2 days', if_not_exists => TRUE);`;
	} catch (err) {
		log.error(`Error setting up table: ${err}`);
	}
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
			throw Deno.exit(1);
		}
	}
	throw "We should never get here";
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
