import { expect, test } from "@playwright/test";
import { startSkirmish } from "./helpers";

test("attack mode locks onto enemy buildings with a visible target highlight", async ({ page }) => {
  await page.goto("/?e2e=1&seed=attack-targeting");
  await startSkirmish(page);

  const unitsAndTargets = await page.evaluate(() => {
    const snapshot = window.__REDWALL_DEBUG__?.getSnapshot();
    if (!snapshot) {
      return null;
    }
    const scout = Object.values(snapshot.entities).find((entity) => entity.kind === "unit" && entity.playerId === "player" && entity.unitType === "shrewScout");
    const hall = Object.values(snapshot.entities).find((entity) => entity.kind === "building" && entity.playerId === "ai" && entity.buildingType === "abbeyHall");
    if (!scout || scout.kind !== "unit" || !hall || hall.kind !== "building") {
      return null;
    }
    return {
      scoutId: scout.id,
      hallId: hall.id,
    };
  });

  expect(unitsAndTargets).toBeTruthy();
  if (!unitsAndTargets) {
    throw new Error("Scout or enemy abbey hall was not found");
  }

  await page.evaluate(({ scoutId }) => {
    window.__REDWALL_DEBUG__?.setSelection([scoutId]);
  }, unitsAndTargets);

  await expect(page.getByTestId("selection-name")).toHaveText("Shrew Scout");
  await page.getByTestId("action-mode-attack").click();
  await expect(page.getByTestId("command-mode")).toHaveText("Attack Mode");
  await page.evaluate(({ scoutId, hallId }) => {
    window.__REDWALL_DEBUG__?.issueCommand({
      type: "attack",
      unitIds: [scoutId],
      targetId: hallId,
    });
  }, unitsAndTargets);

  await page.waitForFunction((hallId) => {
    const indicators = window.__REDWALL_DEBUG__?.getTargetIndicators() ?? [];
    return indicators.some((indicator) => indicator.id === hallId && indicator.tone === "attack");
  }, unitsAndTargets.hallId);

  await page.evaluate(() => {
    window.__REDWALL_DEBUG__?.advanceTicks(160);
  });

  await page.waitForFunction((hallId) => {
    const entity = window.__REDWALL_DEBUG__?.getSnapshot()?.entities[hallId];
    return entity?.kind === "building" && entity.hp < entity.maxHp;
  }, unitsAndTargets.hallId, { timeout: 2_000 });

  await expect(page.getByTestId("command-mode")).toHaveText("Context");
});
