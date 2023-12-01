import { IRequest, json } from "itty-router";
import { getSensor } from "../apiUtils.ts";
import { authMiddleware } from "../auth.ts";
import { log } from "../../utils.ts";

export default async function getSensorReq(
	request: IRequest
): Promise<Response> {
	const id = parseInt(request.params.id);

	const hasSensorsRead =
		(await authMiddleware("sensors:read")(request)) === undefined;

	log.warn("Has sensors:read: ", hasSensorsRead);

	const sensor = await getSensor(id, hasSensorsRead);

	return json(sensor);
}
