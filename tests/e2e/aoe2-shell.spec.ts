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

  await page.getByTestId("minimap").click({
    position: { x: 165, y: 150 },
  });

  await page.waitForFunction((before) => {
    const after = window.__REDWALL_DEBUG__?.getCameraState();
    return Boolean(after && before && Math.abs(after.scrollX - before.scrollX) > 40 && Math.abs(after.scrollY - before.scrollY) > 40);
  }, beforeCamera);

  const afterCamera = await page.evaluate(() => window.__REDWALL_DEBUG__?.getCameraState());
  expect(afterCamera).toBeTruthy();
  expect(Math.abs((afterCamera?.scrollX ?? 0) - (beforeCamera?.scrollX ?? 0))).toBeGreaterThan(40);
  expect(Math.abs((afterCamera?.scrollY ?? 0) - (beforeCamera?.scrollY ?? 0))).toBeGreaterThan(40);
});
