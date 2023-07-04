export interface Point {
	y: number;
	x: number;
}

export type TimeLineDataPoint = Point;

export interface ComputedTimeLineDataPoint extends TimeLineDataPoint {
	y: number;
	x: number;
	renderX: number;
	renderY: number;
}

export interface TimeLineOptions {
	container: HTMLElement;
	data: TimeLineDataPoint[];
	maxPoints: number;
	pointWidth: number;
	yLabel: string;
	xLabel: string;
	lineWidth?: number;
}

const dpr = window.devicePixelRatio || 1;

// NOTE: Assumes data is sorted by X value, with smallest value first in the list
export class TimeLine {
	// Raw data points passed by user
	data: TimeLineDataPoint[];
	// Saved when recompute is called. Only used internally before computedData is done computing
	savedData: TimeLineDataPoint[] = [];
	// Computed when recompute is called. Use this.
	computedData: ComputedTimeLineDataPoint[] = [];

	container: HTMLElement;
	canvas: HTMLCanvasElement;
	ctx: CanvasRenderingContext2D;
	maxPoints: number;
	pointWidth: number;
	yLabel: string;
	xLabel: string;
	lineWidth = 0.8;
	paused = false;
	leftPadding = 60;
	bottomPadding = 30;

	foregroundColour = "black";
	backgroundColour = "white";

	constructor(options: TimeLineOptions) {
		this.container = options.container;
		this.data = options.data;
		this.maxPoints = options.maxPoints;
		this.pointWidth = options.pointWidth;
		this.xLabel = options.xLabel;
		this.yLabel = options.yLabel;

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
		window.addEventListener("resize", () => {
			that.updateCanvas();
			that.compute();
		});

		// First update
		this.recompute();
	}

	pause() {
		this.paused = true;
	}

	unpause() {
		this.paused = false;
		this.recompute();
	}

	updateCanvas() {
		// Undo previous scaling
		this.ctx.setTransform(1, 0, 0, 1, 0, 0);

		// Update width and height
		const rect = this.canvas.getBoundingClientRect();
		this.canvas.width = rect.width * dpr;
		this.canvas.height = rect.height * dpr;

		// Scale context
		this.ctx.scale(dpr, dpr);
	}

	get widthWithPadding() {
		return (this.canvas.width - this.leftPadding) / dpr;
	}

	get width() {
		return this.canvas.width / dpr;
	}

	get heightWithPadding() {
		return (this.canvas.height - this.bottomPadding) / dpr;
	}

	get height() {
		return this.canvas.height / dpr;
	}

	getRenderOffsetsAndMultipliers(): {
		xOffset: number;
		xMultiplier: number;
		yOffset: number;
		yMultiplier: number;
	} {
		// Calculate X and Y multipliers

		// X is easy - just use the number of points
		const xMultiplier =
			this.widthWithPadding / (this.maxPoints * this.pointWidth);

		// Also X offset
		const xOffset = this.savedData[0].x;

		// Y is harder - need to find the difference between the minimum and maximum points
		// Note to future self: Always use -Infinity, not Number.MIN_VALUE
		let biggestYValue = -Infinity;
		let smallestYValue = Infinity;
		for (const point of this.savedData) {
			if (point.y > biggestYValue) biggestYValue = point.y;
			if (point.y < smallestYValue) smallestYValue = point.y;
		}

		// Get the maximum gap
		const maxYGap = biggestYValue - smallestYValue;

		// Now divide the available pixels by that
		const yMultiplier = this.heightWithPadding / maxYGap;

		// Also calculate what we need to add to all the Y values so that they're visible
		const yOffset = smallestYValue;

		return {
			xOffset,
			xMultiplier,
			yOffset,
			yMultiplier,
		};
	}

	/**
	 * Call this to recompute all the data points after the data array has changed.
	 */
	recompute() {
		// Don't change if it's paused
		if (this.paused) return;

		// Don't try and compute if less than 2 points
		if (this.data.length < 2) return;

		this.savedData = [...this.data];

		this.compute();
	}

	private compute() {
		// Draw the lines
		const { xOffset, xMultiplier, yOffset, yMultiplier } =
			this.getRenderOffsetsAndMultipliers();

		// Clear old data
		this.computedData = [];

		// Compute values for each point
		for (const point of this.savedData) {
			const computedPoint: ComputedTimeLineDataPoint = {
				...point,
				renderX: this.leftPadding + (point.x - xOffset) * xMultiplier,
				renderY:
					this.heightWithPadding - (point.y - yOffset) * yMultiplier,
			};
			this.computedData.push(computedPoint);
		}
	}

