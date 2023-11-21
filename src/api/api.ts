import { IRequest, Router } from "npm:itty-router@4.0.23";
import { fetchAPI } from "../utils.ts";
import { databaseSize } from "./database-size.ts";
import { dataBulkExport } from "./dataBulkExport.ts";

function setCORSHeaders(req: IRequest, res: Response) {
	// itty-router's built-in cors is broken
	res.headers.set(
		"Access-Control-Allow-Methods",
		"GET, POST, PUT, PATCH, OPTIONS, DELETE"
	);
	res.headers.set("Access-Control-Allow-Headers", "*");
	res.headers.set("Access-Control-Expose-Headers", "X-Number-Of-Records");
	res.headers.set(
		"Access-Control-Allow-Origin",
		req.headers.get("origin") || "*"
	);
}

function deArrayQueryParamsMiddleware(req: IRequest) {
	for (const [k, v] of Object.entries(req.query)) {
		if (Array.isArray(v)) req.query[k] = v.at(-1);
	}
}

function authMiddleware(roles?: string[]) {
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

const apiRouter = Router({ base: "/api/v1" });
apiRouter
	.all("*", deArrayQueryParamsMiddleware)
	.options("*", (req) => {
		const res = new Response();
		setCORSHeaders(req, res);
		return res;
	})
	.get("/database-size", authMiddleware(["sensor-data:db-size"]), databaseSize)
	.get(
		"/data-bulk-export",
		authMiddleware(["sensor-data:bulk-export"]),
		dataBulkExport
	)
	.get("*", () => new Response("API route not found", { status: 404 }));

export const handleAPI = async (req: IRequest) => {
	const res: Response = await apiRouter.handle(req);
	setCORSHeaders(req, res);
	return res;
};
