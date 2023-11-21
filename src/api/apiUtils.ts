import { IRequest } from "itty-router";
import { fetchAPI } from "../utils.ts";

export function authMiddleware(roles?: string[]) {
	return async (req: IRequest) => {
		// Check Auth
		const tokenMatch = req.headers.get("Authorization")?.match(/Bearer (.+)/);
		if (!tokenMatch || tokenMatch.length < 2)
			return new Response("Unauthorised", {
				status: 401,
			});

		const token = tokenMatch[1];

		let userDetails;

		// Very cursed
		try {
			// Pretend to be the user making the request to the API
			// to figure out if they have the correct role.
			userDetails = await (
				await fetchAPI("auth/me", {
					headers: { authorization: `Bearer ${token}` },
				})
			).json();
		} catch {
			return new Response("Invalid user token", {
				status: 500,
			});
		}

		if (roles)
			for (const role of roles)
				if (!userDetails.roles.includes(role))
					return new Response("Missing permissions", {
						status: 401,
					});
	};
}
