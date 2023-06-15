import { TimeLine } from "./chart";
import {
	hideMessages,
	reloadButton,
	hoverText,
	chartsContainer,
	formatTime,
} from "./ui";

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
const maxDataLength = 1500;
const pointWidth = 10;

let initCount = 0;

export function handleData(packet) {
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
		window.CRISiSLab.charts[channel] = new TimeLine({
			container,
			data: window.CRISiSLab.data[channel],
			maxPoints: maxDataLength,
			pointWidth,
			xLabel: "Time",
			yLabel: aliases[channel],
		});

		container.style.opacity = "1";

		// Axis labels

		const xLabel = document.createElement("p");
		xLabel.innerHTML = "Time";
		xLabel.className = "x-label";
		container.appendChild(xLabel);

		const yLabel = document.createElement("p");
		yLabel.innerHTML = aliases[channel] || channel;
		yLabel.className = "y-label";
		container.appendChild(yLabel);

		currentHeight += 24;
	}

	for (const i of measurements) {
		window.CRISiSLab.data[channel].push({
			x: timestamp + current[channel],
			y: channel.startsWith("EN") ? i / 3.845e5 : i,
		});
		current[channel] += pointWidth;

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
			chart.ctx.beginPath();
			chart.ctx.moveTo(0, chartY);
			chart.ctx.lineTo(chart.width, chartY);
			chart.ctx.stroke();

			// Vertical line
			chart.ctx.beginPath();
			chart.ctx.moveTo(chartX, 0);
			chart.ctx.lineTo(chartX, chart.height);
			chart.ctx.stroke();

			// Regular line
			chart.ctx.setLineDash([]);

			// Get the nearest point
			const point = chart.getNearestPoint(chartX, chartY);
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
			hoverText.innerText = `${chart.yLabel}: ${point.y}
${chart.xLabel}: ${formatTime(point.x, true)}`;
			hoverText.style.top = rect.y + "px";
			hoverText.style.display = "block";

			if (chartX > chart.width / 2) {
				hoverText.style.left = rect.x + "px";
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
