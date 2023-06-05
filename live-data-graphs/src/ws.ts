import { showMessage, reloadButton } from "./ui";
import { unpack } from "msgpackr";

const connectionRetryLimit = 5;

export type HandleDataFunction = (data: any) => void;

export function connectSocket(handleData: HandleDataFunction) {
	// Websocket to use
	if (window.CRISiSLab.wsURL === null) {
		showMessage("Sensor WebSocket URL missing");
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

	ws.addEventListener("open", function () {
		console.info("Connected");
		showMessage("Waiting for data...");
	});
	ws.addEventListener("close", function (event) {
		console.info("Disconnected: ", event.code, event.reason);

		reloadButton.toggleAttribute("disabled", false);

		if (event.code === 4404) {
			showMessage(event.reason ?? "Not found");
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
	ws.addEventListener("message", makeHandleMessage(handleData));
}

function makeHandleMessage(handleData: HandleDataFunction) {
	return (event: MessageEvent) => {
		const { data } = event;

		// Unpack with msgpackr
		const parsed = unpack(new Uint8Array(data));

		if (parsed?.type === "datagram") {
			if (!window.CRISiSLab.connected) {
				console.info("Received first packet");
				showMessage("Rendering data...");
				window.CRISiSLab.connected = true;
			}
			for (const packet of parsed.data) {
				handleData(packet);
			}
		} else if (parsed?.type === "sensor-meta") {
			window.CRISiSLab.sensorMeta = parsed?.data;
			if (window.CRISiSLab.sensorMeta?.online === false) {
				showMessage(
					`Connected, but sensor${window.CRISiSLab.sensorID} seems to be offline.`,
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
