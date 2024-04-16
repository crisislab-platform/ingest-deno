import postgres from "postgresjs";
import chalk from "chalk";
import { PrivateSensorMeta, PublicSensorMeta, User } from "./types.ts";
import process from "https://deno.land/std@0.132.0/node/process.ts";

function loggerTimeAndInfo(): string {
	const inWorker =
		typeof WorkerGlobalScope !== "undefined" &&
		self instanceof WorkerGlobalScope;

	return `[${chalk.cyan(new Date().toISOString())}] [${
		inWorker ? chalk.magenta(self?.name ?? "WORKER") : chalk.yellow("MAIN")
	}]`;
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

process.on("exit", (code) => {
	log.warn("Exiting with code ", code);
});

/**
 * Simplify setup by autogenerate tables
 */
async function setupTables(sql: postgres.Sql) {
	log.info("Setting up tables... PostgreSQL will cause lots of logging.");

	// Setup timescale first so we fail fast if it isn't here
	await sql`CREATE EXTENSION IF NOT EXISTS timescaledb;`;

	// Users
	await sql`
	CREATE TABLE IF NOT EXISTS users (
		"id" serial NOT NULL,
		"email" text NOT NULL,
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
		PRIMARY KEY ("name")
	);`;
	await sql`
	CREATE TABLE IF NOT EXISTS sensors (
        "id" serial NOT NULL UNIQUE,
		"type" text,
        "ip" text,
        "online" bool,
        "location" point,
		"public_location" point,
        "name" text,
        "secondary_id" text,
        "status_change_timestamp" timestamptz,
        "contact_email" text,
		"removed" boolean,
        PRIMARY KEY ("id")
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
		if (
			(
				await sql`SELECT compression_enabled FROM timescaledb_information.hypertables WHERE hypertable_name='sensor_data_4';`
			)?.[0]?.["compression_enabled"] !== true
		) {
			// These sometimes throw because timescale is being silly
			await sql`ALTER TABLE sensor_data_4 SET (timescaledb.compress, timescaledb.compress_segmentby = 'sensor_id');`;
			await sql`SELECT add_compression_policy('sensor_data_4', INTERVAL '12 hours', if_not_exists => TRUE);`;
		} else {
			log.info("Compression already enabled on sensor_data_4.");
		}
	} catch (err) {
		log.warn(`Error setting up sensor_data_4: ${err}`);
	}
	// Stats for graphing db size over time
	await sql`
	CREATE TABLE IF NOT EXISTS db_size_history (
        "size" bigint,
        "timestamp" timestamptz
    );
	`;

	log.info("Done setting up tables");
}

// Postgres.js manages connection pooling for us
let sql: postgres.Sql | null = null;
export async function getDB(): Promise<postgres.Sql> {
	if (!sql) {
		try {
			if (
				!Deno.env.get("DATABASE_USERNAME") ||
				!Deno.env.get("DATABASE_PASSWORD")
			) {
				log.error(
					"DATABASE_USERNAME or DATABASE_PASSWORD not set in environment"
				);
				await exit(1);
			}
			sql = postgres({
				user: Deno.env.get("DATABASE_USERNAME"),
				password: Deno.env.get("DATABASE_PASSWORD"),
				database: "sensor_data",
				hostname: "localhost",
				port: 5432,
				onnotice: (notice) =>
					log.info("PostgreSQL notice:", notice?.message ?? notice),
			});
			await setupTables(sql);
		} catch (err) {
			log.error("Error setting up tables:", err);
			log.warn("Exiting...");
			await exit(1);
		}
	}
	return sql!;
}

/**
 * Get a user from an email address. Returns null if no user was found.
 */
export async function getUserByEmail(email: string): Promise<User | null> {
	const sql = await getDB();

	const user: User | null =
		(
			await sql<
				User[]
			>`SELECT id, name, email, roles FROM users WHERE email=${email}`
		)?.[0] ?? null;

	return user;
}

function parsePoint(point: string): [number, number] {
	return JSON.parse(point.replaceAll("(", "[").replaceAll(")", "]"));
}

/**
 * Fixes some of the weirdness from the database
 */
function normaliseSensor(sensor: PublicSensorMeta | PrivateSensorMeta) {
	// The database returns `point` types as strings like '(x, y)'.
	if ("location" in sensor && sensor.location) {
		sensor.location = parsePoint(sensor.location as unknown as string);
	}
	if (sensor.public_location) {
		sensor.public_location = parsePoint(
			sensor.public_location as unknown as string
		);
	}
}

/**
 * Get a user from an ID. Returns null if no user was found.
 */
export async function getUserByID(id: number): Promise<User | null> {
	const sql = await getDB();

	const user: User | null =
		(
			await sql<User[]>`SELECT id, name, email, roles FROM users WHERE id=${id}`
		)?.[0] ?? null;

	return user;
}

export function randomizeLocation(
	location: [number, number]
): [number, number] {
	const lng = location[0] + (Math.random() - 0.5) * 0.002;
	const lat = location[1] + (Math.random() - 0.5) * 0.002;
	return [Math.round(lng * 100000) / 100000, Math.round(lat * 100000) / 100000];
}

export async function getSensor(
	id: number,
	unfiltered?: true | undefined
): Promise<PrivateSensorMeta>;
export async function getSensor(
	id: number,
	unfiltered: false
): Promise<PublicSensorMeta>;
// I should not have to re-define the implementation signature
export async function getSensor(
	id: number,
	unfiltered?: boolean
): Promise<PublicSensorMeta | PrivateSensorMeta>;
export async function getSensor(
	id: number,
	unfiltered?: boolean
): Promise<PublicSensorMeta | PrivateSensorMeta> {
	unfiltered ??= true;

	const sql = await getDB();

	if (unfiltered) {
		const sensor = (
			await sql<
				PrivateSensorMeta[]
			>`SELECT * FROM sensors WHERE id=${id} AND removed IS NOT TRUE;`
		)[0];
		normaliseSensor(sensor);
		return sensor;
	} else {
		const sensor = (
			await sql<
				PublicSensorMeta[]
			>`SELECT id, type, online, timestamp, secondary_id, public_location FROM sensors WHERE id=${id} AND removed IS NOT TRUE;`
		)[0];
		normaliseSensor(sensor);
		return sensor;
	}
}

export async function exit(code?: number) {
	await sql?.end();
	Deno.exit(code);
}

export async function getSensors(
	unfiltered?: true | undefined
): Promise<Record<string, PrivateSensorMeta>>;
export async function getSensors(
	unfiltered: false
): Promise<Record<string, PublicSensorMeta>>;
// I should not have to re-define the implementation signature
export async function getSensors(
	unfiltered?: boolean
): Promise<Record<string, PublicSensorMeta | PrivateSensorMeta>>;
export async function getSensors(
	unfiltered?: boolean
): Promise<Record<string, PublicSensorMeta | PrivateSensorMeta>> {
	unfiltered ??= true;

	const sql = await getDB();

	let sensors;
	if (unfiltered) {
		sensors = await sql`SELECT * FROM sensors WHERE removed IS NOT TRUE;`;
	} else {
		sensors =
			await sql`SELECT id, type, online, status_change_timestamp, secondary_id, public_location FROM sensors WHERE removed IS NOT TRUE;`;
	}
	return Object.fromEntries(
		sensors
			.map((sensor) => {
				normaliseSensor(sensor as PrivateSensorMeta);
				return sensor;
			})
			.map((sensor) => [sensor.id, sensor])
	);
}

export const validateEmail = (email: string): boolean => {
	return !!String(email)
		.toLowerCase()
		.match(
			/^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
		);
};

// Secure token generator 9000 copyright 2023 Zade Viggers
// I wasn't sure how if what I was doing was secure enough, so I just made it really hard for people to figure out what I'm doing
export function toSecureToken(base: string): string {
	return btoa(
		crypto.randomUUID() +
			base +
			Number.EPSILON +
			(Math.random() * Math.random() + 3) * Math.PI +
			Math.random() * 69420
	);
}
