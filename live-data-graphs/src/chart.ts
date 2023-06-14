export interface TimeLineDataPoint {
	y: number;
	x: number;
}

export interface TimeLineOptions {
	container: HTMLElement;
	data: TimeLineDataPoint[];
	maxPoints: number;
	pointWidth: number;
	label: string;
	lineWidth?: number;
}

// NOTE: Assumes data is sorted by X value, with smallest value first in the list
export class TimeLine {
	container: HTMLElement;
	data: TimeLineDataPoint[];
	canvas: HTMLCanvasElement;
	ctx: CanvasRenderingContext2D;
	maxPoints: number;
	pointWidth: number;
	label: string;
	lineWidth = 0.7;
	dpr = window.devicePixelRatio || 1;

	constructor(options: TimeLineOptions) {
		this.container = options.container;
		this.data = options.data;
		this.maxPoints = options.maxPoints;
		this.pointWidth = options.pointWidth;
		this.label = options.label;
		if (options.lineWidth) this.lineWidth = options.lineWidth;

		// Setup canvas
		this.canvas = document.createElement("canvas");
		this.canvas.style.width = "100%";
		this.canvas.style.height = "100%";
		this.container.appendChild(this.canvas);
		const context = this.canvas.getContext("2d");
		if (!context) throw "Unable to get canvas context!";
		this.ctx = context;

		// Initial update
		this.updateCanvas();
		// Update canvas on resize

		// Save 'this'
		const that = this;
		// Need to make sure that 'this' inside the handler refers to the class
		window.addEventListener("resize", () => that.updateCanvas());
	}

	updateCanvas() {
		// Undo previous scaling
		this.ctx.setTransform(1, 0, 0, 1, 0, 0);

		// Update width and height

		const rect = this.canvas.getBoundingClientRect();
		this.canvas.width = rect.width * this.dpr;
		this.canvas.height = rect.height * this.dpr;

		// Scale context
		this.ctx.scale(this.dpr, this.dpr);
	}

	get width() {
		return this.canvas.width / this.dpr;
	}

	get height() {
		return this.canvas.height / this.dpr;
	}

	draw() {
		// Don't try and render if less than 2 points
		if (this.data.length < 2) return;

		// Calculate X and Y multipliers

		// X is easy - just use the number of points
		const xMultiplier = this.width / (this.maxPoints * this.pointWidth);

		// Also X offset
		const xOffset = this.data[0].x;

		// Y is harder - need to find the difference between the minimum and maximum points
		let biggestYValue = Number.MIN_VALUE;
		let smallestYValue = Number.MAX_VALUE;
		for (const point of this.data) {
			if (point.y > biggestYValue) biggestYValue = point.y;
			if (point.y < smallestYValue) smallestYValue = point.y;
		}

		// Get the maximum gap
		const biggestYGap = biggestYValue - smallestYValue;

		// Now divide the available pixels by tha
		const yMultiplier = this.height / biggestYGap;

		// Also calculate what we need to add to all the Y values so that they're visible
		const yOffset = smallestYValue;

		// Now the easy bit - draw the lines

		// Draw in black
		this.ctx.strokeStyle = "black";
		this.ctx.lineWidth = this.lineWidth;
		// Clear canvas
		this.ctx.clearRect(0, 0, this.width, this.height);

		// Begin the path
		this.ctx.beginPath();

		// First data point
		this.ctx.moveTo(
			(this.data[0].x - xOffset) * xMultiplier,
			(this.data[0].y - yOffset) * yMultiplier,
		);

		// Loop over all points, other than the first one
		for (const point of this.data.slice(1)) {
			// Line to moves the 'cursor' to the point we just drew a line to
			this.ctx.lineTo(
				(point.x - xOffset) * xMultiplier,
				(point.y - yOffset) * yMultiplier,
			);
		}

		// Draw the path
		this.ctx.stroke();
	}
}