	/**
	 * Call this to draw the graph. The most recently computed data is used.
	 */
	draw() {
		// Draw in black
		this.ctx.strokeStyle = this.foregroundColour;
		this.ctx.lineWidth = this.lineWidth;
		this.ctx.setLineDash([]);

		// Clear canvas
		this.ctx.fillStyle = this.backgroundColour;
		this.ctx.fillRect(0, 0, this.width, this.height);

		// Draw lines on sides
		this.ctx.strokeRect(
			this.leftPadding,
			0,
			this.widthWithPadding,
			this.heightWithPadding,
		);

		// Begin the path
		this.ctx.beginPath();

		// First data point
		this.ctx.moveTo(
			this.computedData[0].renderX,
			this.computedData[0].renderY,
		);

		// Loop over all points, other than the first one
		for (const point of this.computedData.slice(1)) {
			// Line to moves the 'cursor' to the point we just drew a line to
			this.ctx.lineTo(point.renderX, point.renderY);
		}

		// Draw the path
		this.ctx.stroke();
	}
}

export function distanceBetweenTwoPoints(a: Point, b: Point): number {
	// Right-angled triangles are magic. Thanks Ancient greeks!
	return Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2));
}

export function getNearestPoint(
	chart: TimeLine,
	point: Point,
): ComputedTimeLineDataPoint | null {
	// Sanity check
	if (chart.computedData.length < 1) return null;

	// Find closest point
	let closestDataPoint: ComputedTimeLineDataPoint | null = null;
	let closestDistance = Number.MAX_VALUE;
	for (const chartPoint of chart.computedData) {
		const distance = distanceBetweenTwoPoints(
			{ x: chartPoint.renderX, y: chartPoint.renderY },
			point,
		);

		if (distance < closestDistance) {
			closestDistance = distance;
			closestDataPoint = chartPoint;
		}
	}

	return closestDataPoint;
}

// Consistency
const labelFontSize = 12;
const axisPadding = 4;
const tickLength = 18;
const labelFont = `${labelFontSize}px Arial`;

export function drawXAxis(
	chart: TimeLine,
	formatLabel: (x: number) => string = (x) => x + "",
	xMarks = 5,
) {
	// Set font properties
	chart.ctx.font = labelFont;
	chart.ctx.fillStyle = chart.foregroundColour;
	chart.ctx.textAlign = "start";
	chart.ctx.textBaseline = "top";

	const xPointGap = Math.floor(chart.maxPoints / xMarks);

	for (let i = 0; i < xMarks; i++) {
		const point = chart.computedData[i * xPointGap];
		if (!point) continue;

		const label = formatLabel(point.x);
		const textX = point.renderX + 5;
		const textY = chart.heightWithPadding + axisPadding;

		// Marker
		chart.ctx.beginPath();
		chart.ctx.moveTo(point.renderX, chart.heightWithPadding);
		chart.ctx.lineTo(point.renderX, chart.heightWithPadding + tickLength);
		chart.ctx.stroke();

		// Label
		chart.ctx.fillText(label, textX, textY);
	}
}

export function drawYAxis(
	chart: TimeLine,
	formatLabel: (y: number) => string = (y) => y + "",
	yMarks = 5,
) {
	const { yOffset, yMultiplier } = chart.getRenderOffsetsAndMultipliers();

	// Set font properties
	chart.ctx.font = labelFont;
	chart.ctx.fillStyle = chart.foregroundColour;
	chart.ctx.textAlign = "right";
	chart.ctx.textBaseline = "top";
	chart.ctx.fillStyle = chart.foregroundColour;

	for (let i = 0; i < yMarks; i++) {
		const yValue = (i * chart.heightWithPadding) / (yMarks - 1);
		const yDataValue =
			(chart.heightWithPadding - yValue) / yMultiplier + yOffset;

		const textX = chart.leftPadding - axisPadding;
		const textY = yValue + axisPadding; // Move down so it doesn't overlap the line
		const label = formatLabel(yDataValue);

		//Marker
		chart.ctx.beginPath();
		chart.ctx.moveTo(chart.leftPadding - tickLength, yValue);
		chart.ctx.lineTo(chart.leftPadding, yValue);
		chart.ctx.stroke();

		// Label
		chart.ctx.fillText(label, textX, textY);
	}
}
