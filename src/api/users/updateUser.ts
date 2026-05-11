import { error, IRequest, json } from "itty-router";
import {
	getDB,
	getUserByID,
	log,
	normalizeEmail,
	validateEmail,
} from "../../utils.ts";
import { User } from "../../types.ts";

export async function updateUser(request: IRequest) {
	const id = Number(request.params.id);
	const input = (await request.json()) as Partial<User>;
	const data: Partial<User> = {};

	if ("email" in input) data.email = input.email;
	if ("name" in input) data.name = input.name ?? "";
	if ("roles" in input) {
		if (!Array.isArray(input.roles)) return error(400, "Invalid roles");
		data.roles = input.roles.filter((role) => typeof role === "string");
	}

	const oldData = await getUserByID(id);

	if (!oldData) {
		return error(404, `User with id ${id} not found`);
	}

	log.info("oldData", oldData, "data", data);

	if (Object.keys(data).length === 0) {
		log.info("No editable user fields provided");
		return new Response("Nothing changed", { status: 400 });
	}

	if (data.email) {
		data.email = normalizeEmail(data.email);
		if (!validateEmail(data.email)) return error(400, "Invalid email");
	}

	// Can't let them change the id
	delete data["id"];

	const sql = await getDB();

	if (data.email) {
		const [{ count }] = await sql`
			SELECT COUNT(*)::int FROM users
			WHERE lower(email)=${data.email} AND id != ${oldData.id};
		`;
		if (count !== 0) return error(400, "Email in use");
	}

	await sql`UPDATE users SET ${sql(data)} WHERE id=${oldData["id"]};`;

	// return updated data
	return json({ ...oldData, ...data });
}
