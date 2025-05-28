import { IRequest, json } from "itty-router";
import { getDB, log } from "../../utils.ts";
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

	const email = data.email.toLowerCase();
	const password = data.password;

	if (email === null || password === null) {
		return new Response("Bad request", { status: 400 });
	}

	const sql = await getDB();

	const hash = (
		await sql<{ hash: string }[]>`SELECT hash FROM users WHERE email=${email};`
	)?.[0]?.["hash"];

	if (hash === null) {
		log.info(`No hash for ${email}`)
		return new Response("Invalid username/password", { status: 401 });
	}

	const isValid = await pbkdf2Verify(hash, password);

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
