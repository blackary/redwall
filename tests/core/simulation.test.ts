import { describe, expect, test } from "vitest";
import { Simulation } from "../../src/core/simulation";
import { stringToSeed } from "../../src/core/random";
import { createSnapshot, validateSnapshot } from "../../src/core/save";
import type { GameConfig } from "../../src/core/types";

function createConfig(seed = "sim-test"): GameConfig {
  return {
    seed: stringToSeed(seed),
    difficulty: "normal",
    e2e: true,
    mapPreset: "mossflowerMeadows",
  };
}

function findPlayerEntityIds(simulation: Simulation, kind: "worker" | "abbeyHall") {
  const snapshot = simulation.getSnapshot();
  if (kind === "worker") {
    return Object.values(snapshot.entities)
      .filter((entity) => entity.kind === "unit" && entity.playerId === "player" && entity.unitType === "worker")
      .map((entity) => entity.id);
  }
  return Object.values(snapshot.entities)
    .filter((entity) => entity.kind === "building" && entity.playerId === "player" && entity.buildingType === "abbeyHall")
    .map((entity) => entity.id);
}

describe("simulation economy and serialization", () => {
  test("workers gather and deposit food", () => {
    const simulation = new Simulation(createConfig("gathering"));
    const workerId = findPlayerEntityIds(simulation, "worker")[0];
    const resourceId = Object.values(simulation.getSnapshot().entities)
      .find((entity) => entity.kind === "resource" && entity.resourceType === "food" && entity.tile.x <= 8)?.id;

    expect(workerId).toBeTruthy();
    expect(resourceId).toBeTruthy();

    const before = simulation.getSnapshot().players.player.resources.food;
    simulation.issueCommand({ type: "gather", unitIds: [workerId], targetId: resourceId! });
    simulation.advanceTicks(80);

    const after = simulation.getSnapshot().players.player.resources.food;
    expect(after).toBeGreaterThan(before);
  });

  test("construction and training increase cap and population", () => {
    const simulation = new Simulation(createConfig("build-and-train"));
    const workerIds = findPlayerEntityIds(simulation, "worker");
    const hallId = findPlayerEntityIds(simulation, "abbeyHall")[0];

    simulation.issueCommand({
      type: "build",
      unitIds: [workerIds[0]],
      buildingType: "dormitory",
      tile: { x: 8, y: 4 },
    });
    simulation.advanceTicks(60);

    const afterBuilding = simulation.getSnapshot();
    expect(afterBuilding.players.player.populationCap).toBeGreaterThan(8);

    simulation.issueCommand({ type: "train", buildingId: hallId, unitType: "worker" });
    simulation.advanceTicks(30);
    expect(simulation.getSnapshot().players.player.populationUsed).toBeGreaterThan(afterBuilding.players.player.populationUsed);
  });

  test("snapshot validation rejects version mismatches", () => {
    const simulation = new Simulation(createConfig("snapshot"));
    const snapshot = createSnapshot(simulation.getSnapshot(), "normal");
    expect(validateSnapshot(snapshot)).toBe(true);
    expect(validateSnapshot({ ...snapshot, version: snapshot.version + 1 })).toBe(false);
  });
});
