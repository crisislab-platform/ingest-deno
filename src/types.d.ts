interface RootObject {
	[key: number]: Sensor;
}

interface Sensor {
	id: number;
	webSocketClients: WebSocket[];
	isDuplicateOf?: number;
	lastMessageTimestamp?: number;
	lastHitAPI: number;
	meta: {
		id: number;
		ip?: string;
		online?: boolean;
		type?: string;
		location: Location;
		geoFeatures: GeoFeatures;
		name?: string;
		secondary_id?: string;
		lastOnline?: number;
		timestamp?: number;
		publicLocation?: [number, number];
		longitude?: number;
		latitude?: number;
	};
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
