import { describe, expect, test } from "vitest";
import { getUnitAnimationState } from "../../src/render/animation";
import type { UnitEntity } from "../../src/core/types";

function createUnit(overrides?: Partial<UnitEntity>): UnitEntity {
  return {
    id: "unit-test",
    kind: "unit",
    unitType: "worker",
    playerId: "player",
    position: { x: 4.5, y: 4.5 },
    hp: 40,
    maxHp: 40,
    order: { type: "idle" },
    path: [],
    moveTarget: undefined,
    attackCooldownMs: 0,
    carry: undefined,
    ...overrides,
  };
}

describe("unit animation state", () => {
  test("movement orders produce a march pose with changing stride", () => {
    const unit = createUnit({
      order: { type: "move", destination: { x: 8, y: 8 } },
    });

    const first = getUnitAnimationState(unit, 1000);
    const second = getUnitAnimationState(unit, 1120);

    expect(first.activity).toBe("march");
    expect(second.activity).toBe("march");
    expect(first.stride).not.toBe(second.stride);
    expect(Math.abs(first.bob)).toBeGreaterThan(0.2);
  });

  test("harvest orders produce a work pose", () => {
    const unit = createUnit({
      order: { type: "gather", targetId: "resource-1", phase: "harvest" },
    });

    const pose = getUnitAnimationState(unit, 1400);

    expect(pose.activity).toBe("harvest");
    expect(Math.abs(pose.armSwing)).toBeGreaterThan(0.4);
    expect(Math.abs(pose.gearSwing)).toBeGreaterThan(0.6);
  });

  test("attack cooldown produces a combat pose", () => {
    const unit = createUnit({
      unitType: "militia",
      order: { type: "attack", targetId: "unit-2" },
      attackCooldownMs: 500,
    });

    const pose = getUnitAnimationState(unit, 1600);

    expect(pose.activity).toBe("attack");
    expect(Math.abs(pose.gearSwing)).toBeGreaterThan(0.6);
    expect(Math.abs(pose.lean)).toBeGreaterThan(0.2);
  });
});
