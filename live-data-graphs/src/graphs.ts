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
import { removeInstrumentResponse } from "./response-removal";
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
const EVIL_CURSED_RASPBERRY_SHAKE_ACCELEROMETER_GAIN = 3.845e5;

export type Datagram = [string, number, ...number[]];

type ChannelDisplayMode = "legacy" | "counts" | "response";

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

const current: Record<string, number> = {};
const firstPackets: Record<string, Datagram> = {};
const channelDisplayModes: Record<string, ChannelDisplayMode> = {};

export function handleData(packet: Datagram) {
	const [channel, timestampSeconds, ...measurements] = packet;

	// TODO: Scrap this rubbish and just have a sampling rate for
	// each sensor type set in metadata
	if (window.CRISiSLab.sensorVariety === SensorVariety.CSI) {
		if (typeof window.CRISiSLab.sampleGaps[channel] !== "number") {
			window.CRISiSLab.sampleGaps[channel] = 1000 / CSI_SAMPLING_RATE;
		}
	} else if (!firstPackets[channel]) {
		firstPackets[channel] = packet;
		showMessage("Waiting for second sample...");
		return;
	} else if (!window.CRISiSLab.sampleGaps[channel]) {
		showMessage("Calculating sampling rate...");

		const firstPacket = firstPackets[channel];
		const [, firstTimestampSeconds, ...firstMeasurements] = firstPacket;
		const timeGapSeconds = timestampSeconds - firstTimestampSeconds;
		const samplingRate = firstMeasurements.length / timeGapSeconds;
		window.CRISiSLab.sampleGaps[channel] = 1000 / samplingRate;

		// Process the saved packet before continuing with the current packet.
		handleData(firstPacket);
	}

	const timestamp = timestampSeconds * 1000;
	window.CRISiSLab.rawData[channel] ||= [];
	window.CRISiSLab.data[channel] ||= [];
	current[channel] ||= 0;

	const rawMeasurements: TimeLineDataPoint[] = measurements.map((value) => {
		const point = {
			time: timestamp + current[channel],
			value,
		};
		current[channel] += window.CRISiSLab.sampleGaps[channel];
		return point;
	});
	current[channel] = 0;

	insertRawData(channel, timestamp, rawMeasurements);
	while (window.CRISiSLab.rawData[channel].length > maxDataLength) {
		window.CRISiSLab.rawData[channel].shift();
	}

	reprocessChannelData(channel);
	ensureChart(channel);
	window.CRISiSLab.charts[channel].recompute();

	hideMessages();
	if (!window.CRISiSLab.haveRenderedPacket) {
		window.CRISiSLab.haveRenderedPacket = true;
		reloadButton.toggleAttribute("disabled", true);
	}
}

export function reprocessAllChannelData() {
	for (const channel of Object.keys(window.CRISiSLab.rawData)) {
		reprocessChannelData(channel);
		updateChartLabel(channel);
		window.CRISiSLab.charts[channel]?.recompute();
	}
}

function reprocessChannelData(channel: string) {
	const rawData = window.CRISiSLab.rawData[channel] ?? [];
	let displayData: TimeLineDataPoint[];
	let mode: ChannelDisplayMode;

	if (window.CRISiSLab.disableResponseRemoval) {
		displayData = legacyAdjustedData(channel, rawData);
		mode = window.CRISiSLab.enableLegacyRaspberryShakeScaling
			? "legacy"
			: "counts";
	} else if (window.CRISiSLab.responseRemovalFailed) {
		displayData = copyPoints(rawData);
		mode = "counts";
	} else {
		const response = window.CRISiSLab.responses[channel];
		if (response && !window.CRISiSLab.responseRemovalFailedChannels[channel]) {
			try {
				const corrected = removeInstrumentResponse(
					rawData,
					window.CRISiSLab.sampleGaps[channel],
					response,
				);
				if (corrected) {
					displayData = corrected;
					mode = "response";
				} else {
					displayData = copyPoints(rawData);
					mode = "counts";
				}
			} catch (error) {
				console.error(
					`Unable to remove the instrument response for ${channel}; showing counts`,
					error,
				);
				window.CRISiSLab.responseRemovalFailedChannels[channel] = true;
				displayData = copyPoints(rawData);
				mode = "counts";
			}
		} else if (
			response ||
			Object.keys(window.CRISiSLab.responses).length > 0
		) {
			displayData = copyPoints(rawData);
			mode = "counts";
		} else {
			displayData = legacyAdjustedData(channel, rawData);
			mode = window.CRISiSLab.enableLegacyRaspberryShakeScaling
				? "legacy"
				: "counts";
		}
	}

	if (
		mode === "response" &&
		channelDisplayModes[channel] !== "response"
	) {
		console.info(`Instrument response removal active for ${channel}`);
	}
	channelDisplayModes[channel] = mode;
	const chartData = window.CRISiSLab.data[channel];
	chartData.splice(0, chartData.length, ...displayData);
	updateChartLabel(channel);
}

