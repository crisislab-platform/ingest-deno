import { IRequest, json } from "itty-router";
import { authMiddleware } from "../auth.ts";
import { getSensors, log } from "../../utils.ts";

export default async function listSensors(request: IRequest) {
	const hasSensorsRead =
		(await authMiddleware("sensors:read")(request)) === undefined;

	log.info("Has sensors:read: ", hasSensorsRead);

	return json({
		timestamp: Date.now(),
		sensors: await getSensors(hasSensorsRead),
		privileged: hasSensorsRead ? true : undefined,
	});
}
