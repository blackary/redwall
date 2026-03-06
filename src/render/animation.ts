import { UNIT_DEFINITIONS } from "../core/content";
import type { UnitEntity } from "../core/types";

export type UnitAnimationActivity = "idle" | "march" | "harvest" | "build" | "attack" | "carry";

export type UnitAnimationState = {
  activity: UnitAnimationActivity;
  bob: number;
  stride: number;
  sway: number;
  lean: number;
  armSwing: number;
  gearSwing: number;
  tailSwing: number;
  headNod: number;
  pulse: number;
  dustAlpha: number;
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function getIdPhase(id: string): number {
  return id.split("").reduce((total, character) => total + character.charCodeAt(0), 0) * 0.031;
}

function getActivity(unit: UnitEntity): UnitAnimationActivity {
  if (unit.order.type === "build") {
    return "build";
  }
  if (unit.order.type === "gather") {
    if (unit.order.phase === "harvest") {
      return "harvest";
    }
    return unit.carry?.amount ? "carry" : "march";
  }
  if (unit.order.type === "attack" || unit.attackCooldownMs > 0) {
    return "attack";
  }
  if (unit.order.type === "move" || unit.order.type === "attackMove") {
    return "march";
  }
  if (unit.carry?.amount) {
    return "carry";
  }
  return "idle";
}

export function getUnitAnimationState(
  unit: UnitEntity,
  timeMs: number,
  options?: { reducedMotion?: boolean },
): UnitAnimationState {
  const reducedMotion = Boolean(options?.reducedMotion);
  const motionScale = reducedMotion ? 0.45 : 1;
  const activity = getActivity(unit);
  const definition = UNIT_DEFINITIONS[unit.unitType];
  const time = timeMs / 1000;
  const phase = time * 7.2 + getIdPhase(unit.id);
  const marchPhase = phase * clamp(definition.speed * 0.95, 0.8, 2.2);
  const workPhase = time * 9.5 + getIdPhase(unit.id) * 1.4;
  const attackProgress = unit.attackCooldownMs > 0
    ? 1 - clamp(unit.attackCooldownMs / Math.max(1, definition.attackCooldownMs), 0, 1)
    : 0;
  const attackArc = Math.sin(attackProgress * Math.PI);
  const pulse = (Math.sin(phase * 1.35) + 1) * 0.5;

  if (activity === "march" || activity === "carry") {
    const stride = Math.sin(marchPhase);
    return {
      activity,
      bob: Math.abs(Math.cos(marchPhase * 1.05)) * 1.55 * motionScale,
      stride: stride * 2.3 * motionScale,
      sway: Math.sin(marchPhase * 0.5) * 0.85 * motionScale,
      lean: stride * 0.65 * motionScale,
      armSwing: stride * 0.95 * motionScale,
      gearSwing: Math.cos(marchPhase + Math.PI / 3) * 0.75 * motionScale,
      tailSwing: Math.sin(marchPhase * 0.8) * 0.95 * motionScale,
      headNod: Math.cos(marchPhase * 1.05) * 0.7 * motionScale,
      pulse,
      dustAlpha: reducedMotion ? 0.12 : 0.24 + Math.abs(stride) * 0.18,
    };
  }

  if (activity === "harvest" || activity === "build") {
    const workSwing = Math.sin(workPhase) * motionScale;
    return {
      activity,
      bob: Math.abs(Math.sin(workPhase * 0.5)) * 0.8 * motionScale,
      stride: workSwing * 0.45,
      sway: Math.sin(workPhase * 0.5) * 0.55 * motionScale,
      lean: 0.55 * motionScale,
      armSwing: workSwing * 1.65,
      gearSwing: Math.sin(workPhase + 0.8) * 1.85 * motionScale,
      tailSwing: Math.sin(workPhase * 0.7) * 0.4 * motionScale,
      headNod: Math.sin(workPhase + 0.35) * 0.5 * motionScale,
      pulse,
      dustAlpha: reducedMotion ? 0.1 : 0.22 + Math.abs(workSwing) * 0.24,
    };
  }

  if (activity === "attack") {
    return {
      activity,
      bob: attackArc * 1.1 * motionScale,
      stride: attackArc * 0.8 * motionScale,
      sway: Math.sin(phase * 1.4) * 0.5 * motionScale,
      lean: attackArc * 1.25 * motionScale,
      armSwing: attackArc * 2.1 * motionScale,
      gearSwing: attackArc * 2.45 * motionScale,
      tailSwing: Math.sin(phase * 0.9) * 0.65 * motionScale,
      headNod: attackArc * 0.95 * motionScale,
      pulse,
      dustAlpha: reducedMotion ? 0.08 : 0.18 + attackArc * 0.18,
    };
  }

  return {
    activity,
    bob: Math.sin(phase * 0.75) * 0.28 * motionScale,
    stride: Math.sin(phase * 0.8) * 0.16 * motionScale,
    sway: Math.cos(phase * 0.55) * 0.22 * motionScale,
    lean: 0,
    armSwing: Math.sin(phase * 0.65) * 0.14 * motionScale,
    gearSwing: Math.cos(phase * 0.7) * 0.12 * motionScale,
    tailSwing: Math.sin(phase * 0.85) * 0.22 * motionScale,
    headNod: Math.cos(phase * 0.6) * 0.12 * motionScale,
    pulse,
    dustAlpha: 0,
  };
}
