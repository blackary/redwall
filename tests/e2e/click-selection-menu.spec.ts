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
    return worker
      ? {
          id: worker.id,
          point: window.__REDWALL_DEBUG__?.getScreenPointForEntity(worker.id) ?? null,
        }
      : null;
  });

  expect(workerPoint).toBeTruthy();
  if (!workerPoint?.point) {
    throw new Error("Worker point was not available for click-selection test");
  }

  const canvas = page.locator("[data-testid='game-shell'] canvas");
  await canvas.hover({ position: workerPoint.point });
  await page.waitForFunction((workerId) => {
    const hover = window.__REDWALL_DEBUG__?.getHoverPreview();
    return hover?.entityId === workerId && hover.detail?.includes("Click to select") === true;
  }, workerPoint.id);

  await canvas.click({ position: workerPoint.point });

  await expect(page.getByTestId("selection-name")).toContainText("Worker");
  await expect(page.getByTestId("selection-weapon")).toContainText("Mallet");
  await expect(page.getByTestId("action-mode-move")).toBeVisible();
  await expect(page.getByTestId("action-build-dormitory")).toBeVisible();

  for (const offset of [
    { x: 14, y: -10 },
    { x: -12, y: 6 },
  ]) {
    await page.waitForTimeout(400);
    await canvas.hover({
      position: {
        x: workerPoint.point.x + offset.x,
        y: workerPoint.point.y + offset.y,
      },
    });
    await page.waitForFunction((workerId) => window.__REDWALL_DEBUG__?.getHoverPreview()?.entityId === workerId, workerPoint.id);
    await canvas.click({
      position: {
        x: workerPoint.point.x + offset.x,
        y: workerPoint.point.y + offset.y,
      },
    });
    await expect(page.getByTestId("selection-name")).toContainText("Worker");
  }

  const layout = await page.evaluate(() => {
    const actionPanel = document.querySelector(".action-panel")?.getBoundingClientRect();
    const actionPalette = document.querySelector("[data-testid='action-panel']") as HTMLDivElement | null;
    const buildButton = document.querySelector("[data-testid='action-build-dormitory']")?.getBoundingClientRect();
    const queuePanel = document.querySelector("[data-testid='queue-panel']") as HTMLDivElement | null;
    const sidebar = document.querySelector("[data-testid='hud-sidebar']")?.getBoundingClientRect();
    const dock = document.querySelector(".hud-dock")?.getBoundingClientRect();
    const textBlocks = [
      document.querySelector("[data-testid='map-summary']")?.getBoundingClientRect(),
      document.querySelector("[data-testid='faction-doctrine']")?.getBoundingClientRect(),
      document.querySelector(".minimap-instructions")?.getBoundingClientRect(),
      document.querySelector("[data-testid='outcome-label']")?.getBoundingClientRect(),
    ]
      .filter((rect): rect is DOMRect => Boolean(rect))
      .map((rect) => ({ top: rect.top, bottom: rect.bottom }));
    return {
      viewportHeight: window.innerHeight,
      actionPanel: actionPanel ? { top: actionPanel.top, bottom: actionPanel.bottom } : null,
      buildButton: buildButton ? { top: buildButton.top, bottom: buildButton.bottom } : null,
      queueHidden: queuePanel?.hidden ?? null,
      sidebar: sidebar ? { top: sidebar.top, bottom: sidebar.bottom } : null,
      dock: dock ? { top: dock.top, bottom: dock.bottom, height: dock.height } : null,
      actionPaletteMetrics: actionPalette ? {
        clientHeight: actionPalette.clientHeight,
        scrollHeight: actionPalette.scrollHeight,
      } : null,
      textBlocks,
    };
  });

  expect(layout.actionPanel).toBeTruthy();
  expect(layout.buildButton).toBeTruthy();
  expect(layout.sidebar).toBeTruthy();
  expect(layout.dock).toBeTruthy();
  expect(layout.actionPaletteMetrics).toBeTruthy();
  expect(layout.queueHidden).toBe(true);
  expect(layout.actionPanel!.bottom).toBeLessThanOrEqual(layout.viewportHeight);
  expect(layout.buildButton!.top).toBeGreaterThanOrEqual(layout.actionPanel!.top);
  expect(layout.buildButton!.bottom).toBeLessThanOrEqual(layout.actionPanel!.bottom);
  expect(layout.sidebar!.bottom).toBeLessThanOrEqual(layout.viewportHeight);
  expect(layout.dock!.height).toBeLessThanOrEqual(380);
  expect(layout.actionPaletteMetrics!.scrollHeight).toBeGreaterThanOrEqual(layout.actionPaletteMetrics!.clientHeight);
  for (let index = 1; index < layout.textBlocks.length; index += 1) {
    expect(layout.textBlocks[index]!.top).toBeGreaterThanOrEqual(layout.textBlocks[index - 1]!.bottom - 1);
  }
});
