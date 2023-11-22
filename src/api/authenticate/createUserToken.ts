import { getUserByEmail } from "../apiUtils.ts";
import { getToken } from "../jwt.ts";

/**
 * Creates a JWT token for the user with the given email.
 *
 * @param {string} email The email of the user to create a token for.
 * @param {string[]} audience The audience of the token. Defaults to ["admin"].
 * @param {number} expiry The expiry time of the token, in seconds. Defaults to 60 * 60 * 24 * 7.
 *
 * @returns The JWT token.
 */

/** */
export default async function createUserToken(
	email: string,
	audience = ["admin"],
	expiry = 60 * 60 * 24 * 7
): Promise<string> {
	const user = await getUserByEmail(email);

	if (!user) {
		throw new Error("User not found");
	}

	const payload = {
		...user,
		iat: Date.now() / 1000,
		exp: Date.now() / 1000 + expiry,
		iss: "https://crisislab.org.nz",
		aud: audience,
	};

	const token = await getToken({ payload });

	return token;
}
