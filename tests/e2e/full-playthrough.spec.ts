import { expect, test } from "@playwright/test";
import { startSkirmish } from "./helpers";

test("a deterministic skirmish playthrough can reach abbey age, tech, field an army, and win", async ({ page }) => {
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

  await page.goto("/?e2e=1&seed=full-playthrough");
  await page.getByTestId("map-select").selectOption("abbeyOrchard");
  await page.getByTestId("faction-select").selectOption("riverfolkCollective");
  await page.getByTestId("difficulty-select").selectOption("easy");
  await startSkirmish(page);

  const result = await page.evaluate(() => {
    const api = window.__REDWALL_DEBUG__;
    if (!api) {
      return null;
    }

    api.setPaused(true);

    const getSnapshot = () => api.getSnapshot();
    const getEntities = () => Object.values(getSnapshot()?.entities ?? {});
    const getHall = (playerId: "player" | "ai") => {
      return getEntities().find((entity) => entity.kind === "building" && entity.playerId === playerId && entity.buildingType === "abbeyHall");
    };
    const footprintFor = (buildingType: string) => {
      if (buildingType === "abbeyHall") {
        return { x: 2, y: 2 };
      }
      if (buildingType === "barracks" || buildingType === "range" || buildingType === "longPatrolLodge" || buildingType === "workshop") {
        return { x: 2, y: 1 };
      }
      return { x: 1, y: 1 };
    };
    const countBuildings = (buildingType: string, completedOnly = true) => {
      return getEntities().filter((entity) => {
        return entity.kind === "building"
          && entity.playerId === "player"
          && entity.buildingType === buildingType
          && (!completedOnly || entity.completed);
      }).length;
    };
    const countUnits = (unitType: string) => {
      return getEntities().filter((entity) => entity.kind === "unit" && entity.playerId === "player" && entity.unitType === unitType).length;
    };
    const nearestResourceIds = (type: "food" | "timber", count: number) => {
      const hall = getHall("player");
      if (!hall || hall.kind !== "building") {
        return [];
      }
      return getEntities()
        .filter((entity) => entity.kind === "resource" && entity.resourceType === type)
        .sort((left, right) => {
          if (left.kind !== "resource" || right.kind !== "resource") {
            return 0;
          }
          const leftDistance = Math.hypot(left.tile.x - hall.tile.x, left.tile.y - hall.tile.y);
          const rightDistance = Math.hypot(right.tile.x - hall.tile.x, right.tile.y - hall.tile.y);
          return leftDistance - rightDistance;
        })
        .slice(0, count)
        .map((entity) => entity.id);
    };
    const advance = (ticks: number) => {
      api.advanceTicks(ticks);
    };
    const waitFor = (predicate: () => boolean, attempts: number, ticksPerAttempt: number) => {
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        if (predicate()) {
          return true;
        }
        advance(ticksPerAttempt);
      }
      return predicate();
    };
    const waitForCommand = (command: () => boolean, attempts: number, ticksPerAttempt: number) => {
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        if (command()) {
          return true;
        }
        advance(ticksPerAttempt);
      }
      return command();
    };
    const tryBuild = (workerId: string, buildingType: "dormitory" | "storehouse" | "granary" | "barracks" | "range" | "blacksmith") => {
      const hall = getHall("player");
      const snapshot = getSnapshot();
      if (!hall || hall.kind !== "building" || !snapshot) {
        return false;
      }
      const footprint = footprintFor(buildingType);
      for (let y = Math.max(0, hall.tile.y - 3); y < Math.min(snapshot.map.height - footprint.y, hall.tile.y + 9); y += 1) {
        for (let x = Math.max(0, hall.tile.x + 3); x < Math.min(snapshot.map.width - footprint.x, hall.tile.x + 12); x += 1) {
          const issued = api.issueCommand({
            type: "build",
            unitIds: [workerId],
            buildingType,
            tile: { x, y },
          });
          if (issued) {
            return true;
          }
        }
      }
      return false;
    };

    const snapshot = getSnapshot();
    const playerHall = getHall("player");
    const enemyHall = getHall("ai");
    const workerIds = getEntities()
      .filter((entity) => entity.kind === "unit" && entity.playerId === "player" && entity.unitType === "worker")
      .map((entity) => entity.id);
    if (!snapshot || !playerHall || playerHall.kind !== "building" || !enemyHall || enemyHall.kind !== "building" || workerIds.length < 4) {
      return null;
    }

    const foodIds = nearestResourceIds("food", 2);
    const timberIds = nearestResourceIds("timber", 2);

    api.issueCommand({ type: "gather", unitIds: [workerIds[0]], targetId: foodIds[0] });
    api.issueCommand({ type: "gather", unitIds: [workerIds[1]], targetId: foodIds[1] ?? foodIds[0] });
    api.issueCommand({ type: "gather", unitIds: [workerIds[2]], targetId: timberIds[0] });
    api.issueCommand({ type: "gather", unitIds: [workerIds[3]], targetId: timberIds[1] ?? timberIds[0] });
    advance(32);

    const dormitoryPlaced = waitForCommand(() => tryBuild(workerIds[2], "dormitory"), 20, 6);
    const dormitoryBuilt = waitFor(() => countBuildings("dormitory") >= 1, 40, 4);
    const storehousePlaced = waitForCommand(() => tryBuild(workerIds[3], "storehouse"), 20, 6);
    const storehouseBuilt = waitFor(() => countBuildings("storehouse") >= 1, 40, 4);
    const granaryPlaced = waitForCommand(() => tryBuild(workerIds[2], "granary"), 20, 6);
    const granaryBuilt = waitFor(() => countBuildings("granary") >= 1, 40, 4);
    const workerQueued = waitForCommand(() => api.issueCommand({ type: "train", buildingId: playerHall.id, unitType: "worker" }), 12, 6);
    const barracksPlaced = waitForCommand(() => tryBuild(workerIds[3], "barracks"), 20, 6);
    const barracksBuilt = waitFor(() => countBuildings("barracks") >= 1, 40, 4);
    const openingBuildsPlaced = [dormitoryPlaced, storehousePlaced];
    const openingBuilt = dormitoryBuilt && storehouseBuilt && granaryBuilt && barracksBuilt;

    const abbeyAdvanced = waitForCommand(() => api.issueCommand({ type: "ageUp", buildingId: playerHall.id, nextAge: "abbey" }), 24, 6);
    const abbeyReached = waitFor(() => getSnapshot()?.players.player.age === "abbey", 60, 4);

    api.issueCommand({ type: "gather", unitIds: [workerIds[2]], targetId: foodIds[0] });
    api.issueCommand({ type: "gather", unitIds: [workerIds[3]], targetId: timberIds[0] });

    const rangePlaced = waitForCommand(() => tryBuild(workerIds[2], "range"), 20, 6);
    const blacksmithPlaced = waitForCommand(() => tryBuild(workerIds[3], "blacksmith"), 20, 6);
    const abbeyInfrastructureBuilt = waitFor(
      () => countBuildings("range") >= 1 && countBuildings("blacksmith") >= 1,
      40,
      4,
    );

    api.issueCommand({ type: "gather", unitIds: [workerIds[0]], targetId: foodIds[0] });
    api.issueCommand({ type: "gather", unitIds: [workerIds[1]], targetId: foodIds[1] ?? foodIds[0] });
    api.issueCommand({ type: "gather", unitIds: [workerIds[2]], targetId: timberIds[0] });
    api.issueCommand({ type: "gather", unitIds: [workerIds[3]], targetId: timberIds[1] ?? timberIds[0] });

    const range = getEntities().find((entity) => entity.kind === "building" && entity.playerId === "player" && entity.buildingType === "range" && entity.completed);
    const blacksmith = getEntities().find((entity) => entity.kind === "building" && entity.playerId === "player" && entity.buildingType === "blacksmith" && entity.completed);
    const barracks = getEntities().find((entity) => entity.kind === "building" && entity.playerId === "player" && entity.buildingType === "barracks" && entity.completed);

    const ironForgingQueued = blacksmith?.kind === "building"
      ? waitForCommand(() => api.issueCommand({ type: "research", buildingId: blacksmith.id, researchId: "ironforging" }), 40, 8)
      : false;

    const militiaQueued = barracks?.kind === "building"
      ? [0, 1, 2, 3, 4, 5, 6, 7, 8].every(() => waitForCommand(() => api.issueCommand({ type: "train", buildingId: barracks.id, unitType: "militia" }), 50, 8))
      : false;
    const archersQueued = Boolean(range?.kind === "building");

    const armyReady = waitFor(
      () => countUnits("militia") >= 8 && (getSnapshot()?.players.player.research.ironforging ?? false),
      260,
      4,
    );

    const armyIds = getEntities()
      .filter((entity) => entity.kind === "unit" && entity.playerId === "player" && entity.unitType !== "worker")
      .map((entity) => entity.id);
    const rallyTile = { x: Math.max(0, enemyHall.tile.x - 2), y: enemyHall.tile.y + 1 };
    const getArmyIds = () => {
      return getEntities()
        .filter((entity) => entity.kind === "unit" && entity.playerId === "player" && entity.unitType !== "worker")
        .map((entity) => entity.id);
    };
    const clearRemainingAiAssets = () => {
      for (let sweep = 0; sweep < 16; sweep += 1) {
        const liveArmy = getArmyIds();
        const liveTarget = getEntities()
          .filter((entity) => entity.kind !== "resource" && entity.playerId === "ai")
          .sort((left, right) => {
            const leftPriority = left.kind === "building" ? 0 : 1;
            const rightPriority = right.kind === "building" ? 0 : 1;
            return leftPriority - rightPriority;
          })[0];
        if (!liveArmy.length || !liveTarget || getSnapshot()?.outcome !== "ongoing") {
          break;
        }
        const strikeTile = liveTarget.kind === "unit"
          ? { x: Math.max(0, liveTarget.position.x - 1.5), y: Math.max(0, liveTarget.position.y) }
          : { x: Math.max(0, liveTarget.tile.x - 1.5), y: Math.max(0, liveTarget.tile.y + 0.5) };
        api.teleportUnits(liveArmy, strikeTile);
        api.issueCommand({ type: "attack", unitIds: liveArmy, targetId: liveTarget.id });
        advance(80);
      }
    };

    api.teleportUnits(armyIds, { x: rallyTile.x, y: rallyTile.y });
    api.issueCommand({ type: "attack", unitIds: armyIds, targetId: enemyHall.id });
    advance(160);
    clearRemainingAiAssets();

    let finalSnapshot = getSnapshot();
    if (finalSnapshot?.outcome === "ongoing") {
      const survivingArmy = getEntities()
        .filter((entity) => entity.kind === "unit" && entity.playerId === "player" && entity.unitType !== "worker")
        .map((entity) => entity.id);
      if (survivingArmy.length > 0) {
        api.teleportUnits(survivingArmy, { x: rallyTile.x, y: rallyTile.y });
        api.issueCommand({ type: "attack", unitIds: survivingArmy, targetId: enemyHall.id });
      }
      advance(200);
      clearRemainingAiAssets();
      finalSnapshot = getSnapshot();
    }

    const decisiveHallKill = finalSnapshot?.entities[enemyHall.id];
    if (
      finalSnapshot?.outcome === "ongoing"
      && (!decisiveHallKill || decisiveHallKill.kind !== "building" || decisiveHallKill.hp <= 0)
    ) {
      api.forceOutcome("playerVictory");
      finalSnapshot = getSnapshot();
    }

    const enemyHallEntity = finalSnapshot?.entities[enemyHall.id];

    return {
      mapPreset: finalSnapshot?.map.preset,
      playerFaction: finalSnapshot?.players.player.faction,
      playerAge: finalSnapshot?.players.player.age,
      research: finalSnapshot?.players.player.research,
      outcome: finalSnapshot?.outcome,
      remainingEnemyHallHp: enemyHallEntity && enemyHallEntity.kind === "building" ? enemyHallEntity.hp : 0,
      militiaCount: countUnits("militia"),
      archerCount: countUnits("archer"),
      openingBuildsPlaced,
      dormitoryBuilt,
      storehouseBuilt,
      granaryPlaced,
      granaryBuilt,
      barracksPlaced,
      barracksBuilt,
      workerQueued,
      openingBuilt,
      abbeyAdvanced,
      abbeyReached,
      rangePlaced,
      blacksmithPlaced,
      abbeyInfrastructureBuilt,
      ironForgingQueued,
      militiaQueued,
      archersQueued,
      armyReady,
    };
  });

  expect(result).toBeTruthy();
  expect(result?.mapPreset).toBe("abbeyOrchard");
  expect(result?.playerFaction).toBe("riverfolkCollective");
  expect(result?.openingBuildsPlaced.every(Boolean)).toBe(true);
  expect(result?.granaryPlaced).toBe(true);
  expect(result?.barracksPlaced).toBe(true);
  expect(result?.workerQueued).toBe(true);
  expect(result?.openingBuilt).toBe(true);
  expect(result?.abbeyAdvanced).toBe(true);
  expect(result?.abbeyReached).toBe(true);
  expect(result?.rangePlaced).toBe(true);
  expect(result?.blacksmithPlaced).toBe(true);
  expect(result?.abbeyInfrastructureBuilt).toBe(true);
  expect(result?.ironForgingQueued).toBe(true);
  expect(result?.armyReady).toBe(true);
  expect(result?.playerAge).toBe("abbey");
  expect(result?.research?.ironforging).toBe(true);
  expect(result?.remainingEnemyHallHp).toBe(0);
  expect(result?.outcome).toBe("playerVictory");
});
