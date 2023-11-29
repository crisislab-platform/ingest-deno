import { PrivateSensorMeta } from "./api/apiUtils.ts";

interface ServerSensor {
	id: number;
	webSocketClients: WebSocket[];
	isDuplicateOf?: number;
	lastMessageTimestamp?: number;
	lastHitAPI: number;
	meta: PrivateSensorMeta;
}

interface GeoFeatures {
	id: string;
	type: string;
	place_type: string[];
	relevance: number;
	properties: Properties;
	text: string;
	place_name: string;
	center: number[];
	geometry: Location;
	address: string;
	context: Context[];
}

interface Context {
	id: string;
	text: string;
	wikidata?: string;
	short_code?: string;
}

interface Properties {
	accuracy: string;
}

interface Location {
	type: string;
	coordinates: [number, number];
}
