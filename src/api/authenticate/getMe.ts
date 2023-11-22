import { getUserByEmail } from "../apiUtils.ts";
import { verifyToken } from "../jwt.ts";

export async function getMe(req: Request) {
	const authHeader = req.headers.get("authorization");

	if (!authHeader) {
		console.log("No auth header");
		return new Response("Unauthorized", { status: 401 });
	}

	const token = authHeader.substring(6).trim();

	let payload;
	try {
		payload = await verifyToken(token);
	} catch (error) {
		console.error(error);
		return new Response("Unauthorized", { status: 401 });
	}

	const email = payload?.email;

	if (!email || email.length == 0)
		return new Response("Bad token", { status: 401 });

	const data = await getUserByEmail(email);

	if (!data) return new Response("Couldn't find user", { status: 404 });

	return new Response(JSON.stringify(data), {
		headers: { "Content-Type": "application/json" },
	});
}
