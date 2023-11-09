import postgres from "https://deno.land/x/postgresjs@v3.3.5/mod.js";

// @ts-expect-error It won't return undefined because process will exit
export function getDB(): postgres.Sql<{}> {
	try {
		console.info("Connecting to database...");
		// Connect with credentials from env
		const sql = postgres({
			user: Deno.env.get("DATABASE_USERNAME"),
			password: Deno.env.get("DATABASE_PASSWORD"),
			database: "sensor_data",
			hostname: "localhost",
			port: 5432,
		});
		console.info("Connected to database!");
		return sql;
	} catch (err) {
		console.error("Failed to connect to database: ", err);
		if (parseInt(Deno.env.get("SHOULD_STORE") || "0")) {
			// Only kill the process if we want to store data
			console.info("Exiting due to no database connection");
			Deno.exit(1);
		}
	}
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
