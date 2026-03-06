import { expect, test } from "@playwright/test";

test("settings persist across reload and save-and-exit returns to a resumable menu", async ({ page }) => {
  await page.goto("/?e2e=1&seed=settings");

  await expect(page.getByTestId("show-grid-toggle")).not.toBeChecked();
  await expect(page.getByTestId("reduced-motion-toggle")).not.toBeChecked();

  await page.getByTestId("show-grid-toggle").check();
  await expect(page.getByTestId("show-grid-toggle")).toBeChecked();
  await page.getByTestId("reduced-motion-toggle").check();
  await expect(page.getByTestId("reduced-motion-toggle")).toBeChecked();

  await page.reload();
  await expect(page.getByTestId("show-grid-toggle")).toBeChecked();
  await expect(page.getByTestId("reduced-motion-toggle")).toBeChecked();

  await page.getByTestId("start-skirmish").click();
  await expect(page.getByTestId("toggle-grid-button")).toHaveText("Grid: On");
  await expect(page.getByTestId("toggle-motion-button")).toHaveText("Motion: Reduced");

  const initialSettings = await page.evaluate(() => window.__REDWALL_DEBUG__?.getSettings());
  expect(initialSettings).toEqual({
    showGrid: true,
    reducedMotion: true,
  });

  await page.getByTestId("toggle-grid-button").click();
  await expect(page.getByTestId("toggle-grid-button")).toHaveText("Grid: Off");

  const updatedSettings = await page.evaluate(() => window.__REDWALL_DEBUG__?.getSettings());
  expect(updatedSettings).toEqual({
    showGrid: false,
    reducedMotion: true,
  });

  await page.getByTestId("save-exit-button").click();
  await expect(page.getByTestId("main-menu")).toBeVisible();
  await expect(page.getByTestId("continue-skirmish")).toBeEnabled();
  await expect(page.getByTestId("show-grid-toggle")).not.toBeChecked();
  await expect(page.getByTestId("reduced-motion-toggle")).toBeChecked();
});
