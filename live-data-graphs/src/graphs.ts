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

// Based on MIT-licensed https://github.com/compute-io/quantile/blob/24c66ea5bb6fdfbafeebb878481c5b9635559109/lib/index.js#L66
function quartile(sortedData: number[], p: number): number {
	if (p === 0.0) {
		return sortedData[0];
	}
	// [1] 100th percentile is the maximum value...
	if (p === 1.0) {
		return sortedData[sortedData.length - 1];
	}

	const index = sortedData.length * p - 1;

	// If index is integer
	if (index === Math.floor(index)) {
		return (sortedData[index] + sortedData[index + 1]) / 2.0;
	}

	return sortedData[Math.ceil(index)];
}

const CSI_RECALCULATE_SAMPLE_RATE_PACKET_COUNT = 10;

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

let receivedPackets: Record<string, number> = {};

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

	// Handle CSI not sending their data at a constant rate sometimes
	if (window.CRISiSLab.sensorVariety === SensorVariety.CSI) {
		receivedPackets[channel] ??= 0;
		receivedPackets[channel]++;

		// After some packets, recalculate the sample rate
		if (
			receivedPackets[channel] > CSI_RECALCULATE_SAMPLE_RATE_PACKET_COUNT
		) {
			firstPackets[channel] = packet;
			receivedPackets[channel] = 0;
			delete window.CRISiSLab.sampleGaps[channel];
			return;
		}
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

	const outlierCleanedMeasurements = measurements;
	// CSI sensors sometimes send data values that are huge outliers,
	// even compared to the rest of the packet
	const sorted = measurements.toSorted();
	if (
		window.CRISiSLab.sensorVariety === SensorVariety.CSI &&
		// For some reason, the HNX channel becomes square - it just has too much variance
		channel !== "HNX"
	) {
		const lowerQuartile = quartile(sorted, 0.25);
		const median = quartile(sorted, 0.5);
		const upperQuartile = quartile(sorted, 0.75);
		const iqr = upperQuartile - lowerQuartile;
		const range = 1.5 * iqr;
		const lowerWhisker = lowerQuartile - range;
		const upperWhisker = upperQuartile + range;

		for (let i = 0; i < measurements.length; i++) {
			const point = measurements[i];
			// If this point is an outlier, replace it with the median
			if (point < lowerWhisker || point > upperWhisker) {
				outlierCleanedMeasurements[i] = median;
			}
		}
	}

	for (const i of outlierCleanedMeasurements) {
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

	if (window.CRISiSLab.sensorVariety === SensorVariety.CSI) {
		// CSI sensors sometimes send data out-of order!
		window.CRISiSLab.data[channel].sort(
			(a, b) => (a.time as number) - (b.time as number),
		);
	}

	current[channel] = 0;

	window.CRISiSLab.charts[channel].recompute();

	hideMessages();
	if (!window.CRISiSLab.haveRenderedPacket) {
		window.CRISiSLab.haveRenderedPacket = true;
		reloadButton.toggleAttribute("disabled", true);
	}
}
