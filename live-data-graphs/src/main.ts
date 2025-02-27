import { unpack } from "msgpackr";
import "./graphs";
import { pauseButton, showNoSensorFound } from "./ui";
import { connectSocket } from "./ws";
import { handleData } from "./graphs";
import type { TimeLine, TimeLineDataPoint } from "@crisislab/timeline";

export enum SensorVariety {
	Unknown,
	RaspberryShake,
	Palert,
	CSI,
}

declare global {
	interface Window {
		CRISiSLab: {
			unpack: typeof unpack;
			debugData: boolean;
			ws: WebSocket | null;
			connected: boolean;
			haveRenderedPacket: boolean;
			hideHoverInspector: boolean;
			showRawChannelNames: boolean;
			sortChannels: string | null;
			wsURL: string | null;
			sensorID: string | null;
			connectionAttempts: number;
			sampleGaps: Record<string, number>;
			yAxisSide: "left" | "right";
			sensorMeta: null | {
				online?: boolean;
				type?: string;
				[key: string]: any;
			};
			sensorVariety: SensorVariety;
			charts: Record<string, TimeLine>;
			data: Record<string, Array<TimeLineDataPoint>>;
			channelMarkers: Record<
				string,
				{ colour: string; value: number; label: string }[]
			>;
		};
	}
}
window.CRISiSLab = {
	connected: false,
	debugData: false,
	haveRenderedPacket: false,
	wsURL: null,
	sensorID: null,
	ws: null,
	connectionAttempts: 0,
	sampleGaps: {},
	sensorMeta: null,
	sensorVariety: SensorVariety.Unknown,
	hideHoverInspector:
		new URLSearchParams(location.search).get("hide-hover-inspector") ===
		"yes",
	sortChannels: new URLSearchParams(location.search).get("sort-channels"),
	showRawChannelNames:
		new URLSearchParams(location.search).get("show-raw-channel-names") ===
		"yes",
	yAxisSide:
		(new URLSearchParams(location.search).get("y-axis-side") as
			| "left"
			| "right") ?? "left",
	// For debugging in console
	unpack,
	charts: {},
	data: {},
};

if (new URLSearchParams(location.search).get("hide-pause-button") === "yes") {
	const reloadButton = document.getElementById("reload");
	if (reloadButton) reloadButton.style.display = "none";
}

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
				? new URLSearchParams(location.search).has("local")
					? `ws://localhost:8080`
					: "wss://crisislab-data.massey.ac.nz"
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
