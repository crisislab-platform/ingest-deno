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

// These are intentionally kept together: they will need tuning against live data.
export const responseRemovalConfig = {
	lowCutHz: 0.05,
	lowPassHz: 0.1,
	highPassNyquistFraction: 0.8,
	highCutNyquistFraction: 0.95,
	timeTaperWidth: 0.05,
};

export function removeInstrumentResponse(
	rawData: TimeLineDataPoint[],
	sampleGapMilliseconds: number,
	response: PCStationXML.Response,
): TimeLineDataPoint[] | null {
	if (rawData.length < MINIMUM_RESPONSE_SAMPLES) return null;

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
		PCFilter.rMean(seismogram),
		responseRemovalConfig.timeTaperWidth,
	);
	const nyquist = sampleRate / 2;
	const corrected = PCTransfer.transfer(
		prepared,
		response,
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

function timeToNumber(time: Date | number): number {
	return typeof time === "number" ? time : time.getTime();
}
