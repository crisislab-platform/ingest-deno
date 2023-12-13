import { IRequest, error, json } from "itty-router";
import { getDB, log, validateEmail, getUserByEmail } from "../../utils.ts";
import { User } from "../../types.ts";

export async function updateUser(request: IRequest) {
	const email = request.params.email;
	const data = (await request.json()) as Partial<User>;

	if (!validateEmail(email)) return error(400, "Invalid email");

	const oldData = await getUserByEmail(email);

	if (!oldData) {
		return error(404, `User with email ${email} not found`);
	}

	log.info("oldData", oldData, "data", data);

	if (oldData === data) {
		log.info("oldData is the same as new data");
		return new Response("Nothing changed", { status: 400 });
	}

	// Can't let them change the id
	delete data["id"];

	const sql = await getDB();

	await sql`UPDATE users SET ${sql(data)} WHERE id=${oldData["id"]};`;

	// return updated data
	return json({ ...oldData, ...data });
}
