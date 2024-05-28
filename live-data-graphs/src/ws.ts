import { Datagram } from "./graphs";
import { SensorVariety } from "./main";
import { showMessage, reloadButton } from "./ui";
import { unpack } from "msgpackr";

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
		}
	};
}
