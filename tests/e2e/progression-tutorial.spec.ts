import { expect, test } from "@playwright/test";
import { startTutorial } from "./helpers";

test("tutorial completion unlocks the next map and faction, which can then launch a skirmish", async ({ page }) => {
  await page.goto("/?e2e=1&seed=chronicle");
  await startTutorial(page);

  await expect(page.getByTestId("tutorial-panel")).toBeVisible();
  await expect(page.getByTestId("tutorial-current-step")).toContainText("Select a Worker");

  const setup = await page.evaluate(() => {
    const snapshot = window.__REDWALL_DEBUG__?.getSnapshot();
    if (!snapshot) {
      return null;
    }
    return {
      workerIds: Object.values(snapshot.entities)
        .filter((entity) => entity.kind === "unit" && entity.playerId === "player" && entity.unitType === "worker")
        .map((entity) => entity.id),
      foodId: Object.values(snapshot.entities)
        .find((entity) => entity.kind === "resource" && entity.resourceType === "food" && entity.tile.x <= 8)?.id ?? null,
    };
  });

  expect(setup?.workerIds.length).toBeGreaterThanOrEqual(3);
  expect(setup?.foodId).toBeTruthy();

  await page.evaluate((payload) => {
    if (!payload || !payload.foodId) {
      return;
    }
    window.__REDWALL_DEBUG__?.setSelection([payload.workerIds[0]]);
    window.__REDWALL_DEBUG__?.issueCommand({ type: "gather", unitIds: [payload.workerIds[0]], targetId: payload.foodId });
    window.__REDWALL_DEBUG__?.issueCommand({ type: "build", unitIds: [payload.workerIds[1]], buildingType: "dormitory", tile: { x: 8, y: 4 } });
    window.__REDWALL_DEBUG__?.issueCommand({ type: "build", unitIds: [payload.workerIds[2]], buildingType: "barracks", tile: { x: 10, y: 7 } });
    window.__REDWALL_DEBUG__?.advanceTicks(70);
    const barracksId = Object.values(window.__REDWALL_DEBUG__?.getSnapshot()?.entities ?? {})
      .find((entity) => entity.kind === "building" && entity.playerId === "player" && entity.buildingType === "barracks" && entity.completed)?.id;
    if (barracksId) {
      window.__REDWALL_DEBUG__?.issueCommand({ type: "train", buildingId: barracksId, unitType: "militia" });
      window.__REDWALL_DEBUG__?.advanceTicks(10);
    }
  }, setup);

  await expect(page.getByTestId("tutorial-progress")).toHaveText("5/5 completed");
  await expect(page.getByTestId("save-exit-button")).toHaveText("Finish Tutorial");
  await page.getByTestId("save-exit-button").click();

  await expect(page.getByTestId("main-menu")).toBeVisible();
  await expect(page.getByTestId("tutorial-status")).toHaveText("completed");
  await expect(page.getByTestId("profile-unlocks")).toHaveText("2 maps · 2 factions");

  await page.getByTestId("map-select").selectOption("abbeyOrchard");
  await page.getByTestId("faction-select").selectOption("riverfolkCollective");
  await expect(page.getByTestId("selected-map")).toHaveText("Abbey Orchard");
  await expect(page.getByTestId("selected-faction")).toHaveText("Riverfolk Collective");

  await page.getByTestId("start-skirmish").click();
  await expect(page.getByTestId("game-shell")).toBeVisible();
  await expect(page.getByTestId("map-label")).toHaveText("Abbey Orchard");
  await expect(page.getByTestId("faction-label")).toContainText("Riverfolk Collective");

  const snapshot = await page.evaluate(() => window.__REDWALL_DEBUG__?.getSnapshot());
  expect(snapshot?.map.preset).toBe("abbeyOrchard");
  expect(snapshot?.players.player.faction).toBe("riverfolkCollective");
});
