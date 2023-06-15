import type { TimeLine } from "./chart";
import { handleData } from "./graphs";

export const statusText = document.getElementById(
	"status",
) as HTMLHeadingElement;
export const reloadButton = document.getElementById(
	"reload",
) as HTMLButtonElement;
export const pauseButton = document.getElementById(
	"pause",
) as HTMLButtonElement;
export const hoverText = document.getElementById(
	"hover-text",
) as HTMLDivElement;
export const chartsContainer = document.getElementById(
	"charts-container",
) as HTMLElement;

export let paused = false;

function handlePause() {
	if (paused) {
		paused = false;

		pauseButton.innerText = "Pause";

		for (const chart of Object.values(window.CRISiSLab.charts))
			chart.unpause();
	} else {
		paused = true;

		pauseButton.innerText = "Resume";

		// Unfocus the button so that space doesn't activate it
		pauseButton.blur();

		for (const chart of Object.values(window.CRISiSLab.charts))
			chart.pause();
	}
}

pauseButton.addEventListener("click", handlePause);
window.addEventListener("keypress", (event) => {
	if (event.key === " ") handlePause();
});

reloadButton.addEventListener("click", () => {
	location.reload();
});

export function showMessage(message: string) {
	statusText.style.display = "block";
	statusText.innerText = message;
}

export function hideMessages() {
	statusText.style.display = "none";
}

export function showNoSensorFound() {
	statusText.style.display = "block";
	statusText.innerText =
		"No sensor found. Go to /consume/4 to see some sensor data.";
}
