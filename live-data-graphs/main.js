import TimeChart from "timechart";
import { min as d3Min, max as d3Max, scaleTime } from "d3";

const statusText = document.getElementById("status");

function noSensorFound() {
	statusText.style.display = "block";
	statusText.innerText =
		"No sensor found. Go to /consume/4 to see some sensor data.";
}

function startGraphing() {
	if (!location.pathname.includes("/consume/")) {
		noSensorFound()
		return
	}

	let sensorNumber = location.pathname.split("/")[2];
	if (!sensorNumber) {
		noSensorFound();
		return
	}
	// Page title

	document.title = "Sensor " + sensorNumber + " realtime data";

	// Websocket connection handler
	let connectionAttempts = 0;
	function connectSocket() {
		const ws = window.ws;
		statusText.style.display = "block";

		ws.addEventListener("open", function () {
			console.info("Connected");
			statusText.style.display = "none";
		});
		ws.addEventListener("close", function () {
			console.info("Disconnected");

			if (connectionAttempts < 5) {
				statusText.innerText = "Reconnecting...";
				setTimeout(connectSocket, 1000);
				connectionAttempts++;
			} else {
				statusText.innerText =
					"Disconnected too many times, please refresh";
			}
			statusText.style.display = "block";
		});
		ws.addEventListener("message", handleMessage);
	}
	connectSocket();

	// Graphs
	const data = {};
	const graphs = {};
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
	let current = {};
	let start;
	let currentHeight = 22.5;

	function setAttributes(el, attrs) {
		for (var key in attrs) {
			el.setAttribute(key, attrs[key]);
		}
	}

	function resetView() {
		for (const i of Object.values(graphs)) i.options.realTime = true;
	}

	const resetButton = document.getElementById("reset-view");
	resetButton.addEventListener("click", resetView);

	setInterval(() => {
		resetButton.setAttribute("disabled", "disabled");
		for (const i in graphs) {
			const graph = graphs[i];
			if (!graph.options.realTime) {
				resetButton.removeAttribute("disabled");
			}
		}
	}, 100);

	let initCount = 0;

	function handleData(packet) {
		const [channel, timestampSeconds, ...measurements] = packet;

		if (initCount < 5 && channel != "EHZ") {
			initCount++
			return;
		} else {
			initCount = 10;
		}

		const timestamp = timestampSeconds * 1000;

		start ||= timestamp;
		data[channel] ||= [];
		current[channel] ||= 0;

		for (let i of measurements) {
			data[channel].push({
				x: timestamp - start + (current[channel] += 10),
				y: channel.startsWith("EN") ? i / 3.845e5 : i,
			});
		}

		current[channel] = 0;

		if (!graphs[channel]) {
			let el = document.createElement("div");
			el.className = "chart";
			el.id = channel;
			document.body.appendChild(el);
			graphs[channel] = new TimeChart(el, {
				series: [
					{
						data: data[channel],
						name: aliases[channel] || channel,
					},
				],
				zoom: {
					x: {
						autoRange: true,
					},
					y: {
						autoRange: true,
					},
				},
				baseTime: start,
				legend: false,
				xScaleType: scaleTime,
				xRange: { min: 200, max: 10000 },
				realTime: true,
			});

			el.style.opacity = 1;

			document
				.querySelector("#" + channel)
				.shadowRoot.querySelector("svg > g:nth-child(2) > path")
				.setAttribute("fill", "white");

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

			document
				.querySelector("#" + channel)
				.shadowRoot.querySelector("svg > g:nth-child(2)")
				.appendChild(bg);

			const xLabel = document.createElement("p");
			xLabel.innerHTML = "Time (seconds)";
			xLabel.className = "x-label";
			xLabel.style.top = currentHeight + "vh";
			document.body.appendChild(xLabel);
			xLabel.style.opacity = 1;

			const yLabel = document.createElement("p");
			yLabel.innerHTML = aliases[channel] || channel;
			yLabel.className = "y-label";
			yLabel.style.top = currentHeight - 14 + "vh";
			document.body.appendChild(yLabel);
			yLabel.style.opacity = 1;

			currentHeight += 24;
		}

		if (
			graphs[channel].model.xScale.domain()[1] / 10 >
			data[channel].length - 100
		) {
			// autoscale
			// Get data that's in view
			const start = Math.max(
				graphs[channel].model.xScale.domain()[0] / 10,
				0,
			);
			const end = graphs[channel].model.xScale.domain()[1] / 10;
			const dataInView = data[channel].slice(start);

			// Get the max and min values
			const max = d3Max(dataInView, (d) => d.y);
			const min = d3Min(dataInView, (d) => d.y);

			// Set the domain of the yScale
			graphs[channel].options.yRange = { min, max };
		}

		graphs[channel].update();
	}

	let connected = false;

	function handleMessage({ data }) {
		if (!connected) {
			console.info("Connected");
			statusText.style.display = "none";
			connected = true;
		}
		let packets = JSON.parse("[" + data.replaceAll("][", "],[") + "]");
		for (let packet of packets) {
			handleData(packet);
		}
	}
}

startGraphing();