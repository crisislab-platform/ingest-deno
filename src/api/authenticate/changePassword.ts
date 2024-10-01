import { IRequest } from "itty-router";
import { pbkdf2 } from "./crypto-pbkdf2.ts";
import { getDB, getUserByEmail, getUserByID } from "../../utils.ts";

export async function changePassword(request: IRequest) {
	const { password, accountID } = await request.json();

	const sql = await getDB();

	const accountToChange = await getUserByID(accountID);

	const userMakingRequest = await getUserByEmail(request.userPayload.email);
	if (!userMakingRequest) {
		return new Response(`You don't seem to exist...`, { status: 400 });
	}

	if (!accountToChange) {
		return new Response(`Couldn't find account #${accountID}`, { status: 404 });
	}

	let allowedToChange = false;
	if (accountToChange.id === userMakingRequest.id) {
		// Users may change their own password
		allowedToChange = true;
	} else if (userMakingRequest.roles.includes("users:write")) {
		// Or admins can change someone's password
		allowedToChange = true;
	}

	if (!allowedToChange) {
		return new Response(
			"You're not allowed to change someone else's password",
			{ status: 401 }
		);
	}

	const hash = await pbkdf2(password);

	await sql`UPDATE users SET hash=${hash} WHERE id=${accountToChange.id};`;

	return new Response("OK", { status: 200 });
}
