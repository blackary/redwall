import { expect, test } from "@playwright/test";
import { continueSkirmish, startSkirmish } from "./helpers";

test("economy loop progresses and latest skirmish resumes after reload", async ({ page }) => {
  await page.goto("/?e2e=1&seed=economy");
  await startSkirmish(page);

  const ids = await page.evaluate(() => {
    const snapshot = window.__REDWALL_DEBUG__?.getSnapshot();
    if (!snapshot) {
      return null;
    }
    return {
      workerIds: Object.values(snapshot.entities)
        .filter((entity) => entity.kind === "unit" && entity.playerId === "player" && entity.unitType === "worker")
        .map((entity) => entity.id),
      hallId: Object.values(snapshot.entities)
        .find((entity) => entity.kind === "building" && entity.playerId === "player" && entity.buildingType === "abbeyHall")?.id,
      foodId: Object.values(snapshot.entities)
        .find((entity) => entity.kind === "resource" && entity.resourceType === "food" && entity.tile.x <= 8)?.id,
    };
  });

  expect(ids).toBeTruthy();
  expect(ids?.workerIds.length).toBeGreaterThan(0);
  expect(ids?.hallId).toBeTruthy();
  expect(ids?.foodId).toBeTruthy();

  await page.evaluate((payload) => {
    if (!payload) {
      return;
    }
    window.__REDWALL_DEBUG__?.issueCommand({
      type: "gather",
      unitIds: [payload.workerIds[0]],
      targetId: payload.foodId!,
    });
    window.__REDWALL_DEBUG__?.advanceTicks(90);
    window.__REDWALL_DEBUG__?.issueCommand({
      type: "build",
      unitIds: [payload.workerIds[0]],
      buildingType: "dormitory",
      tile: { x: 8, y: 4 },
    });
    window.__REDWALL_DEBUG__?.issueCommand({
      type: "build",
      unitIds: [payload.workerIds[1]],
      buildingType: "storehouse",
      tile: { x: 10, y: 4 },
    });
    window.__REDWALL_DEBUG__?.issueCommand({
      type: "build",
      unitIds: [payload.workerIds[2]],
      buildingType: "granary",
      tile: { x: 8, y: 7 },
    });
    window.__REDWALL_DEBUG__?.advanceTicks(90);
    window.__REDWALL_DEBUG__?.issueCommand({
      type: "ageUp",
      buildingId: payload.hallId!,
      nextAge: "abbey",
    });
    window.__REDWALL_DEBUG__?.advanceTicks(60);
    window.__REDWALL_DEBUG__?.issueCommand({
      type: "train",
      buildingId: payload.hallId!,
      unitType: "worker",
    });
    window.__REDWALL_DEBUG__?.advanceTicks(25);
  }, ids);

  await expect(page.getByTestId("age-label")).toHaveText("Abbey Age");
  const population = await page.getByTestId("population-value").textContent();
  expect(population).not.toBeNull();

  await page.evaluate(() => window.__REDWALL_DEBUG__?.setPaused(true));
  const saved = await page.evaluate(() => window.__REDWALL_DEBUG__?.saveNow());
  expect(saved).toBe(true);

  const beforeReload = await page.evaluate(() => {
    const snapshot = window.__REDWALL_DEBUG__?.getSnapshot();
    return snapshot
      ? {
          age: snapshot.players.player.age,
          populationCap: snapshot.players.player.populationCap,
          food: snapshot.players.player.resources.food,
        }
      : null;
  });
  expect(beforeReload).toBeTruthy();
  if (!beforeReload) {
    throw new Error("Expected a snapshot before reload");
  }

  await page.reload();
  await expect(page.getByTestId("continue-skirmish")).toBeEnabled();
  await continueSkirmish(page);
  await page.evaluate(() => window.__REDWALL_DEBUG__?.setPaused(true));

  const afterReload = await page.evaluate(() => {
    const snapshot = window.__REDWALL_DEBUG__?.getSnapshot();
    return snapshot
      ? {
          age: snapshot.players.player.age,
          populationCap: snapshot.players.player.populationCap,
          food: snapshot.players.player.resources.food,
        }
      : null;
  });

  expect(afterReload?.age).toBe(beforeReload.age);
  expect(afterReload?.populationCap).toBe(beforeReload.populationCap);
  expect(afterReload?.food ?? 0).toBeGreaterThanOrEqual(beforeReload.food);
});
