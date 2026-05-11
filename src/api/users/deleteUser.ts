import { IRequest } from "itty-router";
import { getDB, normalizeEmail } from "../../utils.ts";

export default async function deleteUser(request: IRequest) {
	const email = normalizeEmail(request.params.email);
	const sql = await getDB();
	const matchingUsers = await sql<{ id: number }[]>`
		SELECT id FROM users WHERE lower(email)=${email} ORDER BY id;
	`;
	if (matchingUsers.length === 0) {
		return new Response(null, { status: 204 });
	}
	if (matchingUsers.length > 1) {
		return new Response("Multiple users have this email", { status: 409 });
	}

	await sql`DELETE FROM USERS WHERE id=${matchingUsers[0].id};`;

	return new Response(null, {
		status: 204,
	});
}
