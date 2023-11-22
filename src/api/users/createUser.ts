import { IRequest, json } from "itty-router";
import { validateEmail } from "./utils.ts";
import { getDB } from "../../utils.ts";

export default async function createUser(request: IRequest) {
	const email = request.params.email.toLowerCase();

	// check if email is valid
	if (!validateEmail(email)) {
		return new Response("Invalid", { status: 404 });
	}

	const sql = await getDB();

	const emailUsed =
		(await sql`SELECT count(*) FROM users WHERE email=${email}`)?.[0] ?? null;

	if (emailUsed) return new Response("Email in use", { status: 400 });

	const data = await request.json();
	const userData = {
		email: data.email,
		name: data.name ?? "",
		roles: data.roles ?? [],
	};

	const id = (
		await sql<{ id: number }[]>`INSERT INTO users ${sql(userData)} RETURNING id`
	)[0].id;

	return json({ ...userData, id }, { status: 201 });
}
