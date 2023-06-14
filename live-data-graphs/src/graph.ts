import TimeChart from "timechart";
import { min as d3Min, max as d3Max, scaleTime } from "d3";
import { hideMessages, reloadButton, resetButton } from "./ui";

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
const maxDataLength = 3000;

function setAttributes(el: Element, attrs: Record<string, string>) {
	for (const key in attrs) {
		el.setAttribute(key, attrs[key]);
	}
}

function resetView() {
	for (const i of Object.values(window.CRISiSLab.charts))
		i.options.realTime = true;
}

resetButton.addEventListener("click", resetView);

setInterval(() => {
	resetButton.setAttribute("disabled", "disabled");
	for (const i in window.CRISiSLab.charts) {
		const graph = window.CRISiSLab.charts[i];
		if (!graph.options.realTime) {
			resetButton.removeAttribute("disabled");
		}
	}
}, 100);

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
		const el = document.createElement("div");
		el.className = "chart";
		el.id = channel;
		document.body.appendChild(el);
		window.CRISiSLab.charts[channel] = new TimeChart(el, {
			series: [
				{
					data: window.CRISiSLab.data[channel],
					name: aliases[channel] || channel,
					// color: "red",
					// lineWidth: 10,
					// lineType: LineType.Step,
					// lineWidth: 10,
				},
			],
			tooltip: {
				enabled: true,
				xLabel: "Time (seconds)",
				xFormatter: (x) => {
					// const d = new Date(x);
					return `${x}`;
				},
			},

			legend: false,
			zoom: {
				x: {
					autoRange: true,
				},
				y: {
					autoRange: true,
				},
			},
			// yRange: "auto",
			baseTime: start,
			xScaleType: scaleTime,
			xRange: { min: 200, max: 10000 },
			realTime: true,
		});

		el.style.opacity = "1";

		const channelShadowRoot = document?.querySelector(
			`#${channel}`,
		)?.shadowRoot;

		// Hover tooltip

		const tooltipStyleTag = channelShadowRoot
			?.querySelector("chart-tooltip")
			?.shadowRoot?.querySelector("style");
		if (tooltipStyleTag)
			tooltipStyleTag.innerText = `
		:host {
		    background: var(--background-overlay, white);
		    border: 1px solid hsl(0, 0%, 80%);
		    border-radius: 3px;

		}
		.item {
		    user-select: none;
		}

		.name {

		    white-space: nowrap;
		}
		.example {
		    display:none;
		}
		.value {
		    text-overflow: ellipsis;
		    overflow: hidden;
		    white-space: nowrap;

		    text-align: right;
		}
		.x-not-aligned .value {
		    opacity: 0.4;
		}
		`;

		// Axis labels

		channelShadowRoot
			?.querySelector("svg > g:nth-child(2) > path")
			?.setAttribute("fill", "white");

		const bg = document.createElementNS(
			"http://www.w3.org/2000/svg",
			"rect",
		);

		setAttributes(bg, {
			width: "45px",
			height: "100%",
			fill: "white",
			transform: "translate(-50, 0)",
		});

		channelShadowRoot
			?.querySelector("svg > g:nth-child(2)")
			?.appendChild(bg);

		const xLabel = document.createElement("p");
		xLabel.innerHTML = "Time (seconds)";
		xLabel.className = "x-label";
		xLabel.style.top = `${currentHeight}vh`;
		document.body.appendChild(xLabel);
		xLabel.style.opacity = "1";

		const yLabel = document.createElement("p");
		yLabel.innerHTML = aliases[channel] || channel;
		yLabel.className = "y-label";
		yLabel.style.top = `${currentHeight - 12}vh`;
		document.body.appendChild(yLabel);
		yLabel.style.opacity = "1";

		currentHeight += 24;
	}

	for (const i of measurements) {
		current[channel] += 10;
		window.CRISiSLab.data[channel].push({
			x: timestamp - start + current[channel],
			y: channel.startsWith("EN") ? i / 3.845e5 : i,
		});
		if (window.CRISiSLab.data[channel].length > maxDataLength) {
			window.CRISiSLab.data[channel].shift();
		}
	}

	current[channel] = 0;

	if (
		window.CRISiSLab.charts[channel].model.xScale.domain()[1] / 10 >
		window.CRISiSLab.data[channel].length - 100
	) {
		// autoscale
		// Get data that's in view
		const start = Math.max(
			window.CRISiSLab.charts[channel].model.xScale.domain()[0] / 10,
			0,
		);
		const end =
			window.CRISiSLab.charts[channel].model.xScale.domain()[1] / 10;
		const dataInView = window.CRISiSLab.data[channel].slice(start);

		// Get the max and min values
		const max = d3Max(dataInView, (d) => d.y);
		const min = d3Min(dataInView, (d) => d.y);

		// Set the domain of the yScale
		window.CRISiSLab.charts[channel].options.yRange = { min, max };
	}

	window.CRISiSLab.charts[channel].update();

	hideMessages();
	if (!window.CRISiSLab.haveRenderedPacket) {
		window.CRISiSLab.haveRenderedPacket = true;
		reloadButton.toggleAttribute("disabled", true);
	}
}
