import { formatTime, round } from "./ui";

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

export function computeRenderValue(
	value: number,
	offset: number,
	multiplier: number,
): number {
	return (value - offset) * multiplier;
}

const dpr = window.devicePixelRatio || 1;

// NOTE: Assumes data is sorted by X value, with smallest value first in the list
export class TimeLine {
	container: HTMLElement;
	data: TimeLineDataPoint[];
	savedData: TimeLineDataPoint[] = [];
	computedData: ComputedTimeLineDataPoint[] = [];
	canvas: HTMLCanvasElement;
	ctx: CanvasRenderingContext2D;
	maxPoints: number;
	pointWidth: number;
	yLabel: string;
	xLabel: string;
	lineWidth = 0.7;
	paused = false;

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
			that.recompute();
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

	get width() {
		return this.canvas.width / dpr;
	}

	get height() {
		return this.canvas.height / dpr;
	}

	static distanceBetweenTwoPoints(ax, ay, bx, by): number {
		// Right-angled triangles are magic. Thanks Ancient greeks!
		return Math.sqrt(Math.pow(ax - bx, 2) + Math.pow(ay - by, 2));
	}

	getNearestPoint(x: number, y: number): ComputedTimeLineDataPoint | null {
		// Sanity check
		if (this.computedData.length < 1) return null;

		// Find closest point
		let closestDataPoint: ComputedTimeLineDataPoint | null = null;
		let closestDistance = Number.MAX_VALUE;
		for (const point of this.computedData) {
			const distance = TimeLine.distanceBetweenTwoPoints(
				point.renderX,
				point.renderY,
				x,
				y,
			);

			if (distance < closestDistance) {
				closestDistance = distance;
				closestDataPoint = point;
			}
		}

		return closestDataPoint;
	}

	getYCaps(): { yMax: number; yMin: number; maxYGap: number } {
		let biggestYValue = Number.MIN_VALUE;
		let smallestYValue = Number.MAX_VALUE;
		for (const point of this.savedData) {
			if (point.y > biggestYValue) biggestYValue = point.y;
			if (point.y < smallestYValue) smallestYValue = point.y;
		}
		const biggestYGap = biggestYValue - smallestYValue;

		return {
			yMax: biggestYValue,
			yMin: smallestYValue,
			maxYGap: biggestYGap,
		};
	}

	getRenderOffsetsAndMultipliers(): {
		xOffset: number;
		xMultiplier: number;
		yOffset: number;
		yMultiplier: number;
	} {
		// Calculate X and Y multipliers

		// X is easy - just use the number of points
		const xMultiplier = this.width / (this.maxPoints * this.pointWidth);

		// Also X offset
		const xOffset = this.savedData[0].x;

		// Y is harder - need to find the difference between the minimum and maximum points
		const { yMax, yMin, maxYGap } = this.getYCaps();

		// Get the maximum gap

		// Now divide the available pixels by tha
		const yMultiplier = this.height / maxYGap;

		// Also calculate what we need to add to all the Y values so that they're visible
		const yOffset = yMin;

		return { xOffset, xMultiplier, yOffset, yMultiplier };
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

		// Draw the lines
		const { xOffset, xMultiplier, yOffset, yMultiplier } =
			this.getRenderOffsetsAndMultipliers();

		// Clear old data
		this.computedData = [];

		// Compute values for each point
		for (const point of this.savedData) {
			const computedPoint: ComputedTimeLineDataPoint = {
				...point,
				renderX: computeRenderValue(point.x, xOffset, xMultiplier),
				renderY: computeRenderValue(point.y, yOffset, yMultiplier),
			};
			this.computedData.push(computedPoint);
		}
	}

	/**
	 * Call this to draw the graph. The most recently computed data is used.
	 */
	draw() {
		// Draw in black
		this.ctx.strokeStyle = "black";
		this.ctx.lineWidth = this.lineWidth;
		this.ctx.setLineDash([]);

		// Clear canvas
		this.ctx.clearRect(0, 0, this.width, this.height);

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

export function drawAxis(chart: TimeLine, xMarks = 5, yMarks = 3) {
	const xPointGap = Math.floor(chart.maxPoints / xMarks);

	for (let i = 0; i < xMarks; i++) {
		const point = chart.computedData[i * xPointGap];
		if (!point) continue;

		// Vertical line
		chart.ctx.lineWidth = 0.5;
		chart.ctx.beginPath();
		chart.ctx.moveTo(point.renderX, 0);
		chart.ctx.lineTo(point.renderX, chart.height);
		chart.ctx.stroke();

		// Maker values
		chart.ctx.fillText(
			formatTime(point.x),
			point.renderX + 5,
			chart.height - 5,
		);
	}

	// const ySorted = [...chart.computedData].sort((a, b) => a.y - b.y);
	// for (const point of [
	// 	ySorted[0],
	// 	ySorted[Math.floor(ySorted.length / 2)],
	// 	ySorted[ySorted.length - 1],
	// ]) {
	// 	// Horizontal line line
	// 	chart.ctx.lineWidth = 0.5;
	// 	chart.ctx.beginPath();
	// 	chart.ctx.moveTo(0, point.renderY);
	// 	chart.ctx.lineTo(chart.width, point.renderY);
	// 	chart.ctx.stroke();

	// 	// Maker values
	// 	chart.ctx.fillText(round(point.y) + "", 0, point.renderY - 5);
	// }

	//
	// chart.ctx.beginPath();
	// chart.ctx.moveTo(0, chart.height);
	// chart.ctx.lineTo(chart.width, chart.height);
	// chart.ctx.stroke();
}
