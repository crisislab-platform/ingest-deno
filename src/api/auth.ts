import { IRequest } from "itty-router";
import { verifyToken } from "./jwt.ts";
import { log } from "../utils.ts";

// Middleware to make sure a user is logged in, and has the correct role
export const authMiddleware = (role?: string) => async (request: IRequest) => {
	const authHeader = request.headers.get("authorization");

	if (!authHeader) {
		log.info("No auth header");
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

	// Check that payload has the required audience
	if (!payload.aud.includes("admin")) {
		log.warn("Invalid audience");
		return new Response("Invalid audience", { status: 401 });
	} else if (role && !payload["roles"].includes(role)) {
		log.warn(`Requires role ${role}`);
		return new Response(`Requires role ${role}`, { status: 401 });
	}

	// Set user email to lowercase
	payload.email = payload.email.toLowerCase();

	request.user = payload;
};
