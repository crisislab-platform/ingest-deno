// From https://stackoverflow.com/a/69328045
export type WithRequired<T, K extends keyof T> = T & { [P in K]-?: T[P] };

export interface PublicSensorMeta {
	id: number;
	type?: string;
	online?: boolean;
	status_change_timestamp?: number;
	secondary_id?: string;
	public_location?: [number, number];
}

export type PrivateSensorMeta = PublicSensorMeta & {
	contact_email?: string;
	location?: [number, number];
	name?: string;
	ip?: string;
};

export interface User {
	id: number;
	name: string;
	email: string;
	roles: string[];
}

export interface ServerWebsocketClient {
	ws: WebSocket;
	plain: boolean;
	clientIP: string;
	sensorID: number;
}
export interface ServerSensor {
	id: number;
	webSocketClients: ServerWebsocketClient[];
	isDuplicateOf?: number;
	lastMessageTimestamp?: number;
	meta: PrivateSensorMeta;
}

export const chartMarkerTypes = ["fixed-value", "24h-max"] as const;
export const chartMarkerStyles = ["dotted", "dashed", "solid"] as const;
export interface ChartMarker {
	id: number;
	sensor_channel: string;
	sensor_type: string;
	type: (typeof chartMarkerTypes)[number];
	label: string;
	colour: string;
	style: (typeof chartMarkerStyles)[number];
	value: number;
	enabled: boolean;
}
