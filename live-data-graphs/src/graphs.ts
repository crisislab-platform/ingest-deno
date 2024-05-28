import {
	TimeLine,
	timeAxisPlugin,
	valueAxisPlugin,
	axisLabelPlugin,
	doubleClickCopyPlugin,
	pointerCrosshairPlugin,
	nearestPointInfoPopupPlugin,
	highlightNearestPointPlugin,
} from "@crisislab/timeline";
import {
	hideMessages,
	reloadButton,
	chartsContainer,
	formatTime,
	round,
	showMessage,
	sortChannels,
} from "./ui";
import { SensorVariety } from "./main";

export type Datagram = [string, number, ...number[]];

// Graphs
const current: Record<string, number> = {};
const aliases = {
	EH3: "Geophone (counts)",
	EN3: "Y acceleration (m/s²)",
	EN1: "X acceleration (m/s²)",
	EN2: "Z acceleration (m/s²)",
	EHZ: "Geophone (counts)",
	ENN: "Y acceleration (m/s²)",
	ENE: "X acceleration (m/s²)",
	ENZ: "Z acceleration (m/s²)",
	// CLX: "X axis acceleration (m/s²)",
	// CLY: "Y axis acceleration (m/s²)",
	// CLZ: "Z axis acceleration (m/s²)",
};
let start;
const maxDataLength = 5000;
const timeWindow = 30 * 1000; // 30 seconds

const firstPackets: Record<string, Datagram> = {};

export function handleData(packet: Datagram) {
	const [channel, timestampSeconds, ...measurements] = packet;

	if (!firstPackets[channel]) {
		firstPackets[channel] = packet;
		showMessage("Waiting for second sample...");
		return;
	} else if (!window.CRISiSLab.sampleGaps[channel]) {
		showMessage("Calculating sampling rate...");

		const firstPacket = firstPackets[channel]!;
		const [, firstTimestampSeconds, ...firstMeasurements] = firstPacket;

		const timeGapSeconds = timestampSeconds - firstTimestampSeconds;
		const samplingRate = firstMeasurements.length / timeGapSeconds;
		window.CRISiSLab.sampleGaps[channel] = 1000 / samplingRate;

		// Do the first packet, then keep doing this one
		handleData(firstPacket);
	}

	const timestamp = timestampSeconds * 1000;

	start ||= timestamp;
	window.CRISiSLab.data[channel] ||= [];
	current[channel] ||= 0;

	if (!window.CRISiSLab.charts[channel]) {
		const container = document.createElement("div");
		container.className = "chart";
		container.id = channel;
		chartsContainer.appendChild(container);

		const valueAxisLabel = window.CRISiSLab.showRawChannelNames
			? channel
			: aliases[channel as keyof typeof aliases] ?? channel;

		// For sorting
		container.setAttribute("data-channel-id", channel);
		container.setAttribute("data-channel-display", valueAxisLabel);

		const chart = new TimeLine({
			container,
			data: window.CRISiSLab.data[channel],
			timeWindow,
			timeAxisLabel: "Time",
			valueAxisLabel,
			plugins: [
				timeAxisPlugin(undefined, 5),
				valueAxisPlugin(
					(y) => {
						const rounded = round(y);
						const fixed = rounded.toFixed(2);
						if (fixed.length > 3) return rounded + "";
						return fixed;
					},
					5,
					window.CRISiSLab.yAxisSide,
				),
				doubleClickCopyPlugin("closest-x"),
				axisLabelPlugin(
					false,
					true,
					"bottom",
					window.CRISiSLab.yAxisSide,
				),
				!window.CRISiSLab.hideHoverInspector &&
					pointerCrosshairPlugin(),
				!window.CRISiSLab.hideHoverInspector &&
					highlightNearestPointPlugin("closest-x"),
				!window.CRISiSLab.hideHoverInspector &&
					nearestPointInfoPopupPlugin(
						formatTime,
						(y) => round(y) + "",
						"closest-x",
					),
			],
		});
		window.CRISiSLab.charts[channel] = chart;

		container.style.opacity = "1";

		sortChannels();
	}

	for (const i of measurements) {
		let value = i;
		if (
			// If the sensor is a raspberry shake
			window.CRISiSLab.sensorVariety === SensorVariety.RaspberryShake &&
			// and the channel is an accelerometer
			channel.startsWith("EN")
		) {
			// Magic number to convert from counts to m/s^2
			value = value / 3.845e5;
		}
		window.CRISiSLab.data[channel].push({
			time: timestamp + current[channel],
			value,
		});
		current[channel] += window.CRISiSLab.sampleGaps[channel]!;

		if (window.CRISiSLab.data[channel].length > maxDataLength) {
			window.CRISiSLab.data[channel].shift();
		}
	}
	current[channel] = 0;

	window.CRISiSLab.charts[channel].recompute();

	hideMessages();
	if (!window.CRISiSLab.haveRenderedPacket) {
		window.CRISiSLab.haveRenderedPacket = true;
		reloadButton.toggleAttribute("disabled", true);
	}
}
