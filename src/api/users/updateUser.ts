import { IRequest, error, json } from "itty-router";
import { validateEmail } from "./utils.ts";
import { getDB } from "../../utils.ts";
import { User, getUserByEmail } from "../apiUtils.ts";

export default async function updateUser(request: IRequest) {
	const email = request.params.email;
	const data = (await request.json()) as Partial<User>;

	if (!validateEmail(email)) return error(400, "Invalid email");

	const oldData = await getUserByEmail(email);

	if (!oldData) {
		return error(404, `User with email ${email} not found`);
	}

	log.info("oldData", oldData, "data", data);

	if (oldData === data) {
		console.info("oldData is the same as new data");
		return new Response("Nothing changed", { status: 400 });
	}

	// Can't let them change the id
	delete data["id"];

	if (data.location) {
		data.public_location = randomizeLocation(data.location);
	}

	const sql = await getDB();

	await sql`UPDATE sensors SET ${sql(data)} WHERE id=${id};`;

	// return updated data
	return json({ ...oldData, ...data });
}
