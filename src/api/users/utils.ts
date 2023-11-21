export const validateEmail = (email: string): boolean => {
	return !!String(email)
		.toLowerCase()
		.match(
			/^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
		);
};

// Secure token generator 9000 copyright 2023 Zade Viggers
// I wasn't sure how if what I was doing was secure enough, so I just made it really hard for people to figure out what I'm doing
export function toSecureToken(base: string): string {
	return btoa(
		crypto.randomUUID() +
			base +
			Number.EPSILON +
			(Math.random() * Math.random() + 3) * Math.PI +
			Math.random() * 69420
	);
}
