import { TimeLine, getNearestPoint } from "./chart";
import {
	hideMessages,
	reloadButton,
	hoverText,
	chartsContainer,
	formatTime,
	round,
} from "./ui";

export type Datagram = [string, number, ...number[]];

// Graphs
const current: Record<string, number> = {};
const aliases = {
	EH3: "Vertical Geophone (counts)",
	EN3: "Y axis acceleration (m/s²)",
	EN1: "X axis acceleration (m/s²)",
	EN2: "Z axis acceleration (m/s²)",
	EHZ: "Vertical Geophone (counts)",
	ENN: "Y axis acceleration (m/s²)",
	ENE: "X axis acceleration (m/s²)",
	ENZ: "Z axis acceleration (m/s²)",
};
let start;
let currentHeight = 23;
const maxDataLength = 1300;
const pointGap = 10;

let initCount = 0;

export function handleData(packet: Datagram) {
	const [channel, timestampSeconds, ...measurements] = packet;

	if (initCount < 5 && channel !== "EHZ") {
		initCount++;
		return;
	} else {
		initCount = 10;
	}

	const timestamp = timestampSeconds * 1000;

	start ||= timestamp;
	window.CRISiSLab.data[channel] ||= [];
	current[channel] ||= 0;

	if (!window.CRISiSLab.charts[channel]) {
		const container = document.createElement("div");
		container.className = "chart";
		container.id = channel;
		chartsContainer.appendChild(container);

		const yLabel = aliases[channel as keyof typeof aliases] || channel;

		const chart = new TimeLine({
			container,
			data: window.CRISiSLab.data[channel],
			maxPoints: maxDataLength,
			pointWidth: pointGap,
			xLabel: "Time",
			yLabel,
		});
		window.CRISiSLab.charts[channel] = chart;

		container.style.opacity = "1";

		if ("clipboard" in navigator) {
			container.addEventListener("dblclick", (event) => {
				// On double click, copy data to clipboard
				const rect = chart.canvas.getBoundingClientRect();

				const point = getNearestPoint(chart, {
					x: event.pageX - rect.x,
					y: event.pageY - rect.y,
				});
				if (!point) return;
				try {
					// Write in a spreadsheet-pasteable format
					navigator.clipboard.writeText(`${chart.yLabel}	${point.y}
${chart.xLabel}	${point.x}`);
					console.info("Wrote point data to clipboard");
				} catch (err) {
					console.warn("Error writing to clipboard: ", err);
				}
			});
		} else {
			console.warn(
				"Clipboard API not found - double click to copy won't work",
			);
		}

		// Axis labels

		const xLabelEl = document.createElement("p");
		xLabelEl.innerText = "Time";
		xLabelEl.className = "axis-label x-axis";
		container.appendChild(xLabelEl);

		const yLabelEl = document.createElement("p");
		yLabelEl.innerText = yLabel;
		yLabelEl.className = "axis-label y-axis";
		container.appendChild(yLabelEl);

		currentHeight += 24;
	}

	for (const i of measurements) {
		let value = i;
		// If the channel is an accelerometer
		if (channel.startsWith("EN")) {
			// Magic number to convert toi m/s^2
			value = value / 3.845e5;
		}
		window.CRISiSLab.data[channel].push({
			x: timestamp + current[channel],
			y: value,
		});
		current[channel] += pointGap;

		if (window.CRISiSLab.data[channel].length > maxDataLength) {
			window.CRISiSLab.data[channel].shift();
		}
	}

	window.CRISiSLab.charts[channel].recompute();

	current[channel] = 0;

	hideMessages();
	if (!window.CRISiSLab.haveRenderedPacket) {
		window.CRISiSLab.haveRenderedPacket = true;
		reloadButton.toggleAttribute("disabled", true);
	}
}

let mouseX = -1;
let mouseY = -1;

window.addEventListener("mousemove", (event) => {
	mouseX = event.pageX;
	mouseY = event.pageY;
});

function isPointInBox(
	px: number,
	py: number,
	x: number,
	y: number,
	w: number,
	h: number,
): boolean {
	return x <= px && px <= x + w && y <= py && py <= y + h;
}

export function highlightNearestPoint() {
	let found = false;
	for (const chart of Object.values(window.CRISiSLab.charts)) {
		const rect = chart.canvas.getBoundingClientRect();
		// Check if the mouse is over the chart
		if (
			isPointInBox(
				mouseX,
				mouseY,
				rect.x,
				rect.y,
				rect.width,
				rect.height,
			)
		) {
			found = true;

			const chartX = mouseX - rect.x;
			const chartY = mouseY - rect.y;

			// Thinner line
			chart.ctx.lineWidth = 0.5;

			// Dashed line
			chart.ctx.setLineDash([10, 10]);

			// Horizontal line
			if (chartY < chart.heightWithPadding) {
				chart.ctx.beginPath();
				chart.ctx.moveTo(chart.leftPadding, chartY);
				chart.ctx.lineTo(chart.widthWithPadding, chartY);
				chart.ctx.stroke();
			}

			// Vertical line
			if (chartX > chart.leftPadding) {
				chart.ctx.beginPath();
				chart.ctx.moveTo(chartX, 0);
				chart.ctx.lineTo(chartX, chart.heightWithPadding);
				chart.ctx.stroke();
			}

			// Regular line
			chart.ctx.setLineDash([]);

			// Get the nearest point
			const point = getNearestPoint(chart, { x: chartX, y: chartY });
			if (!point) break;

			// Ticker line
			chart.ctx.lineWidth = 1.2;

			// Draw a marker on it
			const r = 10;
			chart.ctx.beginPath();
			chart.ctx.arc(point.renderX, point.renderY, r, 0, 2 * Math.PI);
			chart.ctx.stroke();

			// Crosshair
			chart.ctx.beginPath();
			chart.ctx.moveTo(point.renderX, point.renderY - r);
			chart.ctx.lineTo(point.renderX, point.renderY + r);
			chart.ctx.stroke();
			chart.ctx.beginPath();
			chart.ctx.moveTo(point.renderX - r, point.renderY);
			chart.ctx.lineTo(point.renderX + r, point.renderY);
			chart.ctx.stroke();

			// Text
			hoverText.innerText = `${chart.yLabel}: ${round(point.y)}
${chart.xLabel}: ${formatTime(point.x, true)}`;
			hoverText.style.top = rect.y + "px";
			hoverText.style.display = "block";

			if (chartX > chart.widthWithPadding / 2) {
				// The -1 is to avoid a double border
				hoverText.style.left = rect.x + chart.leftPadding - 1 + "px";
				hoverText.style.right = "";
			} else {
				hoverText.style.right = "0px";
				hoverText.style.left = "";
			}
			// Don't bother with the other charts - the mouse will only be over one at once
			break;
		}
	}
	if (!found) {
		hoverText.style.display = "none";
	}
}
