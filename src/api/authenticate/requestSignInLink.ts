import { IRequest } from "itty-router";
import createUserToken from "./createUserToken.ts";

import {
	generateReset,
	generateSignIn,
	generateWelcome,
} from "../emails/index.ts";
import { getUserByEmail } from "../../utils.ts";

const emails = {
	welcome: {
		subject: "Welcome to CRISiSLab",
		content: generateWelcome,
	},
	reset: {
		subject: "Reset your CRISiSLab password",
		content: generateReset,
	},
	"sign-in": {
		subject: "Sign in to CRISiSLab",
		content: generateSignIn,
	},
};

export default async function requestSignInLink(
	request: IRequest
): Promise<Response> {
	const {
		email,
		type = "welcome",
	}: { email?: string; type?: keyof typeof emails } = request.params || {};

	if (!email) {
		return new Response("Invalid", { status: 404 });
	}

	const user = await getUserByEmail(email);

	if (!user) {
		return new Response("User not found", { status: 404 });
	}

	const token = await createUserToken(email, ["admin"], 7 * 24 * 60 * 60);

	const url = new URL(request.url);

	const emailTemplate = emails[type] || emails["sign-in"];

	const content = emailTemplate.content(
		`https://admin.crisislab.org.nz/token-sign-in?token=${token}&type=${type}${
			url.searchParams.get("return_to")
				? `&return_to=${url.searchParams.get("return_to")}`
				: ""
		}`,
		user.name
	);

	const emailPayload = {
		personalizations: [
			{
				to: [{ email, name: user.name }],
				dkim_domain: Deno.env.get("DKIM_DOMAIN"),
				dkim_selector: Deno.env.get(" DKIM_SELECTOR"),
				dkim_private_key: Deno.env.get(" DKIM_PRIVATE_KEY"),
			},
		],
		from: {
			email: Deno.env.get("SENDER_EMAIL"),
			name: Deno.env.get("SENDER_NAME"),
		},
		subject: emailTemplate.subject,
		content: [
			{
				type: "text/html",
				value: content,
			},
		],
	};

	const res = await fetch("https://api.mailchannels.net/tx/v1/send", {
		method: "POST",
		body: JSON.stringify(emailPayload),
		headers: {
			"content-type": "application/json",
		},
	});

	if (res.ok) {
		return new Response("Email sent");
	}

	return new Response(
		`Failed to send email. Got a ${res.status} from mailchennels.`,
		{ status: 500 }
	);
}
