import { IRequest, json } from "itty-router";
import { getUserByEmail, normalizeEmail, validateEmail } from "../../utils.ts";

export async function getUserRoute({ params }: IRequest) {
	const email = normalizeEmail(params.email);

	// check if email is valid
	if (!validateEmail(email)) {
		return new Response("Invalid email", { status: 404 });
	}
	const user = await getUserByEmail(email);
	if (!user) return new Response("User not found", { status: 404 });
	return json(user);
}
