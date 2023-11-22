import { json } from "itty-router";
import { getSensor } from "../apiUtils.ts";

export default async function setOnline(request: Request): Promise<Response> {
	const data = await request.json();

	console.log("data", data);

	const {
		sensor: id,
		timestamp,
		connected: online,
	} = data as {
		sensor?: number | unknown;
		timestamp?: number | unknown;
		connected?: boolean | unknown;
	};

	if (
		!(typeof id === "number" || typeof id === "string") ||
		typeof online !== "boolean" ||
		typeof timestamp !== "number"
	) {
		console.log(
			`Invalid request to update online status for sensor #${id} to ${
				online ? "online" : "offline"
			}`
		);
		return new Response("Bad request", { status: 400 });
	}

	console.info(
		`Updating online status for sensor #${id}: now ${
			online === undefined ? "unknown" : online ? "online" : "offline"
		}`
	);

	const oldSensor = await getSensor(id);

	if (oldSensor.online === online) {
		console.info(
			"Nothing changed - old online status and new online status are equal"
		);
		return new Response("Nothing changed", { status: 400 });
	}

	const newSensor = { ...oldSensor, timestamp, online };

	await SENSORS.put(id + "", JSON.stringify(newSensor));

	ONLINE_STATUS_UPDATES.writeDataPoint({
		indexes: [id + ""],
	});

	return json({ success: true });
}
