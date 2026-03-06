import { expect, test } from "@playwright/test";

test("ai expands and sends pressure in a seeded skirmish", async ({ page }) => {
  await page.goto("/?e2e=1&seed=ai-pressure");
  await page.getByTestId("start-skirmish").click();

  await page.evaluate(() => window.__REDWALL_DEBUG__?.advanceTicks(260));

  const snapshot = await page.evaluate(() => window.__REDWALL_DEBUG__?.getSnapshot());
  expect(snapshot).toBeTruthy();

  const aiBuildings = Object.values(snapshot!.entities).filter((entity) => entity.kind === "building" && entity.playerId === "ai");
  const aiMilitary = Object.values(snapshot!.entities).filter((entity) => entity.kind === "unit" && entity.playerId === "ai" && entity.unitType !== "worker");
  const aggressiveOrders = aiMilitary.filter(
    (entity) => entity.kind === "unit" && (entity.order.type === "attackMove" || entity.order.type === "attack"),
  );

  expect(aiBuildings.length).toBeGreaterThan(1);
  expect(aiMilitary.length).toBeGreaterThan(1);
  expect(aggressiveOrders.length).toBeGreaterThan(0);
});
