import { type Page, expect } from "@playwright/test";

const localAPIOrigin = "http://localhost:8080";

export async function useLocalAPI(page: Page): Promise<void> {
	// Need to register this before triggering the dialog,
	// otherwise Playwright will dismiss it
	page.on("dialog", async (dialog) => {
		expect(dialog.type()).toBe("prompt");
		expect(dialog.message()).toContain("API origin");
		dialog.accept(localAPIOrigin);
	});

	// Trigger dialog popup
	const buttonTypeA = page.getByRole("button", { name: "Change API origin" })
	const buttonTypeB = page.getByRole("button", { name: "Use custom API origin" })

	await buttonTypeA.or(buttonTypeB).click();
}
