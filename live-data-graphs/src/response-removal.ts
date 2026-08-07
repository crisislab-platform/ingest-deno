import type { TimeLineDataPoint } from "@crisislab/timeline";
import {
	fdsnsourceid as PCFDSNSourceID,
	filter as PCFilter,
	luxon as PCLuxon,
	seismogram as PCSeismogram,
	seismogramsegment as PCSeismogramSegment,
	stationxml as PCStationXML,
	taper as PCTaper,
	transfer as PCTransfer,
} from "seisplotjs";

const MINIMUM_RESPONSE_SAMPLES = 32;

export const responseRemovalConfig = {
	targetBlockDurationSeconds: 4,
	lowCutHz: 0.2,
	lowPassHz: 0.5,
	highPassNyquistFraction: 0.8,
	highCutNyquistFraction: 0.95,
	timeTaperWidth: 0.1,
};

export type ResponseRemovalResult = {
	data: TimeLineDataPoint[];
	unit: string;
};

type PCResponseProcessorState = {
	response: PCStationXML.Response;
	sampleGapMilliseconds: number;
	blockSize: number;
	hopSize: number;
	edgeSize: number;
	nextWindowStartTime: number;
	firstWindow: boolean;
	finalizedData: TimeLineDataPoint[];
	finalizedThroughTime: number;
};

const processorStates = new Map<string, PCResponseProcessorState>();

export function removeInstrumentResponse(
	channel: string,
	rawData: TimeLineDataPoint[],
	sampleGapMilliseconds: number,
	response: PCStationXML.Response,
): ResponseRemovalResult | null {
	if (rawData.length < MINIMUM_RESPONSE_SAMPLES) return null;

	let state = processorStates.get(channel);
	if (
		!state ||
		state.response !== response ||
		state.sampleGapMilliseconds !== sampleGapMilliseconds
	) {
		state = createProcessorState(
			rawData,
			sampleGapMilliseconds,
			response,
		);
		processorStates.set(channel, state);
	}

	const earliestRawTime = timeToNumber(rawData[0].time);
	if (state.nextWindowStartTime < earliestRawTime - sampleGapMilliseconds / 2) {
		state = createProcessorState(
			rawData,
			sampleGapMilliseconds,
			response,
		);
		processorStates.set(channel, state);
	}
	state.finalizedData = state.finalizedData.filter(
		(point) => timeToNumber(point.time) >= earliestRawTime,
	);

	while (true) {
		const startIndex = findWindowStartIndex(
			rawData,
			state.nextWindowStartTime,
			sampleGapMilliseconds,
		);
		if (
			startIndex === -1 ||
			rawData.length - startIndex < state.blockSize
		) {
			break;
		}

		const window = rawData.slice(
			startIndex,
			startIndex + state.blockSize,
		);
		const corrected = correctWindow(
			window,
			sampleGapMilliseconds,
			response,
		);
		const stableStart = state.firstWindow ? 0 : state.edgeSize;
		const stableEnd = state.blockSize - state.edgeSize;
		const stableData = corrected.slice(stableStart, stableEnd);
		for (const point of stableData) {
			if (timeToNumber(point.time) > state.finalizedThroughTime) {
				state.finalizedData.push(point);
			}
		}
		state.finalizedThroughTime = timeToNumber(
			stableData[stableData.length - 1].time,
		);
		state.nextWindowStartTime = timeToNumber(window[state.hopSize].time);
		state.firstWindow = false;
	}

	const provisional = processProvisionalTail(
		rawData,
		state,
		sampleGapMilliseconds,
		response,
	);
	const unit = nativeResponseUnit(response);
	return {
		data: [...state.finalizedData, ...provisional],
		unit: unit.display,
	};
}

export function resetInstrumentResponseProcessor(channel?: string) {
	if (channel) processorStates.delete(channel);
	else processorStates.clear();
}

function createProcessorState(
	rawData: TimeLineDataPoint[],
	sampleGapMilliseconds: number,
	response: PCStationXML.Response,
): PCResponseProcessorState {
	const sampleRate = 1000 / sampleGapMilliseconds;
	const blockSize = nextPowerOfTwo(
		Math.ceil(
			sampleRate * responseRemovalConfig.targetBlockDurationSeconds,
		),
	);
	return {
		response,
		sampleGapMilliseconds,
		blockSize,
		hopSize: blockSize / 2,
		edgeSize: blockSize / 4,
		nextWindowStartTime: timeToNumber(rawData[0].time),
		firstWindow: true,
		finalizedData: [],
		finalizedThroughTime: Number.NEGATIVE_INFINITY,
	};
}

