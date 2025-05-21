import { expect, test } from "@playwright/test";
import { useLocalAPI } from "./utils";

test.beforeEach(async ({ page }) => {
	// Load shakemap
	await page.goto("https://shakemap.crisislab.org.nz/");

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



test("Can get to sensor using map", async ({ page }) => {
	// FIXME: Redo this when we switch to mock data 
	await page.getByRole('region', { name: 'Map' }).click({
    position: {
      x: 400,
      y: 347
    }
  });
  await page.getByRole('region', { name: 'Map' }).click({
    position: {
      x: 364,
      y: 387
    }
  });
  await page.getByRole('region', { name: 'Map' }).click({
    position: {
      x: 386,
      y: 404
    }
  });
  await page.getByRole('region', { name: 'Map' }).click({
    position: {
      x: 383,
      y: 393
    }
  });
  await page.getByRole('region', { name: 'Map' }).click({
    position: {
      x: 274,
      y: 128
    }
  });
  /* await page.getByRole('button', { name: 'Zoom in' }).click();
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await page.getByRole('region', { name: 'Map' }).click({
    position: {
      x: 153,
      y: 57
    }
  });
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await page.getByRole('region', { name: 'Map' }).click({
    position: {
      x: 338,
      y: 488
    }
  });*/
});
