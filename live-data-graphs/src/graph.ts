import { TimeLine } from "./chart";
import { hideMessages, reloadButton } from "./ui";

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
		document.body.appendChild(container);
		window.CRISiSLab.charts[channel] = new TimeLine({
			container,
			data: window.CRISiSLab.data[channel],
			maxPoints: maxDataLength,
			pointWidth,
		});

		container.style.opacity = "1";

		// Axis labels

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
		window.CRISiSLab.data[channel].push({
			x: timestamp - start + current[channel],
			y: channel.startsWith("EN") ? i / 3.845e5 : i,
		});
		current[channel] += pointWidth;

		if (window.CRISiSLab.data[channel].length > maxDataLength) {
			window.CRISiSLab.data[channel].shift();
		}
	}

	current[channel] = 0;

	hideMessages();
	if (!window.CRISiSLab.haveRenderedPacket) {
		window.CRISiSLab.haveRenderedPacket = true;
		reloadButton.toggleAttribute("disabled", true);
	}
}
