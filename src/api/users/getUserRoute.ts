import { IRequest, json } from "itty-router";
import { validateEmail } from "./utils.ts";
import { getUserByEmail } from "../apiUtils.ts";

export async function getUserRoute({ params }: IRequest) {
	const email = params.email.toLowerCase();

	// check if email is valid
	if (!validateEmail(email)) {
		return new Response("Invalid email", { status: 404 });
	}
	return json(await getUserByEmail(email));
}
