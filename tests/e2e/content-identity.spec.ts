import { expect, test } from "@playwright/test";
import { startSkirmish } from "./helpers";

test("menu and battlefield surface distinct map, doctrine, character, and weapon identity", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.localStorage.setItem("redwall-rts.profile", JSON.stringify({
      xp: 360,
      level: 3,
      completedTutorial: true,
      skirmishWins: 2,
      unlockedMaps: ["mossflowerMeadows", "abbeyOrchard", "salamandastronRidge"],
      unlockedFactions: ["abbeyAlliance", "riverfolkCollective", "mountainClans"],
    }));
  });

  await page.goto("/?e2e=1&seed=content-identity");

  await expect(page.getByTestId("profile-unlocks")).toHaveText("3 maps · 3 factions");
  await page.getByTestId("map-select").selectOption("salamandastronRidge");
  await page.getByTestId("faction-select").selectOption("mountainClans");

  await expect(page.getByTestId("selected-map")).toHaveText("Salamandastron Ridge");
  await expect(page.getByTestId("selected-doctrine")).toContainText("Stone-rich mountain clans");
  await expect(page.getByTestId("selected-map-summary")).toContainText("harsh ridge");
  await expect(page.getByTestId("selected-map-strategic-note")).toContainText("narrow ridge approaches");

  await startSkirmish(page);

  await expect(page.getByTestId("map-label")).toHaveText("Salamandastron Ridge");
  await expect(page.getByTestId("map-summary")).toContainText("Rocky dirt lanes");
  await expect(page.getByTestId("faction-doctrine")).toContainText("Infantry are sturdier and hit harder");

  const setup = await page.evaluate(() => {
    const snapshot = window.__REDWALL_DEBUG__?.getSnapshot();
    if (!snapshot) {
      return null;
    }
    return {
      workerId: Object.values(snapshot.entities)
        .find((entity) => entity.kind === "unit" && entity.playerId === "player" && entity.unitType === "worker")?.id ?? null,
      scoutId: Object.values(snapshot.entities)
        .find((entity) => entity.kind === "unit" && entity.playerId === "player" && entity.unitType === "shrewScout")?.id ?? null,
    };
  });

  expect(setup?.workerId).toBeTruthy();
  expect(setup?.scoutId).toBeTruthy();
  if (!setup?.workerId || !setup.scoutId) {
    throw new Error("Expected starting worker and scout ids for content identity test");
  }

  await page.evaluate((id) => window.__REDWALL_DEBUG__?.setSelection([id]), setup.workerId);
  await expect(page.getByTestId("selection-name")).toHaveText("Clan Tender");
  await expect(page.getByTestId("selection-weapon")).toContainText("Stone Hatchet");
  await expect(page.getByTestId("sidebar-title")).toHaveText("Clan Tender");

  await page.evaluate((id) => window.__REDWALL_DEBUG__?.setSelection([id]), setup.scoutId);
  await expect(page.getByTestId("selection-name")).toHaveText("Crag Runner");
  await expect(page.getByTestId("selection-weapon")).toContainText("Cliff Spear");
  await expect(page.getByTestId("sidebar-title")).toHaveText("Crag Runner");
});
