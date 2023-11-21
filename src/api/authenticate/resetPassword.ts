/* global HASHES */

// import {sensors} from "./testData"
import { IRequest } from "itty-router";
import { pbkdf2 } from "./crypto-pbkdf2.ts";

export default async function resetPassword(request: IRequest) {
	const { password } = await request.json();

	console.log("resetting password");

	const hash = await pbkdf2(password);

	await HASHES.put(request.user.email, hash);

	return new Response("OK", { status: 200 });
}
