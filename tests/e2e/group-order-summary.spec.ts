import { expect, test } from "@playwright/test";
import { startSkirmish } from "./helpers";

test("multi-unit selection surfaces group order breakdowns", async ({ page }) => {
  await page.goto("/?e2e=1&seed=group-order-summary");
  await startSkirmish(page);

  const workerIds = await page.evaluate(() => {
    const snapshot = window.__REDWALL_DEBUG__?.getSnapshot();
    return snapshot
      ? Object.values(snapshot.entities)
          .filter((entity) => entity.kind === "unit" && entity.playerId === "player" && entity.unitType === "worker")
          .map((entity) => entity.id)
      : [];
  });

  expect(workerIds.length).toBeGreaterThanOrEqual(2);

  await page.evaluate((ids) => {
    if (ids.length > 0) {
      window.__REDWALL_DEBUG__?.setSelection(ids);
    }
  }, workerIds);

  await expect(page.getByTestId("group-workers")).toHaveText(`${workerIds.length}`);
  await expect(page.getByTestId("group-primary-order")).toContainText(/Idle|Holding/);
  await expect(page.getByTestId("group-order-breakdown")).toContainText(/Idle|Holding/);

  await page.getByTestId("action-task-food").click();

  await page.waitForFunction((ids) => {
    const snapshot = window.__REDWALL_DEBUG__?.getSnapshot();
    return ids.every((id) => {
      const entity = snapshot?.entities[id];
      return entity?.kind === "unit" && entity.order.type === "gather";
    });
  }, workerIds);

  await expect(page.getByTestId("group-primary-order")).toContainText("Food");
  await expect(page.getByTestId("group-order-breakdown")).toContainText("Food");
});
