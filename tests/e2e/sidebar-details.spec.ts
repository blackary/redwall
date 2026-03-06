import { expect, test } from "@playwright/test";
import { startSkirmish } from "./helpers";

test("right sidebar stays visible and explains build actions in detail", async ({ page }) => {
  await page.goto("/?e2e=1&seed=sidebar-details");
  await startSkirmish(page);

  await expect(page.getByTestId("hud-sidebar")).toBeVisible();
  await expect(page.getByTestId("sidebar-title")).toHaveText("Abbey Advisor");
  await expect(page.getByTestId("sidebar-summary")).toContainText("Select a worker");

  const workerId = await page.evaluate(() => {
    const snapshot = window.__REDWALL_DEBUG__?.getSnapshot();
    return snapshot
      ? Object.values(snapshot.entities).find((entity) => entity.kind === "unit" && entity.playerId === "player" && entity.unitType === "worker")?.id ?? null
      : null;
  });

  expect(workerId).toBeTruthy();
  if (!workerId) {
    throw new Error("Worker was not found for sidebar detail test");
  }

  await page.evaluate((id) => {
    if (id) {
      window.__REDWALL_DEBUG__?.setSelection([id]);
    }
  }, workerId);

  await expect(page.getByTestId("hud-sidebar")).toBeVisible();
  await expect(page.getByTestId("sidebar-title")).toHaveText("Worker");
  await expect(page.getByTestId("sidebar-action-title")).toHaveText("Dormitory");

  await page.getByTestId("action-build-barracks").hover();

  await expect(page.getByTestId("sidebar-action-title")).toHaveText("Barracks");
  await expect(page.getByTestId("sidebar-action-summary")).toContainText("Primary military hall");
  await expect(page.getByTestId("sidebar-action-meta")).toContainText("Size");
});
