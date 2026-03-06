import { expect, test } from "@playwright/test";
import { startSkirmish } from "./helpers";

test("worker command palette shows grouped buttons and direct tasking", async ({ page }) => {
  await page.goto("/?e2e=1&seed=command-palette");
  await startSkirmish(page);

  const workerId = await page.evaluate(() => {
    const snapshot = window.__REDWALL_DEBUG__?.getSnapshot();
    return snapshot
      ? Object.values(snapshot.entities).find((entity) => entity.kind === "unit" && entity.playerId === "player" && entity.unitType === "worker")?.id ?? null
      : null;
  });

  expect(workerId).toBeTruthy();
  if (!workerId) {
    throw new Error("Worker not found for command palette test");
  }

  await page.evaluate((id) => {
    if (id) {
      window.__REDWALL_DEBUG__?.setSelection([id]);
    }
  }, workerId);

  await expect(page.getByTestId("palette-orders")).toBeVisible();
  await expect(page.getByTestId("palette-tasking")).toBeVisible();
  await expect(page.getByTestId("palette-construction")).toBeVisible();
  await expect(page.getByTestId("action-task-food")).toBeVisible();
  await expect(page.getByTestId("action-build-dormitory")).toBeVisible();

  await page.getByTestId("action-task-food").click();
  await page.waitForFunction((id) => {
    const entity = window.__REDWALL_DEBUG__?.getSnapshot()?.entities[id];
    if (!entity || entity.kind !== "unit" || entity.order.type !== "gather") {
      return false;
    }
    const target = window.__REDWALL_DEBUG__?.getSnapshot()?.entities[entity.order.targetId];
    return target?.kind === "resource" && target.resourceType === "food";
  }, workerId);
});
