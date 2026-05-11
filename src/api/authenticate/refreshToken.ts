import { IRequest, json } from "itty-router";
import createUserToken from "./createUserToken.ts";
import { getDB, normalizeEmail } from "../../utils.ts";

export async function refreshToken(req: IRequest) {
	// This is saddening to read. Please ignore.
	// TODO: Fix types here
	const data = (await (req as Request).json()) as Record<string, string | null>;

	const suppliedRefreshToken = typeof data?.refreshToken === "string"
		? data.refreshToken
		: null;
	const email = typeof data?.email === "string"
		? normalizeEmail(data.email)
		: null;

	if (email === null || suppliedRefreshToken === null) {
		return new Response("Bad request", { status: 400 });
	}

	// Efficiency
	if (suppliedRefreshToken.length + email.length === 0) {
		return new Response("Bad request", { status: 400 });
	}

	const sql = await getDB();

	const matchingUsers = await sql<{ refresh: string }[]>`
		SELECT refresh FROM users WHERE lower(email)=${email} ORDER BY id;
	`;
	if (matchingUsers.length !== 1) {
		return new Response("Unauthorised", { status: 401 });
	}
	const actualRefreshToken = matchingUsers[0].refresh;

	if (actualRefreshToken !== suppliedRefreshToken) {
		return new Response("Unauthorised", { status: 401 });
	}

	// We should be good to give them a token now
	try {
		const token = await createUserToken(email);
		return json({ token }, { status: 201 });
	} catch {
		return new Response("User does not exist", { status: 401 });
	}
}
