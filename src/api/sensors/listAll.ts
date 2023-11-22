import { IRequest, json } from "itty-router";
import authenticate from "../auth.ts";
import { getSensors } from "../apiUtils.ts";

export default async function listSensors(request: IRequest) {
	const hasSensorsRead =
		(await authenticate("sensors:read")(request)) === undefined;

	console.log("Has sensors:read: ", hasSensorsRead);

	return json({
		timestamp: Date.now(),
		sensors: await getSensors(hasSensorsRead),
		privileged: hasSensorsRead ? true : undefined,
	});
}
