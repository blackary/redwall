import { expect, test } from "@playwright/test";
import { startTutorial } from "./helpers";

test("tutorial completion unlocks the next map and faction, which can then launch a skirmish", async ({ page }) => {
  await page.goto("/?e2e=1&seed=chronicle");
  await startTutorial(page);

  await expect(page.getByTestId("tutorial-panel")).toBeVisible();
  await expect(page.getByTestId("tutorial-current-step")).toContainText("Select a Worker");
  await expect(page.getByTestId("tutorial-how")).toContainText("Left click");

  const setup = await page.evaluate(() => {
    const snapshot = window.__REDWALL_DEBUG__?.getSnapshot();
    if (!snapshot) {
      return null;
    }
    return {
      workerIds: Object.values(snapshot.entities)
        .filter((entity) => entity.kind === "unit" && entity.playerId === "player" && entity.unitType === "worker")
        .map((entity) => entity.id),
      hallId: Object.values(snapshot.entities)
        .find((entity) => entity.kind === "building" && entity.playerId === "player" && entity.buildingType === "abbeyHall")?.id ?? null,
      foodId: Object.values(snapshot.entities)
        .find((entity) => entity.kind === "resource" && entity.resourceType === "food" && entity.tile.x <= 8)?.id ?? null,
      enemyHallId: Object.values(snapshot.entities)
        .find((entity) => entity.kind === "building" && entity.playerId === "ai" && entity.buildingType === "abbeyHall")?.id ?? null,
    };
  });

  expect(setup?.workerIds.length).toBeGreaterThanOrEqual(3);
  expect(setup?.hallId).toBeTruthy();
  expect(setup?.foodId).toBeTruthy();
  expect(setup?.enemyHallId).toBeTruthy();

  await page.evaluate((workerId) => {
    if (workerId) {
      window.__REDWALL_DEBUG__?.setSelection([workerId]);
    }
  }, setup?.workerIds[0] ?? null);

  await expect(page.getByTestId("tutorial-current-step")).toContainText("Order Food Gathering");
  await expect(page.getByTestId("tutorial-why")).toContainText("food");

  await page.evaluate((payload) => {
    if (!payload || !payload.foodId) {
      return;
    }
    window.__REDWALL_DEBUG__?.issueCommand({ type: "gather", unitIds: [payload.workerIds[0]], targetId: payload.foodId });
  }, setup);

  await expect(page.getByTestId("tutorial-current-step")).toContainText("Build a Dormitory");
  await expect(page.getByTestId("tutorial-success")).toContainText("Dormitory");

  await page.evaluate((payload) => {
    if (payload) {
      window.__REDWALL_DEBUG__?.issueCommand({ type: "build", unitIds: [payload.workerIds[1]], buildingType: "dormitory", tile: { x: 8, y: 4 } });
      window.__REDWALL_DEBUG__?.advanceTicks(24);
    }
  }, setup);

  await expect(page.getByTestId("tutorial-current-step")).toContainText("Queue Another Worker");
  await expect(page.getByTestId("tutorial-how")).toContainText("Abbey Hall");

  await page.evaluate((hallId) => {
    if (hallId) {
      window.__REDWALL_DEBUG__?.issueCommand({ type: "train", buildingId: hallId, unitType: "worker" });
    }
  }, setup?.hallId ?? null);

  await expect(page.getByTestId("tutorial-current-step")).toContainText("Build a Barracks");

  await page.evaluate((payload) => {
    if (payload) {
      window.__REDWALL_DEBUG__?.issueCommand({ type: "build", unitIds: [payload.workerIds[2]], buildingType: "barracks", tile: { x: 10, y: 7 } });
      for (let attempt = 0; attempt < 24; attempt += 1) {
        const barracksId = Object.values(window.__REDWALL_DEBUG__?.getSnapshot()?.entities ?? {})
          .find((entity) => entity.kind === "building" && entity.playerId === "player" && entity.buildingType === "barracks" && entity.completed)?.id;
        if (barracksId) {
          break;
        }
        window.__REDWALL_DEBUG__?.advanceTicks(4);
      }
    }
  }, setup);

  await expect(page.getByTestId("tutorial-current-step")).toContainText("Train a Militia");

  const militiaSetup = await page.evaluate(() => {
    const barracksId = Object.values(window.__REDWALL_DEBUG__?.getSnapshot()?.entities ?? {})
      .find((entity) => entity.kind === "building" && entity.playerId === "player" && entity.buildingType === "barracks" && entity.completed)?.id ?? null;
    return { barracksId };
  });

  expect(militiaSetup.barracksId).toBeTruthy();

  await page.evaluate((barracksId) => {
    if (barracksId) {
      window.__REDWALL_DEBUG__?.issueCommand({ type: "train", buildingId: barracksId, unitType: "militia" });
      window.__REDWALL_DEBUG__?.advanceTicks(24);
    }
  }, militiaSetup.barracksId);

  await expect(page.getByTestId("tutorial-current-step")).toContainText("Issue an Attack Order");
  await expect(page.getByTestId("tutorial-how")).toContainText("Attack");

  const militiaId = await page.evaluate(() => {
    return Object.values(window.__REDWALL_DEBUG__?.getSnapshot()?.entities ?? {})
      .find((entity) => entity.kind === "unit" && entity.playerId === "player" && entity.unitType === "militia")?.id ?? null;
  });

  expect(militiaId).toBeTruthy();

  await page.evaluate((payload) => {
    if (payload?.militiaId && payload.enemyHallId) {
      window.__REDWALL_DEBUG__?.issueCommand({ type: "attack", unitIds: [payload.militiaId], targetId: payload.enemyHallId });
    }
  }, { militiaId, enemyHallId: setup?.enemyHallId ?? null });

  await expect(page.getByTestId("tutorial-progress")).toHaveText("7/7 completed");
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
