import { IRequest, json } from "itty-router";
import { validateEmail } from "./utils.ts";

export default async function createUser(request: IRequest) {
	const email = request.params.email.toLowerCase();

	// check if email is valid
	if (!validateEmail(email)) {
		return new Response("Invalid", { status: 404 });
	}

	const user = JSON.parse(await USERS.get(email)) || {
		roles: ["sensors:read"],
		email,
	};

	const data = await request.json();

	const { name, roles, metadata } = data;

	if (name) {
		user.name = name.toString();
	}

	if (roles) {
		user.roles = roles.map((role) => role.toString());
	}

	if (metadata) {
		user.metadata = metadata;
	}

	await USERS.put(email, JSON.stringify(user), { metadata: user });

	return json(user, { status: 201 });
}
