import { IRequest, json } from "itty-router";
import { validateEmail } from "./utils.ts";

export default async function getUser({ params }: IRequest) {
	const email = params.email.toLowerCase();

	// check if email is valid
	if (!validateEmail(email)) {
		return new Response("Invalid email", { status: 404 });
	}
	return json(JSON.parse(await USERS.get(email)));
}
