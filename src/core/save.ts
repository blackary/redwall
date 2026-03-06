import { SAVE_VERSION } from "./simulation";
import type { Difficulty, SaveGameSnapshot, WorldState } from "./types";

export function createSnapshot(world: WorldState, difficulty: Difficulty): SaveGameSnapshot {
  return {
    version: SAVE_VERSION,
    timestamp: Date.now(),
    seed: world.seed,
    difficulty,
    mapPreset: world.map.preset,
    playerFaction: world.players.player.faction,
    aiFaction: world.players.ai.faction,
    scenario: world.scenario,
    elapsedMs: world.elapsedMs,
    world: JSON.parse(JSON.stringify(world)) as WorldState,
  };
}

export function validateSnapshot(snapshot: unknown): snapshot is SaveGameSnapshot {
  if (!snapshot || typeof snapshot !== "object") {
    return false;
  }
  const candidate = snapshot as SaveGameSnapshot;
  return candidate.version === SAVE_VERSION
    && typeof candidate.timestamp === "number"
    && typeof candidate.seed === "number"
    && typeof candidate.elapsedMs === "number"
    && typeof candidate.mapPreset === "string"
    && typeof candidate.playerFaction === "string"
    && typeof candidate.aiFaction === "string"
    && typeof candidate.scenario === "string"
    && candidate.world !== undefined;
}
