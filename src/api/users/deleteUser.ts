import { IRequest } from "itty-router";

export default async function deleteUser(request: IRequest) {
	const email = request.params.email.toLowerCase();

	await USERS.delete(email);

	return new Response(null, {
		status: 204,
	});
}
