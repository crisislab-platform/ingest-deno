import usernameAndPassword from "./usernameAndPassword.ts";
import requestSignInLink from "./requestSignInLink.ts";
import resetPassword from "./resetPassword.ts";
import auth from "../auth.ts";
import { refreshToken } from "./refreshToken.ts";
import { getMe } from "./getMe.ts";
import { Router } from "itty-router";
export const authRouter = Router({ base: "/api/v0/auth" });

// with some routes on it (these will be relative to the base)...
authRouter
	.post("/password", usernameAndPassword)
	.post("/refresh", refreshToken)
	// .get('/reset-password', requestSignInLink)
	// .get('/sign-in-link', requestSignInLink)
	.get("/link/:email/:type", requestSignInLink)
	.post("/reset-password", auth(), resetPassword)
	.get("/me", getMe);
