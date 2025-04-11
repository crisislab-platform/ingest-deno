import { expect, test } from "@playwright/test";
import { useLocalAPI } from "./utils";

test.beforeEach(async ({ page }) => {
	// Load shakemap
	await page.goto("https://shakemap.crisislab.org.nz/");

	// Change API origin to local
	await useLocalAPI(page);
});

test("Has sensor count", async ({ page }) => {
	await page.waitForResponse(/api\/v2\/sensors/);

	const onlineTextLabel = await page.getByText("Online: ").textContent();
	expect(onlineTextLabel).not.toBeNull();
	expect(onlineTextLabel).toMatch(/Online: \d+/);

	const offlineTextLabel = await page.getByText("Offline: ").textContent();
	expect(offlineTextLabel).not.toBeNull();
	expect(offlineTextLabel).toMatch(/Offline: \d+/);
});
