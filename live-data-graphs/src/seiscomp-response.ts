import {
	oregondsputil as PCOregonDSPUtil,
	stationxml as PCStationXML,
} from "seisplotjs";

export type PCResponsesByChannel = Record<string, PCStationXML.Response>;

const OUTPUT_UNIT = "count";

export function parseSeiscompResponses(xmlText: string): PCResponsesByChannel {
	const document = new DOMParser().parseFromString(xmlText, "application/xml");
	if (document.querySelector("parsererror")) {
		throw new Error("Unable to parse SeisComP response XML");
	}

	const sensors = indexByPublicID(document, "sensor");
	const dataloggers = indexByPublicID(document, "datalogger");
	const polesAndZeros = indexByPublicID(document, "responsePAZ");
	const firResponses = indexByPublicID(document, "responseFIR");
	const responses: PCResponsesByChannel = {};

	for (const stream of elements(document, "stream")) {
		const channel = requiredAttribute(stream, "code");
		const sensor = requiredReference(
			sensors,
			requiredAttribute(stream, "sensor"),
			"sensor",
		);
		const pazElement = requiredReference(
			polesAndZeros,
			requiredAttribute(sensor, "response"),
			"responsePAZ",
		);
		const inputUnit = requiredChildText(sensor, "unit");
		const gain = childNumber(stream, "gain") ?? requiredChildNumber(pazElement, "gain");
		const gainFrequency =
			childNumber(stream, "gainFrequency") ??
			requiredChildNumber(pazElement, "gainFrequency");

		const pcPolesZeros = new PCStationXML.PolesZeros(
			inputUnit,
			OUTPUT_UNIT,
		);
		pcPolesZeros.pzTransferFunctionType = transferFunctionType(
			requiredChildText(pazElement, "type"),
		);
		pcPolesZeros.normalizationFactor = requiredChildNumber(
			pazElement,
			"normalizationFactor",
		);
		pcPolesZeros.normalizationFrequency = requiredChildNumber(
			pazElement,
			"normalizationFrequency",
		);
		pcPolesZeros.zeros = parseComplexList(childText(pazElement, "zeros") ?? "");
		pcPolesZeros.poles = parseComplexList(requiredChildText(pazElement, "poles"));

		const stages: PCStationXML.Stage[] = [
			new PCStationXML.Stage(
				pcPolesZeros,
				null,
				new PCStationXML.Gain(
					requiredChildNumber(pazElement, "gain"),
					requiredChildNumber(pazElement, "gainFrequency"),
				),
			),
		];

		const dataloggerID = stream.getAttribute("datalogger");
		const datalogger = dataloggerID
			? dataloggers.get(dataloggerID)
			: undefined;
		if (datalogger) {
			stages.push(...parseFIRStages(datalogger, firResponses));
		}

		responses[channel] = new PCStationXML.Response(
			new PCStationXML.InstrumentSensitivity(
				gain,
				gainFrequency,
				inputUnit,
				OUTPUT_UNIT,
			),
			stages,
		);
	}

	return responses;
}

function parseFIRStages(
	datalogger: Element,
	firResponses: Map<string, Element>,
): PCStationXML.Stage[] {
	const decimation = childElement(datalogger, "decimation");
	if (!decimation) return [];

	const chain = childText(decimation, "digitalFilterChain")?.trim();
	if (!chain) return [];

	const outputSampleRate =
		requiredNumberAttribute(decimation, "sampleRateNumerator") /
		requiredNumberAttribute(decimation, "sampleRateDenominator");

	return chain.split(/\s+/).map((responseID) => {
		const firElement = requiredReference(
			firResponses,
			responseID,
			"responseFIR",
		);
		const factor = childNumber(firElement, "decimationFactor") ?? 1;
		const pcFIR = new PCStationXML.FIR(OUTPUT_UNIT, OUTPUT_UNIT);
		pcFIR.symmetry = firSymmetry(childText(firElement, "symmetry"));
		pcFIR.numerator = parseNumberList(
			requiredChildText(firElement, "coefficients"),
		);

		const pcDecimation = new PCStationXML.Decimation(
			outputSampleRate * factor,
			factor,
		);
		pcDecimation.delay = childNumber(firElement, "delay");
		pcDecimation.correction = childNumber(firElement, "correction");

		return new PCStationXML.Stage(
			pcFIR,
			pcDecimation,
			new PCStationXML.Gain(childNumber(firElement, "gain") ?? 1, 0),
		);
	});
}

function transferFunctionType(type: string): string {
	switch (type.trim().toUpperCase()) {
		case "A":
			return "LAPLACE (RADIANS/SECOND)";
		case "B":
			return "LAPLACE (HERTZ)";
		default:
			throw new Error(`Unsupported SeisComP PAZ response type: ${type}`);
	}
}

function firSymmetry(symmetry: string | null): string {
	switch (symmetry?.trim().toUpperCase()) {
		case "B":
			return "ODD";
		case "C":
			return "EVEN";
		default:
			return "NONE";
	}
}

function parseComplexList(value: string) {
	const complexValues: Array<
		ReturnType<typeof PCOregonDSPUtil.createComplex>
	> = [];
	const number = "[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:e[+-]?\\d+)?";
	const pattern = new RegExp(`\\(\\s*(${number})\\s*,\\s*(${number})\\s*\\)`, "gi");
	let match: RegExpExecArray | null;
	while ((match = pattern.exec(value)) !== null) {
		complexValues.push(
			PCOregonDSPUtil.createComplex(Number(match[1]), Number(match[2])),
		);
	}
	return complexValues;
}

function parseNumberList(value: string): number[] {
	return value
		.trim()
		.split(/\s+/)
		.filter(Boolean)
		.map(Number);
}

function elements(document: Document, localName: string): Element[] {
	return Array.from(document.getElementsByTagNameNS("*", localName));
}

function indexByPublicID(
	document: Document,
	localName: string,
): Map<string, Element> {
	return new Map(
		elements(document, localName).map((element) => [
			requiredAttribute(element, "publicID"),
			element,
		]),
	);
}

function childElement(parent: Element, localName: string): Element | null {
	return (
		Array.from(parent.children).find(
			(element) => element.localName === localName,
		) ?? null
	);
}

function childText(parent: Element, localName: string): string | null {
	return childElement(parent, localName)?.textContent?.trim() ?? null;
}

function requiredChildText(parent: Element, localName: string): string {
	const value = childText(parent, localName);
	if (value === null) throw new Error(`Missing ${localName}`);
	return value;
}

function childNumber(parent: Element, localName: string): number | null {
	const value = childText(parent, localName);
	return value === null ? null : Number(value);
}

function requiredChildNumber(parent: Element, localName: string): number {
	return Number(requiredChildText(parent, localName));
}

function requiredAttribute(element: Element, name: string): string {
	const value = element.getAttribute(name);
	if (value === null) throw new Error(`Missing ${name} attribute`);
	return value;
}

function requiredNumberAttribute(element: Element, name: string): number {
	return Number(requiredAttribute(element, name));
}

function requiredReference(
	index: Map<string, Element>,
	publicID: string,
	type: string,
): Element {
	const element = index.get(publicID);
	if (!element) throw new Error(`Missing ${type} reference: ${publicID}`);
	return element;
}
