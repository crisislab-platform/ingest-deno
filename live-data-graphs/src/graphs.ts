import {
	TimeLine,
	xAxisPlugin,
	yAxisPlugin,
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
	EH3: "Vertical Geophone (counts)",
	EN3: "Y axis acceleration (m/s²)",
	EN1: "X axis acceleration (m/s²)",
	EN2: "Z axis acceleration (m/s²)",
	EHZ: "Vertical Geophone (counts)",
	ENN: "Y axis acceleration (m/s²)",
	ENE: "X axis acceleration (m/s²)",
	ENZ: "Z axis acceleration (m/s²)",
	CLX: "X axis acceleration (m/s²)",
	CLY: "Y axis acceleration (m/s²)",
	CLZ: "Z axis acceleration (m/s²)",
};
let start;
const maxDataLength = 1300;

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

		const yLabel = aliases[channel as keyof typeof aliases] || channel;

		// For sorting
		container.setAttribute("data-channel-id", channel);
		container.setAttribute("data-channel-display", yLabel);

		const chart = new TimeLine({
			container,
			data: window.CRISiSLab.data[channel],
			maxPoints: maxDataLength,
			xLabel: "Time",
			yLabel,
			plugins: [
				xAxisPlugin(formatTime, 5),
				yAxisPlugin(
					(y) => round(y) + "",
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
				{
					construct(chart) {
						chart.padding.left += 20;
					},
				},
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
			x: timestamp + current[channel],
			y: value,
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
