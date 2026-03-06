import { getPlayableFactions } from "./factions";
import { getPlayableMaps } from "./map";
import type { FactionId, MapPreset } from "./types";

export interface PlayerProfile {
  xp: number;
  level: number;
  completedTutorial: boolean;
  skirmishWins: number;
  unlockedMaps: MapPreset[];
  unlockedFactions: FactionId[];
}

const LEVEL_XP_STEP = 180;

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

export function createDefaultProfile(): PlayerProfile {
  return applyProgression({
    xp: 0,
    level: 1,
    completedTutorial: false,
    skirmishWins: 0,
    unlockedMaps: ["mossflowerMeadows"],
    unlockedFactions: ["abbeyAlliance"],
  });
}

export function applyProgression(profile: PlayerProfile): PlayerProfile {
  const level = Math.max(1, 1 + Math.floor(profile.xp / LEVEL_XP_STEP));
  const unlockedMaps: MapPreset[] = ["mossflowerMeadows"];
  const unlockedFactions: FactionId[] = ["abbeyAlliance"];

  if (profile.completedTutorial || level >= 2) {
    unlockedMaps.push("abbeyOrchard");
    unlockedFactions.push("riverfolkCollective");
  }
  if (level >= 3) {
    unlockedMaps.push("salamandastronRidge");
    unlockedFactions.push("mountainClans");
  }

  return {
    ...profile,
    level,
    unlockedMaps: unique(unlockedMaps.concat(profile.unlockedMaps)),
    unlockedFactions: unique(unlockedFactions.concat(profile.unlockedFactions)),
  };
}

export function normalizeProfile(profile: Partial<PlayerProfile> | undefined): PlayerProfile {
  return applyProgression({
    ...createDefaultProfile(),
    ...profile,
  });
}

export function awardTutorialCompletion(profile: PlayerProfile): PlayerProfile {
  const next = {
    ...profile,
    xp: profile.xp + (profile.completedTutorial ? 40 : 160),
    completedTutorial: true,
  };
  return applyProgression(next);
}

export function awardSkirmishResult(profile: PlayerProfile, victory: boolean): PlayerProfile {
  const next = {
    ...profile,
    xp: profile.xp + (victory ? 120 : 60),
    skirmishWins: profile.skirmishWins + (victory ? 1 : 0),
  };
  return applyProgression(next);
}

export function isMapUnlocked(profile: PlayerProfile, mapPreset: MapPreset): boolean {
  return profile.unlockedMaps.includes(mapPreset);
}

export function isFactionUnlocked(profile: PlayerProfile, factionId: FactionId): boolean {
  return profile.unlockedFactions.includes(factionId);
}

export function getNextUnlockHint(profile: PlayerProfile): string {
  if (!profile.completedTutorial) {
    return "Complete the tutorial to unlock the Riverfolk Collective and Abbey Orchard.";
  }
  if (profile.level < 3) {
    return `Reach Chronicle Level 3 to unlock Salamandastron Ridge and the Mountain Clans.`;
  }
  return `All current maps and playable factions are unlocked.`;
}

export function getUnlockedSummary(profile: PlayerProfile): string {
  const maps = getPlayableMaps().filter((map) => isMapUnlocked(profile, map.id)).length;
  const factions = getPlayableFactions().filter((faction) => isFactionUnlocked(profile, faction.id)).length;
  return `${maps} maps · ${factions} factions`;
}
