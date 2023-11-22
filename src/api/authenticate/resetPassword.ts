/* global HASHES */

// import {sensors} from "./testData"
import { IRequest } from "itty-router";
import { pbkdf2 } from "./crypto-pbkdf2.ts";
import { getDB } from "../../utils.ts";

export default async function resetPassword(request: IRequest) {
	const { password } = await request.json();

	const sql = await getDB();

	const email = request.user.email;

	const hash = await pbkdf2(password);

	await sql`UPDATE users SET hash=${hash} WHERE email=${email}`;

	return new Response("OK", { status: 200 });
}
