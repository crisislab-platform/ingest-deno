import { IRequest, json } from "itty-router";
import { getDB, validateEmail } from "../../utils.ts";

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
		Number((
			await sql`SELECT count(*)::int FROM users WHERE email=${userData.email};`
		)?.[0]?.["count"] ?? 0);

	console.log(emailUsed)

	if (emailUsed !== 0) return new Response("Email in use", { status: 400 });

	const id = (
		await sql<{ id: number }[]>`INSERT INTO users ${sql(
			userData
		)} RETURNING id;`
	)[0].id;

	return json({ ...userData, id }, { status: 201 });
}
