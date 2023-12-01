import { Router } from "itty-router";
import { authMiddleware } from "../auth.ts";
import listAll from "./listAll.ts";
import { getUserRoute } from "./getUserRoute.ts";
import { updateUser } from "./updateUser.ts";
import { createUser } from "./createUser.ts";
import deleteUser from "./deleteUser.ts";
import { issueRefreshToken } from "./issueRefreshToken.ts";

const usersRouter = Router({ base: "/api/v2/users" });

// with some routes on it (these will be relative to the base)...
usersRouter
	.get("/", authMiddleware("users:read"), listAll)
	.post("/", authMiddleware("users:write"), createUser)
	.get("/:email", authMiddleware("users:read"), getUserRoute)
	.patch("/:email", authMiddleware("users:write"), updateUser)
	.delete("/:email", authMiddleware("users:write"), deleteUser)
	.get(
		"/get-refresh-token/:email",
		authMiddleware("users:issue_refresh_token"),
		issueRefreshToken
	);

export default usersRouter;
