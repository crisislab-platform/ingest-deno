export const statusText = document.getElementById(
	"status",
) as HTMLHeadingElement;
export const reloadButton = document.getElementById(
	"reload",
) as HTMLButtonElement;
export const resetButton = document.getElementById(
	"reset-view",
) as HTMLButtonElement;

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
