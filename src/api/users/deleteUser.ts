import { IRequest } from "itty-router";
import { getDB } from "../../utils.ts";

export default async function deleteUser(request: IRequest) {
	const email = request.params.email.toLowerCase();
	await using sql = getDB();

	await sql`DELETE FROM USERS WHERE email=${email};`;

	return new Response(null, {
		status: 204,
	});
}
