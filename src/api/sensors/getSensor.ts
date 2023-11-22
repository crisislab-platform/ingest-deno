import { IRequest, json } from "itty-router";
import { getSensor } from "../apiUtils.ts";
import authenticate from "../auth.ts";

export default async function getSensorReq(
	request: IRequest
): Promise<Response> {
	const id = parseInt(request.params.id);

	const hasSensorsRead =
		(await authenticate("sensors:read")(request)) === undefined;

	console.log("Has sensors:read: ", hasSensorsRead);

	const sensor = await getSensor(id, hasSensorsRead);

	return json(sensor);
}
