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
			pointGap,
			xLabel: "Time",
			yLabel,
			plugins: [
				xAxisPlugin(formatTime),
				yAxisPlugin((y) => round(y) + ""),
				doubleClickCopyPlugin(),
				axisLabelPlugin(false, true),
				pointerCrosshairPlugin(),
				highlightNearestPointPlugin(),
				!window.CRISiSLab.hideHoverInspector &&
					nearestPointInfoPopupPlugin(
						formatTime,
						(y) => round(y) + "",
					),
				{
					construct(chart) {
						chart.leftPadding += 20;
					},
				},
			],
		});
		window.CRISiSLab.charts[channel] = chart;

		container.style.opacity = "1";
	}

	for (const i of measurements) {
		let value = i;
		// If the channel is an accelerometer
		if (channel.startsWith("EN")) {
			// Magic number to convert toi m/s^2
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
