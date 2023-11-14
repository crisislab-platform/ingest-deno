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
};
let start;
const maxDataLength = 1300;
const pointGap = 10;

let initCount = 0;

export function handleData(packet: Datagram) {
	const [channel, timestampSeconds, ...measurements] = packet;

	if (initCount < 5 && channel !== "EHZ") {
		initCount++;
		return;
	} else {
		initCount = 10;
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

		const chart = new TimeLine({
			container,
			data: window.CRISiSLab.data[channel],
			maxPoints: maxDataLength,
			xLabel: "Time",
			yLabel,
			plugins: [
				xAxisPlugin(formatTime),
				yAxisPlugin((y) => round(y) + ""),
				doubleClickCopyPlugin("closest-x"),
				axisLabelPlugin(false, true),
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
		current[channel] += pointGap;

		if (window.CRISiSLab.data[channel].length > maxDataLength) {
			window.CRISiSLab.data[channel].shift();
		}
	}

	window.CRISiSLab.charts[channel].recompute();

	current[channel] = 0;

	hideMessages();
	if (!window.CRISiSLab.haveRenderedPacket) {
		window.CRISiSLab.haveRenderedPacket = true;
		reloadButton.toggleAttribute("disabled", true);
	}
}
