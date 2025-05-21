import { expect, test } from "@playwright/test";
import { useLocalAPI } from "./utils";

test.beforeEach(async ({ page }) => {
	// Load shakemap
	await page.goto("https://admin.crisislab.org.nz/manage/sensors");

	// Change API origin to local
	await useLocalAPI(page);

	// Wait for API reqs to finish loading
	await page.waitForResponse(/api\/v2\/sensors/);
});



test("Has sensor count", async ({ page }) => {
	const onlineTextLabel = await page.getByText("Online: ").textContent();
	expect(onlineTextLabel).not.toBeNull();
	expect(onlineTextLabel).toMatch(/Online: \d+/);

	const offlineTextLabel = await page.getByText("Offline: ").textContent();
	expect(offlineTextLabel).not.toBeNull();
	expect(offlineTextLabel).toMatch(/Offline: \d+/);
});


