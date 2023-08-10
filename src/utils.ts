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

let apiToken: string | null = null;

// Helper function to fetch from the API
export function fetchAPI(path: string, options: RequestInit = {}) {
	return fetch(Deno.env.get("API_ENDPOINT") + path, {
		...options,
		headers: {
			...options.headers,
			authorization: `Bearer ${apiToken}`,
		},
	});
}

export async function getNewTokenWithRefreshToken(): Promise<boolean> {
	console.info("Attempting to get new token with refresh token...");
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
		console.warn("No token found when refreshing!");
	}
	return false;
}
