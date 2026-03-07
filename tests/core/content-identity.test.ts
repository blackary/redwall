import { describe, expect, test } from "vitest";
import { UNIT_DEFINITIONS } from "../../src/core/content";
import { getFactionAdjustedUnitDefinition } from "../../src/core/factions";
import { getMapDefinition } from "../../src/core/map";

describe("content identity", () => {
  test("map presets expose distinct layouts and terrain presentation", () => {
    const meadows = getMapDefinition("mossflowerMeadows");
    const orchard = getMapDefinition("abbeyOrchard");
    const ridge = getMapDefinition("salamandastronRidge");

    expect(new Set([meadows.width, orchard.width, ridge.width]).size).toBeGreaterThan(1);
    expect(new Set([meadows.height, orchard.height, ridge.height]).size).toBeGreaterThan(1);
    expect(new Set([meadows.terrainSummary, orchard.terrainSummary, ridge.terrainSummary]).size).toBe(3);
    expect(new Set([meadows.resourceSummary, orchard.resourceSummary, ridge.resourceSummary]).size).toBe(3);
    expect(new Set([
      meadows.terrainPalette.minimapVisible,
      orchard.terrainPalette.minimapVisible,
      ridge.terrainPalette.minimapVisible,
    ]).size).toBe(3);
    expect(ridge.resourceClusters.find((cluster) => cluster.type === "stone")?.tiles.length).toBeGreaterThan(
      meadows.resourceClusters.find((cluster) => cluster.type === "stone")?.tiles.length ?? 0,
    );
  });

  test("factions override unit labels, weapons, species, and battlefield stats", () => {
    const abbeyWorker = getFactionAdjustedUnitDefinition("abbeyAlliance", UNIT_DEFINITIONS.worker);
    const riverWorker = getFactionAdjustedUnitDefinition("riverfolkCollective", UNIT_DEFINITIONS.worker);
    const mountainShieldbearer = getFactionAdjustedUnitDefinition("mountainClans", UNIT_DEFINITIONS.shieldbearer);

    expect(abbeyWorker.label).toBe("Abbey Worker");
    expect(riverWorker.label).toBe("Riverhand");
    expect(riverWorker.weaponLabel).toBe("Boat Hook & Hatchet");
    expect(riverWorker.species).toBe("otter");
    expect(riverWorker.gatherRate?.food).toBeGreaterThan(abbeyWorker.gatherRate?.food ?? 0);
    expect(riverWorker.gatherRate?.timber).toBeGreaterThan(abbeyWorker.gatherRate?.timber ?? 0);

    expect(mountainShieldbearer.label).toBe("Mountain Shieldbearer");
    expect(mountainShieldbearer.weaponLabel).toBe("Iron Hammer & Tower Shield");
    expect(mountainShieldbearer.species).toBe("badger");
    expect(mountainShieldbearer.hp).toBeGreaterThan(UNIT_DEFINITIONS.shieldbearer.hp);
    expect(mountainShieldbearer.attackDamage).toBeGreaterThan(UNIT_DEFINITIONS.shieldbearer.attackDamage);
  });
});
