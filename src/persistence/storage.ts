import { openDB } from "idb";
import { validateSnapshot } from "../core/save";
import type { Difficulty, SaveGameSnapshot } from "../core/types";

const DB_NAME = "redwall-rts";
const DB_VERSION = 1;
const SAVE_STORE = "saveSnapshots";
const SAVE_KEY = "latest";
const RESUME_META_KEY = "redwall-rts.resume";
const SETTINGS_KEY = "redwall-rts.settings";

export interface ResumeMetadata {
  timestamp: number;
  difficulty: Difficulty;
  seed: number;
  elapsedMs: number;
}

export interface GameSettings {
  showGrid: boolean;
  reducedMotion: boolean;
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
