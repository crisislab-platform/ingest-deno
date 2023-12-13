import { IRequest, Router, json } from "itty-router";
import { dbRouter } from "./db/dbRouter.ts";
import { authRouter } from "./authenticate/index.ts";
import { authMiddleware } from "./auth.ts";
import usersRouter from "./users/index.ts";
import { sensorsRouter } from "./sensors/index.ts";

function setCORSHeaders(req: IRequest, res: Response) {
	// itty-router's built-in cors is broken
	res.headers.set(
		"Access-Control-Allow-Methods",
		"GET, POST, PUT, PATCH, OPTIONS, DELETE"
	);
	res.headers.set("Access-Control-Allow-Headers", "Authorization");
	res.headers.set("Access-Control-Expose-Headers", "X-Number-Of-Records");
	res.headers.set(
		"Access-Control-Allow-Origin",
		req.headers.get("Origin") || "*"
	);
}

function deArrayQueryParamsMiddleware(req: IRequest) {
	for (const [k, v] of Object.entries(req.query)) {
		if (Array.isArray(v)) req.query[k] = v.at(-1);
	}
}

const apiRouter = Router({ base: "/api/v2" });
apiRouter
	.all("*", deArrayQueryParamsMiddleware)
	.options("*", (req) => {
		const res = new Response();
		setCORSHeaders(req, res);
		return res;
	})
	.all("/sensors/*", sensorsRouter.handle)
	.all("/db/*", dbRouter.handle)
	.all("/auth/*", authRouter.handle)
	.all("/users/*", usersRouter.handle)
	.get(
		"/user",
		authMiddleware(),
		({ user }: { user: Record<string, unknown> } & IRequest) => json(user)
	)
	.get("*", () => new Response("API route not found", { status: 404 }));

export const handleAPI = async (req: IRequest) => {
	const res: Response = (await apiRouter.handle(req)) ?? new Response();
	setCORSHeaders(req, res);
	return res;
};
