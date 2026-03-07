import { expect, test } from "@playwright/test";
import type { UnitEntity } from "../../src/core/types";
import { startSkirmish } from "./helpers";

test("clicking the visible front worker in a crowded cluster selects that worker", async ({ page }) => {
  await page.setViewportSize({ width: 2048, height: 1215 });
  await page.goto("/?e2e=1&seed=crowded-selection");
  await startSkirmish(page);

  const crowdedWorker = await page.evaluate(() => {
    const snapshot = window.__REDWALL_DEBUG__?.getSnapshot();
    if (!snapshot) {
      return null;
    }
    const hall = Object.values(snapshot.entities)
      .find((entity) => entity.kind === "building" && entity.playerId === "player" && entity.buildingType === "abbeyHall");
    if (!hall || hall.kind !== "building") {
      return null;
    }
    const workers = Object.values(snapshot.entities)
      .filter((entity): entity is UnitEntity => {
        return entity.kind === "unit" && entity.playerId === "player" && entity.unitType === "worker";
      })
      .map((entity) => ({
        id: entity.id,
        point: window.__REDWALL_DEBUG__?.getScreenPointForEntity(entity.id) ?? null,
        distanceFromHall: Math.hypot(entity.position.x - hall.tile.x, entity.position.y - hall.tile.y),
      }))
      .filter((entity) => entity.point)
      .sort((left, right) => right.distanceFromHall - left.distanceFromHall);
    return workers[0] ?? null;
  });

  expect(crowdedWorker?.point).toBeTruthy();
  if (!crowdedWorker?.point) {
    throw new Error("Expected a crowded worker with a visible screen point");
  }

  const torsoPoint = {
    x: crowdedWorker.point.x + 18,
    y: crowdedWorker.point.y - 10,
  };
  const canvas = page.locator("[data-testid='game-shell'] canvas");

  await page.evaluate(() => window.__REDWALL_DEBUG__?.setSelection([]));
  await canvas.hover({ position: torsoPoint });

  await expect.poll(async () => {
    return page.evaluate(() => window.__REDWALL_DEBUG__?.getHoverPreview()?.entityId ?? null);
  }).toBe(crowdedWorker.id);

  await canvas.click({ position: torsoPoint });

  await expect.poll(async () => {
    const selectedIds = await page.evaluate(() => window.__REDWALL_DEBUG__?.getSelectedIds() ?? []);
    return selectedIds[0] ?? null;
  }).toBe(crowdedWorker.id);

  await expect(page.getByTestId("selection-name")).toHaveText("Worker");
  await expect(page.getByTestId("action-build-dormitory")).toBeVisible();
});
