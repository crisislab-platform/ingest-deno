import { IRequest, json } from "itty-router";
import { getDB, log, normalizeEmail } from "../../utils.ts";
import createUserToken from "./createUserToken.ts";
import { pbkdf2Verify } from "./crypto-pbkdf2.ts";

// declare global {
//   const PRIVATE_JWK: string;
//   const PUBLIC_JWK: string;
//   const REALM_APPID: string;
//   const REALM_API_KEY: string;
//   const PURPLE_AIR_TOKEN: string;
//   const USERS: KVNamespace;
// }

export default async function usernameAndPassword(request: IRequest) {
	const data = await request.json();

	const email = typeof data?.email === "string"
		? normalizeEmail(data.email)
		: null;
	const password = typeof data?.password === "string" ? data.password : null;

	if (!email || !password) {
		return new Response("Bad request", { status: 400 });
	}

	const sql = await getDB();

	const matchingUsers = await sql<{ hash: string }[]>`
		SELECT hash FROM users WHERE lower(email)=${email} ORDER BY id;
	`;
	if (matchingUsers.length > 1) {
		log.warn(`Multiple users found for ${email}`);
		return new Response("Invalid username/password", { status: 401 });
	}
	const hash = matchingUsers[0]?.hash;

	if (!hash) {
		log.info(`No hash for ${email}`);
		return new Response("Invalid username/password", { status: 401 });
	}

	let isValid = false;
	try {
		isValid = await pbkdf2Verify(hash, password);
	} catch (err) {
		log.warn(`Invalid password hash for ${email}`, err);
		return new Response("Invalid username/password", { status: 401 });
	}

	if (!isValid) {
		return new Response("Invalid username/password", { status: 401 });
	}

	try {
		const token = await createUserToken(email);
		return json({ token }, { status: 201 });
	} catch (err) {
		log.error("Error creating user token", err);
		return new Response("User does not exist", { status: 401 });
	}
}
