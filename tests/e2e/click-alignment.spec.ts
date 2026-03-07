import { expect, test } from "@playwright/test";
import { startSkirmish } from "./helpers";

test("clicking the rendered worker body selects that exact worker", async ({ page }) => {
  await page.setViewportSize({ width: 2048, height: 1215 });
  await page.goto("/?e2e=1&seed=click-alignment");
  await startSkirmish(page);

  const projectedWorker = await page.evaluate(() => {
    const snapshot = window.__REDWALL_DEBUG__?.getSnapshot();
    const camera = window.__REDWALL_DEBUG__?.getCameraState();
    const canvas = document.querySelector("[data-testid='game-shell'] canvas") as HTMLCanvasElement | null;
    if (!snapshot || !camera || !canvas) {
      return null;
    }

    const tileWidth = 88;
    const tileHeight = 44;
    const origin = { x: 600, y: 88 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width / canvas.width;
    const scaleY = rect.height / canvas.height;

    const workers = Object.values(snapshot.entities)
      .filter((entity) => entity.kind === "unit" && entity.playerId === "player" && entity.unitType === "worker")
      .map((entity) => {
        if (entity.kind !== "unit") {
          return null;
        }
        const worldX = origin.x + (entity.position.x - entity.position.y) * (tileWidth / 2);
        const worldY = origin.y + (entity.position.x + entity.position.y) * (tileHeight / 2);
        const point = {
          x: ((worldX - camera.worldViewX) * camera.zoom + camera.x) * scaleX,
          y: ((worldY - camera.worldViewY) * camera.zoom + camera.y) * scaleY,
        };
        return {
          id: entity.id,
          point,
          debugPoint: window.__REDWALL_DEBUG__?.getScreenPointForEntity(entity.id) ?? null,
        };
      })
      .filter((entity): entity is {
        id: string;
        point: { x: number; y: number };
        debugPoint: { x: number; y: number } | null;
      } => {
        return Boolean(
          entity
          && entity.debugPoint
          && entity.point.x > 40
          && entity.point.y > 40
          && entity.point.x < rect.width - 40
          && entity.point.y < rect.height - 40,
        );
      })
      .sort((left, right) => right.point.x - left.point.x);

    return workers[0] ?? null;
  });

  expect(projectedWorker?.point).toBeTruthy();
  expect(projectedWorker?.debugPoint).toBeTruthy();
  if (!projectedWorker?.point || !projectedWorker.debugPoint) {
    throw new Error("Expected a projected worker point and debug point");
  }

  const pointDelta = Math.hypot(
    projectedWorker.point.x - projectedWorker.debugPoint.x,
    projectedWorker.point.y - projectedWorker.debugPoint.y,
  );
  expect(pointDelta).toBeLessThan(2);

  const canvas = page.locator("[data-testid='game-shell'] canvas");
  await canvas.hover({ position: projectedWorker.point });

  await expect.poll(async () => {
    return page.evaluate(() => window.__REDWALL_DEBUG__?.getHoverPreview()?.entityId ?? null);
  }).toBe(projectedWorker.id);

  await canvas.click({ position: projectedWorker.point });

  await expect.poll(async () => {
    const selectedIds = await page.evaluate(() => window.__REDWALL_DEBUG__?.getSelectedIds() ?? []);
    return selectedIds[0] ?? null;
  }).toBe(projectedWorker.id);

  await expect(page.getByTestId("selection-name")).toContainText("Worker");
  await expect(page.getByTestId("action-build-dormitory")).toBeVisible();
});
