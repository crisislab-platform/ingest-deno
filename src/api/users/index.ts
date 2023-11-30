import { Router } from "itty-router";
import auth from "../auth.ts";
import listAll from "./listAll.ts";
import { getUserRoute } from "./getUserRoute.ts";
import { updateUser } from "./updateUser.ts";
import { createUser } from "./createUser.ts";
import deleteUser from "./deleteUser.ts";
import { issueRefreshToken } from "./issueRefreshToken.ts";

const usersRouter = Router({ base: "/api/v2/users" });

// with some routes on it (these will be relative to the base)...
usersRouter
	.get("/", auth("users:read"), listAll)
	.post("/", auth("users:write"), createUser)
	.get("/:email", auth("users:read"), getUserRoute)
	.patch("/:email", auth("users:write"), updateUser)
	.delete("/:email", auth("users:write"), deleteUser)
	.get(
		"/get-refresh-token/:email",
		auth("users:issue_refresh_token"),
		issueRefreshToken
	);

export default usersRouter;
