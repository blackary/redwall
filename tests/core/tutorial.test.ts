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
    expect(tutorialState?.steps).toHaveLength(7);
    expect(tutorialState?.currentStep?.how).toContain("Forage");
  });

  test("completes after gathering, building, training, and issuing an attack order", () => {
    const simulation = new Simulation(createTutorialConfig("tutorial-complete"));
    const workerIds = Object.values(simulation.getSnapshot().entities)
      .filter((entity) => entity.kind === "unit" && entity.playerId === "player" && entity.unitType === "worker")
      .map((entity) => entity.id);
    const food = findEntity(simulation, "resource", (entity) => entity.resourceType === "food" && entity.tile.x <= 8);
    const hall = findEntity(simulation, "building", (entity) => entity.playerId === "player" && entity.buildingType === "abbeyHall");
    const enemyHall = findEntity(simulation, "building", (entity) => entity.playerId === "ai" && entity.buildingType === "abbeyHall");

    expect(workerIds.length).toBeGreaterThanOrEqual(3);
    expect(food?.id).toBeTruthy();
    expect(hall?.id).toBeTruthy();
    expect(enemyHall?.id).toBeTruthy();

    simulation.issueCommand({ type: "gather", unitIds: [workerIds[0]], targetId: food!.id });
    simulation.issueCommand({ type: "build", unitIds: [workerIds[1]], buildingType: "dormitory", tile: { x: 8, y: 4 } });
    simulation.issueCommand({ type: "train", buildingId: hall!.id, unitType: "worker" });
    simulation.issueCommand({ type: "build", unitIds: [workerIds[2]], buildingType: "barracks", tile: { x: 10, y: 7 } });
    simulation.advanceTicks(60);

    const barracks = findEntity(simulation, "building", (entity) => entity.playerId === "player" && entity.buildingType === "barracks" && entity.completed);
    expect(barracks?.id).toBeTruthy();
    simulation.issueCommand({ type: "train", buildingId: barracks!.id, unitType: "militia" });
    simulation.advanceTicks(24);

    const militia = findEntity(simulation, "unit", (entity) => entity.playerId === "player" && entity.unitType === "militia");
    expect(militia?.id).toBeTruthy();
    simulation.issueCommand({ type: "attack", unitIds: [militia!.id], targetId: enemyHall!.id });

    const tutorialState = getTutorialState(simulation.getSnapshot(), []);
    expect(tutorialState?.completed).toBe(true);
    expect(tutorialState?.steps.every((step) => step.completed)).toBe(true);
  });
});
