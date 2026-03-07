import { expect, test } from "@playwright/test";
import { startSkirmish } from "./helpers";

test("clicking a worker on the battlefield opens the command palette", async ({ page }) => {
  await page.setViewportSize({ width: 2048, height: 1215 });
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

  const canvas = page.locator("[data-testid='game-shell'] canvas");
  await canvas.click({ position: workerPoint });

  await expect(page.getByTestId("selection-name")).toHaveText("Worker");
  await expect(page.getByTestId("action-mode-move")).toBeVisible();
  await expect(page.getByTestId("action-build-dormitory")).toBeVisible();

  for (const offset of [
    { x: 14, y: -10 },
    { x: -12, y: 6 },
  ]) {
    await page.waitForTimeout(400);
    await canvas.click({
      position: {
        x: workerPoint.x + offset.x,
        y: workerPoint.y + offset.y,
      },
    });
    await expect(page.getByTestId("selection-name")).toHaveText("Worker");
  }

  const layout = await page.evaluate(() => {
    const actionPanel = document.querySelector(".action-panel")?.getBoundingClientRect();
    const actionPalette = document.querySelector("[data-testid='action-panel']") as HTMLDivElement | null;
    const sidebar = document.querySelector("[data-testid='hud-sidebar']")?.getBoundingClientRect();
    const dock = document.querySelector(".hud-dock")?.getBoundingClientRect();
    return {
      viewportHeight: window.innerHeight,
      actionPanel: actionPanel ? { top: actionPanel.top, bottom: actionPanel.bottom } : null,
      sidebar: sidebar ? { top: sidebar.top, bottom: sidebar.bottom } : null,
      dock: dock ? { top: dock.top, bottom: dock.bottom, height: dock.height } : null,
      actionPaletteMetrics: actionPalette ? {
        clientHeight: actionPalette.clientHeight,
        scrollHeight: actionPalette.scrollHeight,
      } : null,
    };
  });

  expect(layout.actionPanel).toBeTruthy();
  expect(layout.sidebar).toBeTruthy();
  expect(layout.dock).toBeTruthy();
  expect(layout.actionPaletteMetrics).toBeTruthy();
  expect(layout.actionPanel!.bottom).toBeLessThanOrEqual(layout.viewportHeight);
  expect(layout.sidebar!.bottom).toBeLessThanOrEqual(layout.viewportHeight);
  expect(layout.dock!.height).toBeLessThanOrEqual(380);
  expect(layout.actionPaletteMetrics!.scrollHeight).toBeGreaterThanOrEqual(layout.actionPaletteMetrics!.clientHeight);
});
