import { IRequest, error, json } from "itty-router";
import {
	getDB,
	log,
	validateEmail,
	getUserByEmail,
	getUserByID,
} from "../../utils.ts";
import { User } from "../../types.ts";

export async function updateUser(request: IRequest) {
	const id = Number(request.params.id);
	const data = (await request.json()) as Partial<User>;

	const oldData = await getUserByID(id);

	if (!oldData) {
		return error(404, `User with id ${id} not found`);
	}

	log.info("oldData", oldData, "data", data);

	if (oldData === data) {
		log.info("oldData is the same as new data");
		return new Response("Nothing changed", { status: 400 });
	}

	if (data.email && !validateEmail(data.email))
		return error(400, "Invalid email");

	// Can't let them change the id
	delete data["id"];

	const sql = await getDB();

	await sql`UPDATE users SET ${sql(data)} WHERE id=${oldData["id"]};`;

	// return updated data
	return json({ ...oldData, ...data });
}
