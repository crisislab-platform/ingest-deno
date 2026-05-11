import { IRequest, json } from "itty-router";
import {
	getDB,
	normalizeEmail,
	toSecureToken,
	validateEmail,
} from "../../utils.ts";

// Issues a refresh token that can be used instead of a username and password to get new tokens
export async function issueRefreshToken({ params }: IRequest) {
	const email = normalizeEmail(params.email);

	// check if email is valid
	if (!validateEmail(email)) {
		return new Response("Invalid email", { status: 404 });
	}

	const sql = await getDB();
	const matchingUsers = await sql<{ id: number }[]>`
		SELECT id FROM users WHERE lower(email)=${email} ORDER BY id;
	`;
	if (matchingUsers.length === 0) {
		return new Response("User not found", { status: 404 });
	}
	if (matchingUsers.length > 1) {
		return new Response("Multiple users have this email", { status: 409 });
	}

	// Generate a token
	const tokenValues = new Int32Array(128);
	crypto.getRandomValues(tokenValues);
	// Convert it to a secure token
	const token = toSecureToken(
		Array.from(tokenValues)
			.map((x) => x.toString(16).padStart(2, "0"))
			.join("")
	);

	// This will overwrite the old token. That's intentional so that there's a way to invalidate old ones`.
	await sql`UPDATE users SET refresh=${token} WHERE id=${matchingUsers[0].id};`;

	// Return the email as well to help the front-end
	return json({ email, token }, { status: 201 });
}
