import {
	axisLabelPlugin,
	doubleClickCopyPlugin,
	highlightNearestPointPlugin,
	nearestPointInfoPopupPlugin,
	pointerCrosshairPlugin,
	timeAxisPlugin,
	TimeLine,
	TimeLineDataPoint,
	valueAxisPlugin,
} from "@crisislab/timeline";
import { SensorVariety } from "./main";
import {
	chartsContainer,
	formatTime,
	hideMessages,
	reloadButton,
	round,
	showMessage,
	sortChannels,
} from "./ui";

// CSI sensors all sample at 200Hz
const CSI_SAMPLING_RATE = 200;

export type Datagram = [string, number, ...number[]];

// Graphs
const current: Record<string, number> = {};
// Fallback aliases for backwards compatibility
const fallbackAliases = {
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
const baseWindowMinMaxSizes: Record<string, [number, number]> = {
	// ENN: [-0.2, 0.2],
	// ENE: [-0.2, 0.2],
	// ENZ: [9.7, 9.9],
};
let start;
const maxDataLength = 5000; // Drop packets after this
const timeWindow = 30 * 1000; // 30 seconds

const firstPackets: Record<string, Datagram> = {};

export function handleData(packet: Datagram) {
	const [channel, timestampSeconds, ...measurements] = packet;

	// TODO: Scrap this rubbish and just have a sampling rate for
	// each sensor type set in metadata
	if (window.CRISiSLab.sensorVariety === SensorVariety.CSI) {
		if (typeof window.CRISiSLab.sampleGaps[channel] !== "number") {
			// CSI sensors all sample at 200Hz
			window.CRISiSLab.sampleGaps[channel] = 1000 / CSI_SAMPLING_RATE;
		}
	} else {
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
			: window.CRISiSLab.channelAliases[channel] ?? 
			  fallbackAliases[channel as keyof typeof fallbackAliases] ?? 
			  channel;

		// For sorting
		container.setAttribute("data-channel-id", channel);
		container.setAttribute("data-channel-display", valueAxisLabel);

		const chart = new TimeLine({
			container,
			data: window.CRISiSLab.data[channel],
			valueAxisLabel,
			timeWindow,
			timeAxisLabel: "Time",
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
			valueWindow:
				(channel in baseWindowMinMaxSizes && {
					min: baseWindowMinMaxSizes[channel]?.[0],
					max: baseWindowMinMaxSizes[channel]?.[1],
					overflowBehaviour: "scale",
				}) ||
				undefined,
		});
		window.CRISiSLab.charts[channel] = chart;
		for (const marker of window.CRISiSLab.channelMarkers?.[channel] ?? []) {
			chart.addMarker(marker);
		}
		container.style.opacity = "1";

		sortChannels();
	}

	// Sometimes data gets sent out-of order! We check if this packet
	// is older than the newest data, and if it is, loop backwards
	// over the saved data and find out where this data should be inserted
	let insertAfter: number | null = null;
	if (
		timeOrDateToNumber(window.CRISiSLab.data[channel].at(-1)?.time ?? 0) >
		timestamp
	) {
		// Cursed way to loop backwards: loop forwards then take the inverse
		// of the index.
		for (let i = window.CRISiSLab.data[channel].length - 1; i >= 0; i++) {
			const prev = window.CRISiSLab.data[channel][i];
			// Saved data is older than new data!
			if (
				(typeof prev.time == "number"
					? prev.time
					: prev.time.getTime()) < timestamp
			) {
				insertAfter = i;
			}
		}
	}

	const adjustedMeasurements: TimeLineDataPoint[] = [];
	for (const i of measurements) {
		let value = i;
		if (
			// If the sensor is a raspberry shake
			window.CRISiSLab.sensorVariety === SensorVariety.RaspberryShake &&
			// and the channel is an accelerometer
			channel.startsWith("EN")
		) {
			// Magic number to convert from counts to m/s^2
			// TODO: Make these formulae configurable in metadata
			value = value / 3.845e5;
		}
		adjustedMeasurements.push({
			time: timestamp + current[channel],
			value,
		});
		current[channel] += window.CRISiSLab.sampleGaps[channel]!;
	}

	if (insertAfter == null) {
		window.CRISiSLab.data[channel].push(...adjustedMeasurements);
	} else {
		// Array#splice(i, 0, ..data) inserts at i, pushing everything else down
		window.CRISiSLab.data[channel].splice(
			insertAfter + 1,
			0,
			...adjustedMeasurements,
		);
	}

	current[channel] = 0;

	window.CRISiSLab.charts[channel].recompute();

	hideMessages();
	if (!window.CRISiSLab.haveRenderedPacket) {
		window.CRISiSLab.haveRenderedPacket = true;
		reloadButton.toggleAttribute("disabled", true);
	}

	// Drop old data we don't need
	// TODO: Use time window + 1s or smth for this, instead of a fixed number
	while (window.CRISiSLab.data[channel].length > maxDataLength) {
		window.CRISiSLab.data[channel].shift();
	}
}

function timeOrDateToNumber(t: Date | number): number {
	return typeof t == "number" ? t : t.getTime();
}
