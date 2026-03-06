import { expect, test } from "@playwright/test";
import { startSkirmish } from "./helpers";

test("box selection keeps nearby units selectable even when the abbey hall is inside the drag area", async ({ page }) => {
  await page.goto("/?e2e=1&seed=drag-selection");
  await startSkirmish(page);

  const points = await page.evaluate(() => {
    const snapshot = window.__REDWALL_DEBUG__?.getSnapshot();
    if (!snapshot) {
      return null;
    }

    const entities = Object.values(snapshot.entities)
      .filter((entity) => (entity.kind === "unit" || entity.kind === "building") && entity.playerId === "player")
      .map((entity) => ({
        id: entity.id,
        kind: entity.kind,
        point: window.__REDWALL_DEBUG__?.getScreenPointForEntity(entity.id),
      }))
      .filter((entry) => entry.point);

    return {
      minX: Math.min(...entities.map((entry) => entry.point!.x)) - 20,
      minY: Math.min(...entities.map((entry) => entry.point!.y)) - 20,
      maxX: Math.max(...entities.map((entry) => entry.point!.x)) + 20,
      maxY: Math.max(...entities.map((entry) => entry.point!.y)) + 20,
    };
  });

  expect(points).toBeTruthy();
  if (!points) {
    throw new Error("Could not compute drag-selection bounds");
  }

  await page.evaluate((bounds) => {
    window.__REDWALL_DEBUG__?.selectInScreenRect(
      { x: bounds.minX, y: bounds.minY },
      { x: bounds.maxX, y: bounds.maxY },
    );
  }, points);

  const selected = await page.evaluate(() => {
    const snapshot = window.__REDWALL_DEBUG__?.getSnapshot();
    const ids = window.__REDWALL_DEBUG__?.getSelectedIds() ?? [];
    return ids.map((id) => snapshot?.entities[id]).filter(Boolean);
  });

  expect(selected.length).toBeGreaterThan(0);
  expect(selected.every((entity) => entity && entity.kind === "unit")).toBe(true);
  await expect(page.getByTestId("selection-count")).toContainText("Selected");
});
