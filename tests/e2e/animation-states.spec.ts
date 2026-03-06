import { expect, test } from "@playwright/test";
import { startSkirmish } from "./helpers";

test("workers expose live movement and harvesting animation states", async ({ page }) => {
  await page.goto("/?e2e=1&seed=animation-states");
  await startSkirmish(page);

  const workerId = await page.evaluate(() => {
    const snapshot = window.__REDWALL_DEBUG__?.getSnapshot();
    return snapshot
      ? Object.values(snapshot.entities).find((entity) => entity.kind === "unit" && entity.playerId === "player" && entity.unitType === "worker")?.id ?? null
      : null;
  });

  expect(workerId).toBeTruthy();
  if (!workerId) {
    throw new Error("Worker not found for animation-state test");
  }

  await page.evaluate((id) => {
    if (!id) {
      return false;
    }
    return window.__REDWALL_DEBUG__?.issueCommand({
      type: "move",
      unitIds: [id],
      destination: { x: 9, y: 8 },
    });
  }, workerId);

  await page.waitForTimeout(120);
  const movingA = await page.evaluate((id) => id ? window.__REDWALL_DEBUG__?.getAnimationState(id) : undefined, workerId);
  await page.waitForTimeout(120);
  const movingB = await page.evaluate((id) => id ? window.__REDWALL_DEBUG__?.getAnimationState(id) : undefined, workerId);

  expect(movingA?.activity).toBe("march");
  expect(movingB?.activity).toBe("march");
  expect(movingA?.stride).not.toBe(movingB?.stride);

  const foodId = await page.evaluate(() => {
    const snapshot = window.__REDWALL_DEBUG__?.getSnapshot();
    if (!snapshot) {
      return null;
    }
    const worker = Object.values(snapshot.entities).find((entity) => entity.kind === "unit" && entity.playerId === "player" && entity.unitType === "worker");
    if (!worker || worker.kind !== "unit") {
      return null;
    }
    let bestId: string | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const entity of Object.values(snapshot.entities)) {
      if (entity.kind !== "resource" || entity.resourceType !== "food") {
        continue;
      }
      const distance = Math.hypot(entity.tile.x - worker.position.x, entity.tile.y - worker.position.y);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestId = entity.id;
      }
    }
    return bestId;
  });

  expect(foodId).toBeTruthy();
  if (!foodId) {
    throw new Error("Food resource not found for animation-state test");
  }

  await page.evaluate(({ id, targetId }) => {
    if (!id || !targetId) {
      return false;
    }
    return window.__REDWALL_DEBUG__?.issueCommand({
      type: "gather",
      unitIds: [id],
      targetId,
    });
  }, { id: workerId, targetId: foodId });

  await page.waitForFunction((id) => {
    const entity = window.__REDWALL_DEBUG__?.getSnapshot()?.entities[id];
    return entity?.kind === "unit"
      && entity.order.type === "gather"
      && entity.order.phase === "harvest";
  }, workerId);

  const harvestingA = await page.evaluate((id) => id ? window.__REDWALL_DEBUG__?.getAnimationState(id) : undefined, workerId);
  await page.waitForTimeout(120);
  const harvestingB = await page.evaluate((id) => id ? window.__REDWALL_DEBUG__?.getAnimationState(id) : undefined, workerId);
  expect(harvestingA?.activity).toBe("harvest");
  expect(harvestingB?.activity).toBe("harvest");
  expect(Math.max(Math.abs(harvestingA?.gearSwing ?? 0), Math.abs(harvestingB?.gearSwing ?? 0))).toBeGreaterThan(0.15);
  expect(harvestingA?.gearSwing).not.toBe(harvestingB?.gearSwing);
});
