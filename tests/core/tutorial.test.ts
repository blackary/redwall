import { describe, expect, test } from "vitest";
import { Simulation } from "../../src/core/simulation";
import { stringToSeed } from "../../src/core/random";
import { getTutorialState } from "../../src/core/tutorial";
import type { Entity, GameConfig } from "../../src/core/types";

function createTutorialConfig(seed = "tutorial-test"): GameConfig {
  return {
    seed: stringToSeed(seed),
    difficulty: "easy",
    e2e: true,
    mapPreset: "mossflowerMeadows",
    playerFaction: "abbeyAlliance",
    aiFaction: "verminRaiders",
    scenario: "tutorial",
  };
}

function findEntity<T extends Entity["kind"]>(
  simulation: Simulation,
  kind: T,
  predicate: (entity: Extract<Entity, { kind: T }>) => boolean,
): Extract<Entity, { kind: T }> | undefined {
  return Object.values(simulation.getSnapshot().entities)
    .filter((entity): entity is Extract<Entity, { kind: T }> => entity.kind === kind)
    .find(predicate);
}

describe("tutorial state", () => {
  test("starts with worker selection as the first required step", () => {
    const simulation = new Simulation(createTutorialConfig("tutorial-open"));
    const worker = findEntity(simulation, "unit", (entity) => entity.playerId === "player" && entity.unitType === "worker");
    const world = simulation.getSnapshot();

    const tutorialState = getTutorialState(world, worker ? [worker] : []);

    expect(tutorialState?.completed).toBe(false);
    expect(tutorialState?.currentStep?.id).toBe("gather-food");
    expect(tutorialState?.steps[0]?.completed).toBe(true);
  });

  test("completes after gathering, building, and training militia", () => {
    const simulation = new Simulation(createTutorialConfig("tutorial-complete"));
    const workerIds = Object.values(simulation.getSnapshot().entities)
      .filter((entity) => entity.kind === "unit" && entity.playerId === "player" && entity.unitType === "worker")
      .map((entity) => entity.id);
    const food = findEntity(simulation, "resource", (entity) => entity.resourceType === "food" && entity.tile.x <= 8);

    expect(workerIds.length).toBeGreaterThanOrEqual(3);
    expect(food?.id).toBeTruthy();
    simulation.issueCommand({ type: "gather", unitIds: [workerIds[0]], targetId: food!.id });
    simulation.issueCommand({ type: "build", unitIds: [workerIds[1]], buildingType: "dormitory", tile: { x: 8, y: 4 } });
    simulation.issueCommand({ type: "build", unitIds: [workerIds[2]], buildingType: "barracks", tile: { x: 10, y: 7 } });
    simulation.advanceTicks(60);

    const barracks = findEntity(simulation, "building", (entity) => entity.playerId === "player" && entity.buildingType === "barracks" && entity.completed);
    expect(barracks?.id).toBeTruthy();
    simulation.issueCommand({ type: "train", buildingId: barracks!.id, unitType: "militia" });
    simulation.advanceTicks(8);

    const tutorialState = getTutorialState(simulation.getSnapshot(), []);
    expect(tutorialState?.completed).toBe(true);
    expect(tutorialState?.steps.every((step) => step.completed)).toBe(true);
  });
});
