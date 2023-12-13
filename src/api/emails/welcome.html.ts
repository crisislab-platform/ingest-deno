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

		<h1>
			${name ? `Hello ${name}` : "Hello there"}!
		</h1>

		<p>
			You've been invited to access the CRISiSLab sensor dashboard. To setup
			your account, click the button below.
		</p>

		<a rel="notrack" href="${sign_in_link}">Click here to get started</a>
		<p>Or copy this link into your browser: ${sign_in_link}</p>
	</body>
</html>`;
}
