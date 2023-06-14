import { unpack } from "msgpackr";
import "./graph";
import { showNoSensorFound } from "./ui";
import { connectSocket } from "./ws";
import { handleData } from "./graph";
import TimeChart from "timechart";

declare global {
	interface Window {
		CRISiSLab: {
			unpack: typeof unpack;
			ws: WebSocket | null;
			connected: boolean;
			haveRenderedPacket: boolean;
			wsURL: string | null;
			sensorID: string | null;
			connectionAttempts: number;
			sensorMeta: null | {
				online?: boolean;
				[key: string]: any;
			};
			charts: Record<string, TimeChart>;
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
