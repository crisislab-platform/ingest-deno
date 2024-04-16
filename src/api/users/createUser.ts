import { IRequest, json } from "itty-router";
import { validateEmail, getDB } from "../../utils.ts";

export async function createUser(request: IRequest) {
	const data = await request.json();
	const userData = {
		email: data.email,
		name: data.name ?? "",
		roles: data.roles ?? [],
	};

	// check if email is valid
	if (!validateEmail(userData.email)) {
		return new Response("Invalid", { status: 404 });
	}

	const sql = await getDB();

	const emailUsed =
		(
			await sql`SELECT count(*) FROM users WHERE email=${userData.email};`
		)?.[0]?.["count"] ?? null;

	if (emailUsed) return new Response("Email in use", { status: 400 });

	const id = (
		await sql<{ id: number }[]>`INSERT INTO users ${sql(
			userData
		)} RETURNING id;`
	)[0].id;

	return json({ ...userData, id }, { status: 201 });
}
