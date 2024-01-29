type DataPoint = { value: number; time: number };

export class LineChart {
	// Saved when recompute is called. Only used internally before computedData is done computing
	savedData: DataPoint[] = [];
	// Computed when recompute is called. Use this.
	computedData: { renderY: number | " "; time: number }[] = [];

	fit: number | undefined;
	height: number;

	constructor(public container: HTMLElement, public data: DataPoint[]) {
		container.style.width = "100%";
		container.style.padding = "0";
		container.style.border = "0";
		container.style.margin = "0";
		container.style.boxSizing = "border-box";
		container.style.whiteSpace = "nowrap";
		container.style.overflow = "auto";

		container.classList.add("linefont");

		this.height = container.clientHeight;

		// Hella cursed thingy
		let checking = true;
		let i = 0;
		const checkWidth = () => {
			container.innerText += String.fromCharCode(0x100 + (i % 100));
			// console.log(i, container.scrollWidth, container.clientWidth);
			if (container.scrollWidth > container.clientWidth) {
				console.log(i, container.scrollWidth, container.clientWidth);
				this.fit = i - 1;
				checking = false;
			} else {
				i++;
				if (i < 100000) {
					requestAnimationFrame(checkWidth);
				}
			}
		};

		checkWidth();

		// Start draw cycle
		const that = this;
		function drawLoop() {
			requestAnimationFrame(drawLoop);
			if (!checking) that.draw();
		}
		drawLoop();
	}

	/**
	 * Call this to recompute all the data points after the data array has changed.
	 */
	recompute() {
		// Don't try and compute if less than 2 points
		if (this.data.length < 2) return;

		// Get the slice of data we're gonna render

		const data = window.structuredClone(this.data);

		this.savedData = data.slice(-(this.fit ?? 0));

		this.compute();
	}

	/**
	 * We compute the positions for each point separately from rendering them,
	 * to keep render logic clean, and for better performance.
	 */
	private compute() {
		// Draw the lines

		// Clear old data
		this.computedData = [];

		// Clamp values to a integer range of 0 - 100
		// This is because LineFont only supports 100 characters
		const max = Math.max(...this.savedData.map((p) => p.value));
		const min = Math.min(...this.savedData.map((p) => p.value));

		for (let i = 0; i < this.savedData.length; i++) {
			const point = this.savedData[i];
			let newPoint = {
				...point,
			} as any;
			if (max === min) {
				// Set to default value when max and min are the same
				newPoint.renderY = 50; // or 100, depending on your requirements
			} else {
				newPoint.renderY = Math.round(
					((point.value - min) / (max - min)) * 100,
				);
			}
			this.computedData.push(newPoint);
		}

		if (this.computedData.length < (this.fit ?? 0)) {
			const gap = (this.fit ?? 0) - this.computedData.length;
			this.computedData = [
				...this.computedData,
				...Array.from({ length: gap }).map((_, i) => ({
					renderY: " " as any,
					time: this.computedData.at(-1)!.time + (i + 1),
				})),
			];
		}
	}

	/**
	 * Call this to force a draw of the graph. The most recently computed data is used.
	 * This is called automatically, so you probably don't need to call it.
	 */
	draw() {
		this.container.innerHTML = this.computedData
			.map((p) =>
				p.renderY === " "
					? "&nbsp;"
					: String.fromCharCode(0x100 + p.renderY),
			)
			.join("");
	}
}
