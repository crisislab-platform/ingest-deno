import { getDBSize } from "../../utils.ts";

export async function databaseSize() {
	return new Response((await getDBSize()) + "");
}
