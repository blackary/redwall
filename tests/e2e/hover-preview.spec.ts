import { expect, test } from "@playwright/test";
import { startSkirmish } from "./helpers";

test("battlefield hover previews and armed build state stay clear", async ({ page }) => {
  await page.goto("/?e2e=1&seed=hover-preview");
  await startSkirmish(page);

  const setup = await page.evaluate(() => {
    const snapshot = window.__REDWALL_DEBUG__?.getSnapshot();
    if (!snapshot) {
      return null;
    }

    const hall = Object.values(snapshot.entities).find((entity) => entity.kind === "building" && entity.playerId === "player" && entity.buildingType === "abbeyHall");
    const worker = Object.values(snapshot.entities).find((entity) => entity.kind === "unit" && entity.playerId === "player" && entity.unitType === "worker");
    const food = Object.values(snapshot.entities).find((entity) => entity.kind === "resource" && entity.resourceType === "food");
    if (!hall || hall.kind !== "building" || !worker || worker.kind !== "unit" || !food || food.kind !== "resource") {
      return null;
    }

    const blockedPoint = window.__REDWALL_DEBUG__?.getScreenPointForEntity(hall.id) ?? null;
    const workerPoint = window.__REDWALL_DEBUG__?.getScreenPointForEntity(worker.id) ?? null;
    const resourcePoint = window.__REDWALL_DEBUG__?.getScreenPointForEntity(food.id) ?? null;
    let freePoint = null;

    for (let y = hall.tile.y + 1; y < snapshot.map.height; y += 1) {
      for (let x = hall.tile.x + 3; x < snapshot.map.width; x += 1) {
        const occupied = Object.values(snapshot.entities).some((entity) => {
          if (entity.kind === "resource") {
            return entity.tile.x === x && entity.tile.y === y;
          }
          if (entity.kind === "building") {
            const footprint = entity.buildingType === "abbeyHall"
              ? { x: 2, y: 2 }
              : entity.buildingType === "barracks" || entity.buildingType === "range" || entity.buildingType === "longPatrolLodge" || entity.buildingType === "workshop"
                ? { x: 2, y: 1 }
                : { x: 1, y: 1 };
            return x >= entity.tile.x
              && y >= entity.tile.y
              && x < entity.tile.x + footprint.x
              && y < entity.tile.y + footprint.y;
          }
          return false;
        });
        if (!occupied) {
          freePoint = window.__REDWALL_DEBUG__?.getScreenPointForTile({ x, y }) ?? null;
          if (freePoint) {
            break;
          }
        }
      }
      if (freePoint) {
        break;
      }
    }

    return blockedPoint && workerPoint && resourcePoint && freePoint
      ? {
          workerId: worker.id,
          workerPoint,
          blockedPoint,
          resourcePoint,
          freePoint,
        }
      : null;
  });

  expect(setup).toBeTruthy();
  if (!setup) {
    throw new Error("Hover preview setup data was unavailable");
  }

  const canvas = page.locator("[data-testid='game-shell'] canvas");
  await canvas.hover({ position: setup.workerPoint });

  await page.waitForFunction((workerId) => {
    const hover = window.__REDWALL_DEBUG__?.getHoverPreview();
    return hover?.entityId === workerId && hover.label.includes("Worker");
  }, setup.workerId);

  await canvas.click({ position: setup.workerPoint });
  await expect(page.getByTestId("selection-name")).toContainText("Worker");

  const buildButton = page.getByTestId("action-build-dormitory");
  await buildButton.click();
  await expect(page.getByTestId("command-mode")).toHaveText("Build: Dormitory");
  await expect(buildButton).toHaveAttribute("aria-pressed", "true");

  await canvas.hover({ position: setup.blockedPoint });
  await page.waitForFunction(() => {
    const hover = window.__REDWALL_DEBUG__?.getHoverPreview();
    return hover?.kind === "build-invalid" && hover.blockedReasons?.includes("occupied") === true;
  });

  await canvas.hover({ position: setup.resourcePoint });
  await page.waitForFunction(() => {
    const hover = window.__REDWALL_DEBUG__?.getHoverPreview();
    return hover?.kind === "build-invalid" && hover.blockedReasons?.includes("resource") === true;
  });

  await canvas.hover({ position: setup.freePoint });
  await page.waitForFunction(() => {
    const hover = window.__REDWALL_DEBUG__?.getHoverPreview();
    return hover?.kind === "build-valid" && hover.detail?.includes("footprint clear") === true;
  });
});
