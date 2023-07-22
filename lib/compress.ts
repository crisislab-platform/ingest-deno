export function toDeltas(data: number[]): number[] {
	if (data.length == 0) return [];

	// Find the difference from the previous value
	// Start with the first value already in the deltas list, since it's not added below
	const deltas = [data[0]];
	// 1-based index to start at the second element
	for (let i = 1; i < data.length; i++) {
		const value = data[i];
		const prev = data[i - 1];
		const difference = value - prev;
		deltas.push(difference);
	}
	return deltas;
}

export function fromDeltas(deltas: number[]): number[] {
	if (deltas.length == 0) return [];
	const data = [deltas[0]];
	// 1-based index to start at the second element
	for (let i = 1; i < deltas.length; i++) {
		const difference = deltas[i];
		const prev = data[i - 1];
		const value = difference + prev;
		data.push(value);
	}
	return data;
}
