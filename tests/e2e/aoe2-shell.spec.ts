import { expect, test } from "@playwright/test";
import { startSkirmish } from "./helpers";

test("same-type group selection exposes hotkeyed command cards", async ({ page }) => {
  await page.goto("/?e2e=1&seed=aoe2-shell");
  await startSkirmish(page);

  await page.evaluate(() => {
    window.__REDWALL_DEBUG__?.selectAllUnitsOfType("worker");
  });

  await page.waitForFunction(() => (window.__REDWALL_DEBUG__?.getSelectedIds().length ?? 0) > 1);
  const selectedTypes = await page.evaluate(() => {
    const snapshot = window.__REDWALL_DEBUG__?.getSnapshot();
    const ids = window.__REDWALL_DEBUG__?.getSelectedIds() ?? [];
    return snapshot
      ? ids
        .map((id) => snapshot.entities[id])
        .filter((entity): entity is Extract<(typeof snapshot.entities)[string], { kind: "unit" }> => Boolean(entity && entity.kind === "unit"))
        .map((entity) => entity.unitType)
      : [];
  });

  expect(selectedTypes.length).toBeGreaterThan(1);
  expect(selectedTypes.every((unitType) => unitType === "worker")).toBe(true);
  await expect(page.getByTestId("action-group-move")).toContainText("Q");
  await expect(page.getByTestId("action-build-dormitory")).toBeVisible();
});

test("clicking the minimap repositions the camera", async ({ page }) => {
  await page.goto("/?e2e=1&seed=aoe2-minimap");
  await startSkirmish(page);

  const beforeCamera = await page.evaluate(() => window.__REDWALL_DEBUG__?.getCameraState());
  expect(beforeCamera).toBeTruthy();

  let afterCamera = beforeCamera;
  for (const position of [
    { x: 170, y: 12 },
    { x: 12, y: 170 },
    { x: 170, y: 170 },
  ]) {
    await page.getByTestId("minimap").click({ position });
    afterCamera = await page.evaluate(() => window.__REDWALL_DEBUG__?.getCameraState());
    if (
      afterCamera
      && beforeCamera
      && Math.hypot(afterCamera.scrollX - beforeCamera.scrollX, afterCamera.scrollY - beforeCamera.scrollY) > 30
    ) {
      break;
    }
  }

  expect(afterCamera).toBeTruthy();
  expect(beforeCamera).toBeTruthy();
  expect(Math.hypot(
    (afterCamera?.scrollX ?? 0) - (beforeCamera?.scrollX ?? 0),
    (afterCamera?.scrollY ?? 0) - (beforeCamera?.scrollY ?? 0),
  )).toBeGreaterThan(30);
});