function insertRawData(
	channel: string,
	timestamp: number,
	measurements: TimeLineDataPoint[],
) {
	const rawData = window.CRISiSLab.rawData[channel];
	if (timeOrDateToNumber(rawData.at(-1)?.time ?? 0) <= timestamp) {
		rawData.push(...measurements);
		return;
	}

	let insertAfter = -1;
	for (let index = rawData.length - 1; index >= 0; index--) {
		if (timeOrDateToNumber(rawData[index].time) < timestamp) {
			insertAfter = index;
			break;
		}
	}
	rawData.splice(insertAfter + 1, 0, ...measurements);
}

function legacyAdjustedData(
	channel: string,
	rawData: TimeLineDataPoint[],
): TimeLineDataPoint[] {
	const adjustRaspberryShakeAccelerometer =
		window.CRISiSLab.enableLegacyRaspberryShakeScaling &&
		window.CRISiSLab.sensorVariety === SensorVariety.RaspberryShake &&
		channel.startsWith("EN");
	return rawData.map((point) => ({
		time: point.time,
		value: adjustRaspberryShakeAccelerometer
			? point.value / EVIL_CURSED_RASPBERRY_SHAKE_ACCELEROMETER_GAIN
			: point.value,
	}));
}

function copyPoints(data: TimeLineDataPoint[]): TimeLineDataPoint[] {
	return data.map((point) => ({ time: point.time, value: point.value }));
}

function ensureChart(channel: string) {
	if (window.CRISiSLab.charts[channel]) {
		updateChartLabel(channel);
		return;
	}

	const container = document.createElement("div");
	container.className = "chart";
	container.id = channel;
	chartsContainer.appendChild(container);

	const valueAxisLabel = valueAxisLabelFor(channel);
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
			!window.CRISiSLab.hideHoverInspector && pointerCrosshairPlugin(),
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
	for (const marker of window.CRISiSLab.channelMarkers[channel] ?? []) {
		chart.addMarker(marker);
	}
	container.style.opacity = "1";
	sortChannels();
}

function updateChartLabel(channel: string) {
	const chart = window.CRISiSLab.charts[channel];
	if (!chart) return;

	const label = valueAxisLabelFor(channel);
	if (chart.valueAxisLabel === label) return;
	chart.valueAxisLabel = label;
	chart.container.setAttribute("data-channel-display", label);
	const axisLabel = chart.container.querySelector(
		".crisislab-timeline-value-axis",
	);
	if (axisLabel) axisLabel.textContent = label;
	if (window.CRISiSLab.sortChannels === "display") sortChannels();
}

function valueAxisLabelFor(channel: string): string {
	const baseLabel = window.CRISiSLab.showRawChannelNames
		? channel
		: window.CRISiSLab.channelAliases[channel] ??
			fallbackAliases[channel as keyof typeof fallbackAliases] ??
			channel;

	switch (channelDisplayModes[channel]) {
		case "response":
			return withUnit(baseLabel, "m");
		case "counts":
			return withUnit(baseLabel, "counts");
		default:
			return baseLabel;
	}
}

function withUnit(label: string, unit: string): string {
	return `${label.replace(/\s*\([^)]*\)\s*$/, "")} (${unit})`;
}

function timeOrDateToNumber(time: Date | number): number {
	return typeof time === "number" ? time : time.getTime();
}
