import { Client as DBClient } from "https://deno.land/x/postgres@v0.17.0/mod.ts";

export async function getDB() {
	// Connect with credentials from env
	const dbClient = new DBClient({
		user: Deno.env.get("DATABASE_USERNAME"),
		password: Deno.env.get("DATABASE_PASSWORD"),
		database: "sensor_data",
		hostname: "localhost",
		port: 5432,
	});
	await dbClient.connect();

	// Automatic cleanup on process end
	globalThis.addEventListener("unload", async () => {
		await dbClient.end();
	});

	return dbClient;
}
