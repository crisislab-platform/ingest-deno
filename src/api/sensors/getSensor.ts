import { IRequest, json } from "itty-router";
import { getSensor } from "../apiUtils.ts";
import authenticate from "../auth.ts";
import { log } from "../../utils.ts";

export default async function getSensorReq(
	request: IRequest
): Promise<Response> {
	const id = parseInt(request.params.id);

	const hasSensorsRead =
		(await authenticate("sensors:read")(request)) === undefined;

	log.warn("Has sensors:read: ", hasSensorsRead);

	const sensor = await getSensor(id, hasSensorsRead);

	return json(sensor);
}
