import { describe, expect, test } from "vitest";
import {
  awardSkirmishResult,
  awardTutorialCompletion,
  createDefaultProfile,
  isFactionUnlocked,
  isMapUnlocked,
  normalizeProfile,
} from "../../src/core/progression";

describe("player progression", () => {
  test("default profile only unlocks the opening map and faction", () => {
    const profile = createDefaultProfile();

    expect(isMapUnlocked(profile, "mossflowerMeadows")).toBe(true);
    expect(isMapUnlocked(profile, "abbeyOrchard")).toBe(false);
    expect(isFactionUnlocked(profile, "abbeyAlliance")).toBe(true);
    expect(isFactionUnlocked(profile, "riverfolkCollective")).toBe(false);
  });

  test("tutorial completion unlocks the second map and faction immediately", () => {
    const profile = awardTutorialCompletion(createDefaultProfile());

    expect(profile.completedTutorial).toBe(true);
    expect(profile.xp).toBe(160);
    expect(isMapUnlocked(profile, "abbeyOrchard")).toBe(true);
    expect(isFactionUnlocked(profile, "riverfolkCollective")).toBe(true);
  });

  test("chronicle level three unlocks the final map and faction", () => {
    let profile = createDefaultProfile();
    profile = awardTutorialCompletion(profile);
    profile = awardSkirmishResult(profile, true);
    profile = awardSkirmishResult(profile, true);

    expect(profile.level).toBeGreaterThanOrEqual(3);
    expect(isMapUnlocked(profile, "salamandastronRidge")).toBe(true);
    expect(isFactionUnlocked(profile, "mountainClans")).toBe(true);
  });

  test("normalizeProfile recovers missing unlock arrays from stored data", () => {
    const profile = normalizeProfile({
      xp: 240,
      completedTutorial: false,
      skirmishWins: 1,
      unlockedMaps: [],
      unlockedFactions: [],
    });

    expect(profile.level).toBe(2);
    expect(profile.unlockedMaps).toContain("abbeyOrchard");
    expect(profile.unlockedFactions).toContain("riverfolkCollective");
  });
});
