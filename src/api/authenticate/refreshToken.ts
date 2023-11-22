import { IRequest, json } from "itty-router";
import createUserToken from "./createUserToken.ts";
import { getDB } from "../../utils.ts";

export async function refreshToken(req: IRequest) {
	// This is saddening to read. Please ignore.
	// TODO: Fix types here
	const data = (await (req as Request).json()) as Record<string, string | null>;

	// This is fine. Everything is fine.
	const suppliedRefreshToken = data?.refreshToken as string | null;
	const email = data?.email?.toLowerCase?.() as string | null;

	if (email === null || suppliedRefreshToken === null) {
		return new Response("Bad request", { status: 400 });
	}

	// Efficiency
	if (suppliedRefreshToken.length + email.length === 0)
		return new Response("Bad request", { status: 400 });

	const sql = await getDB();

	const actualRefreshToken = (
		await sql<
			{ refresh: string }[]
		>`SELECT refresh FROM users WHERE email=${email}`
	)?.[0]?.refresh;

	if (actualRefreshToken !== suppliedRefreshToken)
		return new Response("Unauthorised", { status: 401 });

	// We should be good to give them a token now
	try {
		const token = await createUserToken(email);
		return json({ token }, { status: 201 });
	} catch (e) {
		return new Response("User does not exist", { status: 401 });
	}
}
