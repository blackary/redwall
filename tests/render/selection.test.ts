import { describe, expect, test } from "vitest";
import { stringToSeed } from "../../src/core/random";
import { Simulation } from "../../src/core/simulation";
import { getBoxSelectionIds } from "../../src/render/selection";
import type { GameConfig, TilePoint } from "../../src/core/types";

function createConfig(seed = "selection-test"): GameConfig {
  return {
    seed: stringToSeed(seed),
    difficulty: "normal",
    e2e: true,
    mapPreset: "mossflowerMeadows",
    playerFaction: "abbeyAlliance",
    aiFaction: "verminRaiders",
    scenario: "skirmish",
  };
}

function project(tile: TilePoint): TilePoint {
  return {
    x: tile.x * 10,
    y: tile.y * 10,
  };
}

describe("box selection", () => {
  test("prefers units when the selection rectangle also covers a building", () => {
    const simulation = new Simulation(createConfig("mixed-box"));
    const world = simulation.getSnapshot();

    const selectedIds = getBoxSelectionIds(world, { x: 35, y: 35 }, { x: 70, y: 70 }, project);
    const selectedEntities = selectedIds.map((id) => world.entities[id]);

    expect(selectedIds.length).toBeGreaterThan(0);
    expect(selectedEntities.every((entity) => entity?.kind === "unit")).toBe(true);
    expect(selectedEntities.some((entity) => entity?.kind === "unit" && entity.playerId === "player" && entity.unitType === "worker")).toBe(true);
  });

  test("selects player buildings when no units fall inside the rectangle", () => {
    const simulation = new Simulation(createConfig("building-only-box"));
    const world = simulation.getSnapshot();

    const selectedIds = getBoxSelectionIds(world, { x: 35, y: 35 }, { x: 58, y: 58 }, project);

    expect(selectedIds).toContain("building-1");
    expect(selectedIds.every((id) => world.entities[id]?.kind === "building")).toBe(true);
  });
});
