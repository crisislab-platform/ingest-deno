import { Datagram } from "./graphs";
import { SensorVariety } from "./main";
import { showMessage, reloadButton } from "./ui";
import { unpack } from "msgpackr";
import type { ChartMarker } from "../../src/types";
import { TimeLineMarker } from "@crisislab/timeline";

const connectionRetryLimit = 5;

export type HandleDataFunction = (data: Datagram) => void;

export function connectSocket(handleData: HandleDataFunction) {
	// Websocket to use
	if (window.CRISiSLab.wsURL === null) {
		// An error is shown by other things
		return;
	}

	const ws = new WebSocket(window.CRISiSLab.wsURL);
	ws.binaryType = "arraybuffer";

	// For debugging in console
	window.CRISiSLab.ws = ws;

	// Status message
	showMessage("Connecting...");

	// Reset
	window.CRISiSLab.haveRenderedPacket = false;

	// Listeners

	ws.addEventListener("open", function () {
		console.info("Connected");
		showMessage("Waiting for data...");
	});
	ws.addEventListener("close", function (event) {
		console.info("Disconnected: ", event.code, event.reason);

		reloadButton.toggleAttribute("disabled", false);

		if (event.code > 4000) {
			showMessage(event.reason ?? "Server closed connection");
		} else {
			if (window.CRISiSLab.connectionAttempts < connectionRetryLimit) {
				showMessage("Reconnecting...");
				setTimeout(() => connectSocket(handleData), 1000);
				window.CRISiSLab.connectionAttempts++;
			} else {
				showMessage("Disconnected too many times, please reload");
			}
		}
	});
	ws.addEventListener("error", function (event) {
		console.warn("WebSocket error: ", event);
		showMessage("WebSocket error: " + event);
		reloadButton.toggleAttribute("disabled", false);
	});
	ws.addEventListener("message", makeHandleMessage(handleData));
}

function makeHandleMessage(handleData: HandleDataFunction) {
	return (event: MessageEvent) => {
		const { data } = event;

		// Unpack with msgpackr
		const parsed = unpack(new Uint8Array(data));
		if (window.CRISiSLab.debugData) console.log(parsed.data);

		if (parsed?.type === "datagram") {
			if (!window.CRISiSLab.connected) {
				console.info("Received first packet");
				showMessage("Rendering data...");
				window.CRISiSLab.connected = true;
			}
			handleData(parsed.data);
		} else if (parsed?.type === "sensor-meta") {
			window.CRISiSLab.sensorMeta = parsed?.data;

			// Update channel aliases from sensor type data
			if (window.CRISiSLab.sensorMeta?.channels) {
				window.CRISiSLab.channelAliases = {};
				for (const channel of window.CRISiSLab.sensorMeta.channels) {
					window.CRISiSLab.channelAliases[channel.id] = channel.name;
				}
			}

			if (
				window.CRISiSLab.sensorMeta?.type
					?.toLowerCase()
					?.includes("raspberry")
			) {
				window.CRISiSLab.sensorVariety = SensorVariety.RaspberryShake;
			} else if (
				window.CRISiSLab.sensorMeta?.type
					?.toLowerCase()
					?.includes("csi")
			) {
				window.CRISiSLab.sensorVariety = SensorVariety.CSI;
			}

			if (window.CRISiSLab.sensorMeta?.online !== true) {
				showMessage(
					`Sensor #${window.CRISiSLab.sensorID} seems to be offline.`,
				);
			}
		} else if (parsed?.type === "message") {
			const message = parsed?.data?.message;
			if (message) {
				showMessage(message);
			}
		} else if (parsed?.type === "add-markers") {
			const _chartMakers = parsed?.data as Array<ChartMarker>;
			if (_chartMakers) {
				const chartMakers = _chartMakers
					.filter((m) => m.enabled)
					.map((m) => ({
						value: m.value,
						label: m.label,
						colour: m.colour,
						lineStyle: m.style,
						labelSide: "before" as const,
						alwaysShow: true,
						id: m.id,
						channel: m.sensor_channel,
					}));
				for (const marker of chartMakers) {
					window.CRISiSLab.channelMarkers[marker.channel] ??= [];
					window.CRISiSLab.channelMarkers[marker.channel].push(
						marker,
					);
					window.CRISiSLab.charts[marker.channel]?.addMarker(marker);
				}
			}
		} else if (parsed?.type === "remove-markers") {
			const IDs = parsed?.data as number[];
			if (IDs) {
				for (const [channel, markers] of Object.entries(
					window.CRISiSLab.channelMarkers,
				)) {
					for (const id of IDs) {
						const listIndex = markers.findIndex(
							// @ts-expect-error shhh
							(m) => m.id! === id,
						);
						if (listIndex !== -1) {
							markers.splice(listIndex, 1);
						}

						const chartIndex = window.CRISiSLab.charts[
							channel
						].markers.findIndex(
							// @ts-expect-error shhh
							(m) => m.id! === id,
						);
						if (chartIndex !== -1) {
							window.CRISiSLab.charts[channel].markers.splice(
								chartIndex,
								1,
							);
						}
					}
				}
			}
		}
	};
}