function processProvisionalTail(
	rawData: TimeLineDataPoint[],
	state: PCResponseProcessorState,
	sampleGapMilliseconds: number,
	response: PCStationXML.Response,
): TimeLineDataPoint[] {
	let source: TimeLineDataPoint[];
	let actualStartIndex: number;

	if (rawData.length >= state.blockSize) {
		actualStartIndex = rawData.length - state.blockSize;
		source = rawData.slice(actualStartIndex);
	} else {
		actualStartIndex = 0;
		source = padToBlockSize(
			rawData,
			state.blockSize,
			sampleGapMilliseconds,
		);
	}

	const corrected = correctWindow(
		source,
		sampleGapMilliseconds,
		response,
	);
	const actualLength = rawData.length - actualStartIndex;
	return corrected
		.slice(0, actualLength)
		.filter(
			(point) =>
				timeToNumber(point.time) > state.finalizedThroughTime,
		);
}

function padToBlockSize(
	rawData: TimeLineDataPoint[],
	blockSize: number,
	sampleGapMilliseconds: number,
): TimeLineDataPoint[] {
	const padded = rawData.map((point) => ({ ...point }));
	let reflectionIndex = Math.max(0, rawData.length - 2);
	while (padded.length < blockSize) {
		const reflected = rawData[reflectionIndex] ?? rawData[0];
		padded.push({
			time:
				timeToNumber(padded[padded.length - 1].time) +
				sampleGapMilliseconds,
			value: reflected.value,
		});
		reflectionIndex--;
		if (reflectionIndex < 0) {
			reflectionIndex = Math.max(0, rawData.length - 2);
		}
	}
	return padded;
}

function correctWindow(
	rawData: TimeLineDataPoint[],
	sampleGapMilliseconds: number,
	response: PCStationXML.Response,
): TimeLineDataPoint[] {
	const sampleRate = 1000 / sampleGapMilliseconds;
	const firstTime = timeToNumber(rawData[0].time);
	const sourceID = PCFDSNSourceID.FDSNSourceId.createUnknown(sampleRate);
	const segment = new PCSeismogramSegment.SeismogramSegment(
		Float64Array.from(rawData, (point) => point.value),
		sampleRate,
		PCLuxon.DateTime.fromMillis(firstTime, { zone: "utc" }),
		sourceID,
	);
	const seismogram = new PCSeismogram.Seismogram(segment);
	const prepared = PCTaper.taper(
		PCFilter.removeTrend(seismogram),
		responseRemovalConfig.timeTaperWidth,
	);
	const sensitivity = response.instrumentSensitivity;
	const polesZeros = response.stages[0]?.filter;
	if (!sensitivity || !(polesZeros instanceof PCStationXML.PolesZeros)) {
		throw new Error("Response does not contain PAZ and sensitivity data");
	}
	const unit = nativeResponseUnit(response);
	const pcSacPoleZero = PCTransfer.convertPoleZeroToSacStyle(
		polesZeros,
		PCTransfer.calcScaleUnit(unit.pc) * sensitivity.sensitivity,
		sensitivity.frequency,
		0,
	);
	const nyquist = sampleRate / 2;
	const corrected = PCTransfer.transferSacPZ(
		prepared,
		pcSacPoleZero,
		responseRemovalConfig.lowCutHz,
		responseRemovalConfig.lowPassHz,
		nyquist * responseRemovalConfig.highPassNyquistFraction,
		nyquist * responseRemovalConfig.highCutNyquistFraction,
	);

	return Array.from(corrected.y, (value, index) => ({
		time: rawData[index].time,
		value,
	}));
}

function nativeResponseUnit(response: PCStationXML.Response): {
	pc: string;
	display: string;
} {
	const unit = response.instrumentSensitivity?.inputUnits
		.trim()
		.toUpperCase()
		.replaceAll("**", "");
	switch (unit) {
		case "M":
			return { pc: "m", display: "m" };
		case "M/S":
		case "M/SEC":
			return { pc: "m/s", display: "m/s" };
		case "M/S2":
		case "M/SEC2":
			return { pc: "m/s2", display: "m/s²" };
		default:
			throw new Error(`Unsupported response unit: ${unit}`);
	}
}

function findWindowStartIndex(
	rawData: TimeLineDataPoint[],
	startTime: number,
	sampleGapMilliseconds: number,
): number {
	const tolerance = sampleGapMilliseconds / 2;
	return rawData.findIndex(
		(point) => Math.abs(timeToNumber(point.time) - startTime) <= tolerance,
	);
}

function nextPowerOfTwo(value: number): number {
	let result = 1;
	while (result < value) result *= 2;
	return result;
}

function timeToNumber(time: Date | number): number {
	return typeof time === "number" ? time : time.getTime();
}
