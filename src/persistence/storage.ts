import { openDB } from "idb";
import { createDefaultProfile, normalizeProfile, type PlayerProfile } from "../core/progression";
import { validateSnapshot } from "../core/save";
import type { Difficulty, FactionId, MapPreset, SaveGameSnapshot, ScenarioId } from "../core/types";

const DB_NAME = "redwall-rts";
const DB_VERSION = 1;
const SAVE_STORE = "saveSnapshots";
const SAVE_KEY = "latest";
const RESUME_META_KEY = "redwall-rts.resume";
const SETTINGS_KEY = "redwall-rts.settings";
const PROFILE_KEY = "redwall-rts.profile";
const LAUNCH_PREFS_KEY = "redwall-rts.launchPrefs";

export interface ResumeMetadata {
  timestamp: number;
  difficulty: Difficulty;
  seed: number;
  mapPreset: MapPreset;
  playerFaction: FactionId;
  aiFaction: FactionId;
  scenario: ScenarioId;
  elapsedMs: number;
}

export interface GameSettings {
  showGrid: boolean;
  reducedMotion: boolean;
}

export interface LaunchPreferences {
  mapPreset: MapPreset;
  difficulty: Difficulty;
  playerFaction: FactionId;
}

type RedwallDatabase = {
  saveSnapshots: {
    key: string;
    value: SaveGameSnapshot;
  };
};

async function getDatabase() {
  if (!("indexedDB" in window)) {
    return undefined;
  }
  return openDB<RedwallDatabase>(DB_NAME, DB_VERSION, {
    upgrade(database) {
      if (!database.objectStoreNames.contains(SAVE_STORE)) {
        database.createObjectStore(SAVE_STORE);
      }
    },
  });
}

export class BrowserStorage {
  public async saveSnapshot(snapshot: SaveGameSnapshot): Promise<void> {
    const database = await getDatabase();
    if (database) {
      await database.put(SAVE_STORE, snapshot, SAVE_KEY);
    } else {
      window.localStorage.setItem(SAVE_KEY, JSON.stringify(snapshot));
    }
    const metadata: ResumeMetadata = {
      timestamp: snapshot.timestamp,
      difficulty: snapshot.difficulty,
      seed: snapshot.seed,
      mapPreset: snapshot.mapPreset,
      playerFaction: snapshot.playerFaction,
      aiFaction: snapshot.aiFaction,
      scenario: snapshot.scenario,
      elapsedMs: snapshot.elapsedMs,
    };
    window.localStorage.setItem(RESUME_META_KEY, JSON.stringify(metadata));
  }

  public async loadSnapshot(): Promise<SaveGameSnapshot | undefined> {
    const database = await getDatabase();
    const snapshot = database
      ? await database.get(SAVE_STORE, SAVE_KEY)
      : JSON.parse(window.localStorage.getItem(SAVE_KEY) ?? "null");
    return validateSnapshot(snapshot) ? snapshot : undefined;
  }

  public async clearSnapshot(): Promise<void> {
    const database = await getDatabase();
    if (database) {
      await database.delete(SAVE_STORE, SAVE_KEY);
    }
    window.localStorage.removeItem(SAVE_KEY);
    window.localStorage.removeItem(RESUME_META_KEY);
  }

  public getResumeMetadata(): ResumeMetadata | undefined {
    const raw = window.localStorage.getItem(RESUME_META_KEY);
    if (!raw) {
      return undefined;
    }
    try {
      return JSON.parse(raw) as ResumeMetadata;
    } catch {
      return undefined;
    }
  }

  public loadProfile(): PlayerProfile {
    const raw = window.localStorage.getItem(PROFILE_KEY);
    if (!raw) {
      return createDefaultProfile();
    }
    try {
      return normalizeProfile(JSON.parse(raw) as Partial<PlayerProfile>);
    } catch {
      return createDefaultProfile();
    }
  }

  public saveProfile(profile: PlayerProfile): void {
    window.localStorage.setItem(PROFILE_KEY, JSON.stringify(normalizeProfile(profile)));
  }

  public loadLaunchPreferences(): LaunchPreferences {
    const raw = window.localStorage.getItem(LAUNCH_PREFS_KEY);
    if (!raw) {
      return {
        mapPreset: "mossflowerMeadows",
        difficulty: "normal",
        playerFaction: "abbeyAlliance",
      };
    }
    try {
      const parsed = JSON.parse(raw) as Partial<LaunchPreferences>;
      return {
        mapPreset: parsed.mapPreset ?? "mossflowerMeadows",
        difficulty: parsed.difficulty ?? "normal",
        playerFaction: parsed.playerFaction ?? "abbeyAlliance",
      };
    } catch {
      return {
        mapPreset: "mossflowerMeadows",
        difficulty: "normal",
        playerFaction: "abbeyAlliance",
      };
    }
  }

  public saveLaunchPreferences(preferences: LaunchPreferences): void {
    window.localStorage.setItem(LAUNCH_PREFS_KEY, JSON.stringify(preferences));
  }

  public loadSettings(): GameSettings {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) {
      return {
        showGrid: false,
        reducedMotion: false,
      };
    }
    try {
      const parsed = JSON.parse(raw) as Partial<GameSettings>;
      return {
        showGrid: parsed.showGrid ?? false,
        reducedMotion: parsed.reducedMotion ?? false,
      };
    } catch {
      return {
        showGrid: false,
        reducedMotion: false,
      };
    }
  }

  public saveSettings(settings: GameSettings): void {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }
}
