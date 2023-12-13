export default function generate(sign_in_link: string, name?: string): string {
	return /*html*/ `<!DOCTYPE html>
<html>
	<head>
		<meta http-equiv="Content-Type" content="text/html;charset=UTF-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	</head>
	<body>
		<img
			src="https://admin.crisislab.org.nz/logo.png"
			alt="CRISiSLab logo"
			width="100"
			height="100"
		/>

		<h1>Forgot your password?</h1>

		<p>
			${
				name ? `Hi ${name}, someone` : "Someone"
			} requested a password reset for your account. If this wasn't you,
			feel free to ignore this email.
		</p>

		<a rel="notrack" href="${sign_in_link}">
			Click here to reset your password
		</a>
		<p>Or copy this link into your browser: ${sign_in_link}</p>
	</body>
</html>`;
}
