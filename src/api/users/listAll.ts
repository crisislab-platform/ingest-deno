import { json } from "itty-router";

export default async function listUsers() {
	const data = (await USERS.list()).keys;

	return json(
		await Promise.all(
			data.map(async (key) => {
				return key.metadata || JSON.parse(await USERS.get(key.name));
			}),
		),
	);
}
