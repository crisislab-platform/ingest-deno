import { IRequest } from "itty-router";
import { serialiseToMiniSEEDUint8Array, startTimeFromDate } from "miniseed";
import * as Sentry from "sentry";
import { getDB, getSensor, log } from "../../utils.ts";

export async function dataBulkExport(req: IRequest) {
	const _sensorID = req.query["sensor_id"] as string;

	const format = (req.query["format"] as string)?.toLowerCase();
	const _channels = req.query["channels"] as string;
	const _from = req.query["from"] as string;
	const _to = req.query["to"] as string;

	if (!_sensorID)
		return new Response("Specify a sensor to export from", {
			status: 400,
		});

	if (!format)
		return new Response("Specify a format to export in", {
			status: 400,
		});

	if (!["tsv1", "miniseed3"].includes(format))
		return new Response("Please choose a valid format: tsv1 or miniseed3", {
			status: 400,
		});

	if (!_channels)
		return new Response("Specify channels to export from", {
			status: 400,
		});

	const channels = _channels.split(",").map((c) => c.toUpperCase());
	const useAllChannels = channels.includes("All");

	if (!_from)
		return new Response("Specify the start of the time range", {
			status: 400,
		});

	if (!_to)
		return new Response("Specify the end of the time range", {
			status: 400,
		});

	let to: number;
	let from: number;
	try {
		to = parseFloat(_to);
		from = parseFloat(_from);
	} catch {
		return new Response("Please provide unix timestamps in seconds", {
			status: 400,
		});
	}

	let sensorID: number;
	try {
		sensorID = parseInt(_sensorID);
	} catch {
		return new Response("Please a valid sensor ID number", {
			status: 400,
		});
	}

	const sensor = await getSensor(sensorID);

	if (!sensor)
		return new Response("Couldn't find a sensor with that ID", {
			status: 404,
		});

	const sql = await getDB();

	switch (format) {
		case "tsv1": {
			let query;
			const channelsQuerySegment = sql(channels);
			if (useAllChannels) {
				query = sql`SELECT EXTRACT(EPOCH FROM data_timestamp) as data_timestamp, data_channel, data_values FROM sensor_data_4 WHERE sensor_id=${sensor.id} AND data_timestamp >= to_timestamp(${from}) AND data_timestamp <= to_timestamp(${to});`;
			} else {
				query = sql`SELECT EXTRACT(EPOCH FROM data_timestamp) as data_timestamp, data_channel, data_values FROM sensor_data_4 WHERE sensor_id=${sensor.id} AND data_channel in ${channelsQuerySegment} AND data_timestamp >= to_timestamp(${from}) AND data_timestamp <= to_timestamp(${to});`;
			}
			
			const body = new ReadableStream({
				start(controller) {
					controller.enqueue(
						new TextEncoder().encode(
							"Sensor Website ID	Data Timestamp	Data Channel	Data Counts\n"
						)
					);
					query
						.forEach((row: Record<string, string>) => {
							const message =
								[
									sensor.id,
									row["data_timestamp"],
									row["data_channel"],
									row["data_values"],
								].join("	") + "\n";
							controller.enqueue(new TextEncoder().encode(message));
						})
						.then(() => {
							controller.close();
						})
						.catch((err) => {
							Sentry.captureException(err);
							log.warn("Error streaming response: ", err);
							controller.error(err);
						});
				},
			});

			// This is for the progress bar
			let countQuery;
			if (useAllChannels){
				countQuery = sql`SELECT count(*)::int FROM sensor_data_4 WHERE sensor_id=${sensor.id} AND data_timestamp >= to_timestamp(${from}) AND data_timestamp <= to_timestamp(${to});`
			} else {
				countQuery = sql`SELECT count(*)::int FROM sensor_data_4 WHERE sensor_id=${sensor.id} AND data_channel in ${channelsQuerySegment} AND data_timestamp >= to_timestamp(${from}) AND data_timestamp <= to_timestamp(${to});`
			}
			const count = parseInt((await countQuery)[0]["count"]);

			if (count === 0) {
				return new Response(
					`No records found for sensor #${sensor.id} at that time in those channels`,
					{
						status: 404,
						headers: {
							"x-number-of-records": "0",
						},
					}
				);
			}

			return new Response(body, {
				headers: {
					"content-type": "text/tsv",
					"x-number-of-records": count + "",
				},
			});
		}
		case "miniseed3": {
			// TODO: Better validation
			const channel = channels[0];

			let query;
			if (useAllChannels) {
				query = sql<
				{ data_timestamp: Date; data_values: number[] }[]
			>`SELECT data_timestamp, data_values FROM sensor_data_4 WHERE sensor_id=${sensor.id} AND data_timestamp >= to_timestamp(${from}) AND data_timestamp <= to_timestamp(${to});`;
			} else {
				query = sql<
				{ data_timestamp: Date; data_values: number[] }[]
			>`SELECT data_timestamp, data_values FROM sensor_data_4 WHERE sensor_id=${sensor.id} AND data_channel=${channel} AND data_timestamp >= to_timestamp(${from}) AND data_timestamp <= to_timestamp(${to});`;

			}
			
			// TODO: Limit time range

			const rows = await query.execute();

			if (rows.length === 0)
				return new Response("No records found", {
					status: 404,
				});

			const startTime: Date = rows[0].data_timestamp;

			// Filling gaps

			const firstTimeGap =
				rows[1].data_timestamp.getTime() - rows[0].data_timestamp.getTime();

			log.info("First time gap:", firstTimeGap);

			// let prevTime: Date = rows[1].data_timestamp;

			// for (let i = 1; i < rows.length; i++) {}

			const data = rows.flatMap((row) => row.data_values);

			// TODO: Change to a proper FDSN network code when we have a station ID
			const identifier = `https://shakemap.crisislab.org.nz/sensor/${sensor.id}`;

			const serialised = serialiseToMiniSEEDUint8Array(data, {
				encoding: "Int32",
				extraHeaderFields: {
					CRISiSLab: {
						data_channel: channel,
						sensor_website_id: sensor.id,
						sensor_rs_station_id: sensor.secondary_id,
						sensor_type: sensor.type,
					},
				},
				sampleRatePeriod: 100,
				sourceIdentifier: identifier,
				startTime: startTimeFromDate(startTime),
			});

			return new Response(serialised, {
				headers: {
					"content-type": "Application/vnd.fdsn.mseed",
					"x-crisislab-data-start": startTime.toISOString(),
				},
			});
		}

		default: {
			return new Response("Unsupported export format", {
				status: 400,
			});
		}
	}
}
