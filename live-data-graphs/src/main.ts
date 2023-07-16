import { unpack } from "msgpackr";
import "./graphs";
import { pauseButton, showNoSensorFound } from "./ui";
import { connectSocket } from "./ws";
import { handleData } from "./graphs";
import type { TimeLine } from "@crisislab/timeline";

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

		// While running the Vite dev server we want to connect to the production server
		// While running the production build on a local server we want to connect (insecurely) to the local server
		// Otherwise we connect (securely) to the server on the origin the page is being served from
		window.CRISiSLab.wsURL = `${
			import.meta.env.DEV
				? "wss://crisislab-data.massey.ac.nz"
				: location.host.startsWith("localhost")
				? `ws://${location.host}`
				: `wss://${location.host}`
		}/consume/${sensorID}/live`;
	}
	connectSocket(handleData);
}

function draw() {
	requestAnimationFrame(draw);
	for (const chart of Object.values(window.CRISiSLab.charts)) {
		chart.draw();
	}
}
draw();
