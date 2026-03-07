import { expect, test } from "@playwright/test";
import { startSkirmish } from "./helpers";

test("clicking a worker on the battlefield opens the command palette", async ({ page }) => {
  await page.goto("/?e2e=1&seed=click-selection-menu");
  await startSkirmish(page);

  const workerPoint = await page.evaluate(() => {
    const snapshot = window.__REDWALL_DEBUG__?.getSnapshot();
    if (!snapshot) {
      return null;
    }
    const hall = Object.values(snapshot.entities).find((entity) => entity.kind === "building" && entity.playerId === "player" && entity.buildingType === "abbeyHall");
    if (!hall || hall.kind !== "building") {
      return null;
    }
    const worker = Object.values(snapshot.entities)
      .filter((entity) => entity.kind === "unit" && entity.playerId === "player" && entity.unitType === "worker")
      .sort((left, right) => {
        if (left.kind !== "unit" || right.kind !== "unit") {
          return 0;
        }
        const leftDistance = Math.hypot(left.position.x - hall.tile.x, left.position.y - hall.tile.y);
        const rightDistance = Math.hypot(right.position.x - hall.tile.x, right.position.y - hall.tile.y);
        return rightDistance - leftDistance;
      })[0];
    return worker ? window.__REDWALL_DEBUG__?.getScreenPointForEntity(worker.id) ?? null : null;
  });

  expect(workerPoint).toBeTruthy();
  if (!workerPoint) {
    throw new Error("Worker point was not available for click-selection test");
  }

  await page.mouse.click(workerPoint.x, workerPoint.y);

  await expect(page.getByTestId("selection-name")).toHaveText("Worker");
  await expect(page.getByTestId("action-mode-move")).toBeVisible();
  await expect(page.getByTestId("action-build-dormitory")).toBeVisible();
});
