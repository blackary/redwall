import { expect, test } from "@playwright/test";

test("selected production buildings show current work and queued items", async ({ page }) => {
  await page.goto("/?e2e=1&seed=production-progress");
  await page.getByTestId("start-skirmish").click();

  const workerId = await page.evaluate(() => {
    const snapshot = window.__REDWALL_DEBUG__?.getSnapshot();
    return snapshot
      ? Object.values(snapshot.entities).find((entity) => entity.kind === "unit" && entity.playerId === "player" && entity.unitType === "worker")?.id ?? null
      : null;
  });

  expect(workerId).toBeTruthy();
  if (!workerId) {
    throw new Error("Worker was not found for production progress test");
  }

  await page.evaluate((id) => {
    if (!id) {
      return;
    }
    window.__REDWALL_DEBUG__?.issueCommand({
      type: "build",
      unitIds: [id],
      buildingType: "barracks",
      tile: { x: 8, y: 4 },
    });
    window.__REDWALL_DEBUG__?.advanceTicks(70);
  }, workerId);

  const barracksId = await page.evaluate(() => {
    const snapshot = window.__REDWALL_DEBUG__?.getSnapshot();
    return snapshot
      ? Object.values(snapshot.entities).find((entity) => entity.kind === "building" && entity.playerId === "player" && entity.buildingType === "barracks")?.id ?? null
      : null;
  });

  expect(barracksId).toBeTruthy();
  if (!barracksId) {
    throw new Error("Barracks was not found after construction");
  }

  await page.evaluate((id) => window.__REDWALL_DEBUG__?.setSelection([id]), barracksId);
  await expect(page.getByTestId("selection-name")).toHaveText("Barracks");
  await page.getByTestId("action-train-militia").click();
  await page.getByTestId("action-train-militia").click();
  await page.evaluate(() => window.__REDWALL_DEBUG__?.advanceTicks(8));

  await expect(page.getByTestId("work-label")).toHaveText("Training: Militia");
  await expect(page.getByTestId("work-queue")).toContainText("Queued next: Militia");
  const progressValue = await page.getByTestId("work-progress-value").textContent();
  expect(progressValue).not.toBe("0%");
});
