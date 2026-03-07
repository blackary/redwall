import { expect, test } from "@playwright/test";
import { startSkirmish } from "./helpers";

test("selection card shows live worker orders after direct tasking", async ({ page }) => {
  await page.goto("/?e2e=1&seed=order-visibility");
  await startSkirmish(page);

  const workerId = await page.evaluate(() => {
    const snapshot = window.__REDWALL_DEBUG__?.getSnapshot();
    return snapshot
      ? Object.values(snapshot.entities).find((entity) => entity.kind === "unit" && entity.playerId === "player" && entity.unitType === "worker")?.id ?? null
      : null;
  });

  expect(workerId).toBeTruthy();
  if (!workerId) {
    throw new Error("Worker was not found for order visibility test");
  }

  await page.evaluate((id) => {
    if (id) {
      window.__REDWALL_DEBUG__?.setSelection([id]);
    }
  }, workerId);

  await expect(page.getByTestId("selection-name")).toHaveText("Worker");
  await expect(page.getByTestId("selection-order-summary")).toHaveText("Task: Holding");
  await expect(page.getByTestId("selection-order-target")).toContainText("Current position");

  await page.getByTestId("action-task-food").click();

  await page.waitForFunction((id) => {
    const snapshot = window.__REDWALL_DEBUG__?.getSnapshot();
    const entity = id && snapshot ? snapshot.entities[id] : undefined;
    return entity?.kind === "unit" && entity.order.type === "gather";
  }, workerId);

  await expect(page.getByTestId("selection-order-summary")).toContainText("Food");
  await expect(page.getByTestId("selection-order-target")).toContainText("Food");
  await expect(page.getByTestId("selection-carry")).toContainText("Carry:");
});
