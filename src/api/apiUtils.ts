import { IRequest } from "itty-router";
import { fetchAPI, getDB } from "../utils.ts";

export function authMiddleware(roles?: string[]) {
	return async (req: IRequest) => {
		// Check Auth
		const tokenMatch = req.headers.get("Authorization")?.match(/Bearer (.+)/);
		if (!tokenMatch || tokenMatch.length < 2)
			return new Response("Unauthorised", {
				status: 401,
			});

		const token = tokenMatch[1];

		let userDetails;

		// Very cursed
		try {
			// Pretend to be the user making the request to the API
			// to figure out if they have the correct role.
			userDetails = await (
				await fetchAPI("auth/me", {
					headers: { authorization: `Bearer ${token}` },
				})
			).json();
		} catch {
			return new Response("Invalid user token", {
				status: 500,
			});
		}

		if (roles)
			for (const role of roles)
				if (!userDetails.roles.includes(role))
					return new Response("Missing permissions", {
						status: 401,
					});
	};
}

export interface PublicSensorMeta {
	id: number;
	type?: string;
	online?: boolean;
	timestamp?: number;
	secondary_id?: string;
	public_location?: [number, number];
}

export type PrivateSensorMeta = PublicSensorMeta & {
	location?: [number, number];
	name?: string;
	contact_email?: string;
	timestamp?: number;
	ip?: string;
};

export interface User {
	id: number;
	name: string;
	email: string;
	roles: string[];
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

const publicSensorKeys: (keyof PublicSensorMeta)[] = [
	"id",
	"type",
	"publicLocation",
	"online",
	"timestamp",
	"secondary_id",
];

export async function getSensor(
	id: number | string,
	unfiltered = true
): Promise<Partial<SensorMeta>> {
	const sensor = (await SENSORS.get(id + "", "json")) as SensorMeta;

	if (sensor.location) {
		sensor.longitude = sensor.location.coordinates[0];
		sensor.latitude = sensor.location.coordinates[1];
	}

	if (unfiltered) {
		return sensor;
	} else {
		return filterValues(sensor);
	}
}

function fixSensorLocation(sensor: SensorMeta) {
	if (sensor.location) {
		sensor.longitude = sensor.location.coordinates[0];
		sensor.latitude = sensor.location.coordinates[1];
	}
}

export async function getSensors(
	unfiltered = true
): Promise<{ [key: string]: Partial<SensorMeta> }> {
	const sql = await getDB();
	const sensors = await sql``;

	const sensorsObj: { [key: string]: SensorMeta } = {};

	for (const sensor of sensors) {
		fixSensorLocation(sensor);

		sensorsObj[sensor.id] = sensor;
	}

	if (unfiltered) {
		return sensorsObj;
	} else {
		// I <3 Object.fromEntries
		return Object.fromEntries(
			Object.entries(sensorsObj).map(([sensorID, sensor]) => [
				sensorID,
				filterValues(sensor),
			])
		);
	}
}
