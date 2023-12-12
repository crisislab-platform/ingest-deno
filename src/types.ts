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

export interface ServerSensor {
	id: number;
	webSocketClients: WebSocket[];
	isDuplicateOf?: number;
	lastMessageTimestamp?: number;
	meta: PrivateSensorMeta;
}
