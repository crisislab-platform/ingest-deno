import { Router } from "itty-router";
import auth from "../auth.ts";
import listAll from "./listAll.ts";
import getUser from "./getUser.ts";
import updateUser from "./createUser.ts";
import deleteUser from "./deleteUser.ts";
import { issueRefreshToken } from "./issueRefreshToken.ts";
// import getSensorToken from './getSensorToken'

const usersRouter = Router({ base: "/api/v0/users" });

// with some routes on it (these will be relative to the base)...
usersRouter
	.get("/", auth("users:read"), listAll)
	//   .get('/:id/token', auth("sensors:update"), getSensorToken)
	.get("/:email", auth("users:read"), getUser)
	.put("/:email", auth("users:write"), updateUser)
	.delete("/:email", auth("users:write"), deleteUser)
	.get(
		"/get-refresh-token/:email",
		auth("users:issue_refresh_token"),
		issueRefreshToken
	);

export default usersRouter;
