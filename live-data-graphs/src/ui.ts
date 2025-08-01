export const statusText = document.getElementById(
	"status",
) as HTMLHeadingElement;
export const reloadButton = document.getElementById(
	"reload",
) as HTMLButtonElement;
export const pauseButton = document.getElementById(
	"pause",
) as HTMLButtonElement;

export const chartsContainer = document.getElementById(
	"charts-container",
) as HTMLElement;

export let paused = false;

function resume() {
	paused = false;

	pauseButton.innerText = "Pause";

	for (const chart of Object.values(window.CRISiSLab.charts)) chart.resume();
}
function pause() {
	paused = true;

	pauseButton.innerText = "Resume";

	// Unfocus the button so that space doesn't activate it
	pauseButton.blur();

	for (const chart of Object.values(window.CRISiSLab.charts)) chart.pause();
}
function togglePause() {
	if (paused) {
		resume();
	} else {
		pause();
	}
}

pauseButton.addEventListener("click", togglePause);
if ("mediaSession" in navigator) {
	navigator.mediaSession.setActionHandler("play", resume);
	navigator.mediaSession.setActionHandler("pause", pause);
}
window.addEventListener("keydown", (event) => {
	if (event.key === " ") togglePause();
	if (event.key === "k") togglePause();
	if (event.key === "MediaPlayPause") togglePause();
	if (event.key === "MediaPlay") resume();
	if (event.key === "MediaPause") pause();
	if (event.key === "MediaStop") pause();
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

export function formatTime(time: number, long = false): string {
	const d = new Date(time);
	const timeString = `${d.getHours()}:${d.getMinutes()}:${d.getSeconds()}`;
	if (!long) return timeString;
	return `${d.getFullYear()}-${d.getMonth()}-${d.getDay()} ${timeString}`;
}

export function round(n: number): number {
	return Math.round((n + Number.EPSILON) * 10000) / 10000;
}

export function sortChannels() {
	if (!["id", "display"].includes(window.CRISiSLab.sortChannels ?? ""))
		return;

	// DOM sorting based on https://stackoverflow.com/a/50127768

	// Typescript wasn't happy with me using spread syntax ([...thingy]) here
	(Array.from(chartsContainer.children) as HTMLElement[])
		.sort((a, b) => {
			if (window.CRISiSLab.sortChannels === "id") {
				return (a.getAttribute("data-channel-id") ?? "") >
					(b.getAttribute("data-channel-id") ?? "")
					? 1
					: -1;
			} else if (window.CRISiSLab.sortChannels === "display") {
				return (a.getAttribute("data-channel-display") ?? "") >
					(b.getAttribute("data-channel-display") ?? "")
					? 1
					: -1;
			}
			return 0;
		})
		// When an child element is re-appended to a parent, it is moved instead: https://developer.mozilla.org/en-US/docs/Web/API/Node/appendChild#description
		.forEach((node) => chartsContainer.appendChild(node));
}
