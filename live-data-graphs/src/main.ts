import { unpack } from "msgpackr";
import "./graphs";
import {
	formatTime,
	hoverText,
	pauseButton,
	round,
	showNoSensorFound,
} from "./ui";
import { connectSocket } from "./ws";
import { handleData, highlightNearestPoint } from "./graphs";
import { TimeLine } from "./chart";

declare global {
	interface Window {
		CRISiSLab: {
			unpack: typeof unpack;
			ws: WebSocket | null;
			connected: boolean;
			haveRenderedPacket: boolean;
			hideHoverInspector: boolean;
			wsURL: string | null;
			sensorID: string | null;
			connectionAttempts: number;
			sensorMeta: null | {
				online?: boolean;
				[key: string]: any;
			};
			charts: Record<string, TimeLine>;
			data: Record<string, Array<{ x: number; y: number }>>;
		};
	}
}
window.CRISiSLab = {
	connected: false,
	haveRenderedPacket: false,
	wsURL: null,
	sensorID: null,
	ws: null,
	connectionAttempts: 0,
	sensorMeta: null,
	hideHoverInspector:
		new URLSearchParams(location.search).get("hide-hover-inspector") ===
		"yes",
	// For debugging in console
	unpack,
	charts: {},
	data: {},
};

if (!location.pathname.includes("/consume/")) showNoSensorFound();
else {
	const sensorID = location.pathname.slice(1).split("/")[1];
	if (!sensorID) showNoSensorFound();
	else {
		// Show pause button
		pauseButton.toggleAttribute("disabled", false);

		window.CRISiSLab.sensorID = sensorID;

		// Page title
		document.title = `Sensor ${sensorID} realtime data`;

		window.CRISiSLab.wsURL = `${
			location.host.startsWith("localhost")
				? "wss://crisislab-data.massey.ac.nz"
				: `wss://${location.host}`
		}/consume/${sensorID}/live`;
	}
	connectSocket(handleData);
}

if (window.CRISiSLab.hideHoverInspector) {
	hoverText.style.display = "none";
}

function draw() {
	requestAnimationFrame(draw);
	for (const chart of Object.values(window.CRISiSLab.charts)) {
		chart.draw();
	}
	if (!window.CRISiSLab.hideHoverInspector) highlightNearestPoint();
}
requestAnimationFrame(draw);
