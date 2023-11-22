import { json } from "itty-router";
import { User } from "../apiUtils.ts";
import { getDB } from "../../utils.ts";

export default async function listUsers() {
	const sql = await getDB();
	const data = await sql<User[]>`SELECT name, email, id, roles FROM users`;

	return json(data);
}
