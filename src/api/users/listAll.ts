import { json } from "itty-router";
import { User } from "../../types.ts";
import { getDB } from "../../utils.ts";

export default async function listUsers() {
	await using sql = getDB();
	const data = await sql<User[]>`SELECT name, email, id, roles FROM users`;

	return json(data);
}
