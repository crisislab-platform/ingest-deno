import usernameAndPassword from "./usernameAndPassword.ts";
import { changePassword } from "./changePassword.ts";
import { authMiddleware } from "../auth.ts";
import { refreshToken } from "./refreshToken.ts";
import { Router } from "itty-router";
export const authRouter = Router({ base: "/api/v2/auth" });

// with some routes on it (these will be relative to the base)...
authRouter
	.post("/password", usernameAndPassword)
	.post("/refresh", refreshToken)
	.patch("/change-password", authMiddleware(), changePassword);
