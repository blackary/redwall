import { getFactionDefinition, getPlayableFactions } from "../core/factions";
import { getMapDefinition, getPlayableMaps } from "../core/map";
import { awardSkirmishResult, awardTutorialCompletion, getNextUnlockHint, getUnlockedSummary, isFactionUnlocked, isMapUnlocked, normalizeProfile, type PlayerProfile } from "../core/progression";
import { stringToSeed } from "../core/random";
import { createSnapshot } from "../core/save";
import { getTutorialState } from "../core/tutorial";
import type {
  BuildingType,
  Difficulty,
  FactionId,
  GameCommand,
  GameConfig,
  MapPreset,
  Outcome,
  ScenarioId,
  TilePoint,
  WorldState,
} from "../core/types";
import type { UnitType } from "../core/types";
import { BrowserStorage, type GameSettings, type LaunchPreferences, type ResumeMetadata } from "../persistence/storage";
import type { UnitAnimationState } from "../render/animation";
import type { GameSession } from "./GameSession";
import type { RedwallScene } from "../render/RedwallScene";
import type { Hud } from "../ui/Hud";

type AppMode = "menu" | "skirmish";

type DebugApi = {
  getMode: () => AppMode;
  startSkirmish: () => Promise<void>;
  startTutorial: () => Promise<void>;
  continueLastMatch: () => Promise<boolean>;
  getSnapshot: () => WorldState | undefined;
  getProfile: () => PlayerProfile;
  advanceTicks: (count: number) => void;
  getSelectedIds: () => string[];
  setSelection: (ids: string[]) => void;
  selectAllUnitsOfType: (unitType: UnitType) => void;
  issueCommand: (command: GameCommand) => boolean;
  setBuildMode: (buildingType?: BuildingType) => void;
  focusCamera: (tile: TilePoint) => void;
  saveNow: () => Promise<boolean>;
  clearSave: () => Promise<void>;
  hasResume: () => boolean;
  getSettings: () => GameSettings;
  setPaused: (paused: boolean) => void;
  forceOutcome: (outcome: Outcome) => void;
  teleportUnits: (unitIds: string[], destination: TilePoint) => void;
  getScreenPointForEntity: (id: string) => TilePoint | undefined;
  getScreenPointForTile: (tile: TilePoint) => TilePoint | undefined;
  selectInScreenRect: (from: TilePoint, to: TilePoint) => void;
  getAnimationState: (id: string) => UnitAnimationState | undefined;
  getTargetIndicators: () => Array<{ id: string; tone: "attack" | "gather"; source: "issued" | "selected" }>;
  getHoverPreview: () => {
    kind: string;
    label: string;
    detail?: string;
    tile: TilePoint;
    entityId?: string;
    blockedReasons?: string[];
  } | undefined;
  getCameraState: () => { scrollX: number; scrollY: number; zoom: number } | undefined;
};

declare global {
  interface Window {
    __REDWALL_DEBUG__?: DebugApi;
  }
}

function sanitizeLaunchPreferences(profile: PlayerProfile, preferences: LaunchPreferences): LaunchPreferences {
  const fallbackMap = profile.unlockedMaps[0] ?? "mossflowerMeadows";
  const fallbackFaction = profile.unlockedFactions[0] ?? "abbeyAlliance";
  return {
    mapPreset: isMapUnlocked(profile, preferences.mapPreset) ? preferences.mapPreset : fallbackMap,
    difficulty: preferences.difficulty,
    playerFaction: isFactionUnlocked(profile, preferences.playerFaction) ? preferences.playerFaction : fallbackFaction,
  };
}

export class RedwallApp {
  private readonly root: HTMLDivElement;
  private readonly params: URLSearchParams;
  private mode: AppMode = "menu";
  private phaserGame?: { destroy: (removeCanvas: boolean, noReturn?: boolean) => void };
  private scene?: RedwallScene;
  private session?: GameSession;
  private hud?: Hud;
  private readonly storage = new BrowserStorage();
  private settings: GameSettings;
  private profile: PlayerProfile;
  private launchPreferences: LaunchPreferences;
  private resumeMeta?: ResumeMetadata;
  private autosaveTimer = 0;
  private matchRewardApplied = false;
  private profileNotice?: string;

  public constructor(root: HTMLDivElement, search: string) {
    this.root = root;
    this.params = new URLSearchParams(search);
    this.settings = this.storage.loadSettings();
    this.profile = normalizeProfile(this.storage.loadProfile());
    this.launchPreferences = sanitizeLaunchPreferences(this.profile, this.storage.loadLaunchPreferences());
    window.__REDWALL_DEBUG__ = {
      getMode: () => this.mode,
      startSkirmish: async () => {
        await this.startSkirmish();
      },
      startTutorial: async () => {
        await this.startTutorial();
      },
      continueLastMatch: async () => this.continueLastMatch(),
      getSnapshot: () => this.session?.getSnapshot(),
      getProfile: () => ({ ...this.profile }),
      advanceTicks: (count: number) => {
        this.session?.advanceTicks(count);
      },
      getSelectedIds: () => this.session?.getSessionState().selectedIds ?? [],
      setSelection: (ids: string[]) => {
        this.session?.setSelection(ids);
      },
      selectAllUnitsOfType: (unitType: UnitType) => {
        this.session?.selectAllUnitsOfType(unitType);
      },
      issueCommand: (command: GameCommand) => this.session?.issueCommand(command) ?? false,
      setBuildMode: (buildingType?: BuildingType) => {
        this.session?.setBuildMode(buildingType);
      },
      focusCamera: (tile: TilePoint) => {
        this.scene?.focusCamera(tile);
      },
      saveNow: async () => this.saveCurrentSession(),
      clearSave: async () => {
        await this.storage.clearSnapshot();
        this.resumeMeta = undefined;
        this.renderMenu();
      },
      hasResume: () => Boolean(this.resumeMeta),
      getSettings: () => ({ ...this.settings }),
      setPaused: (paused: boolean) => {
        this.session?.setPaused(paused);
      },
      forceOutcome: (outcome: Outcome) => {
        this.session?.forceOutcome(outcome);
      },
      teleportUnits: (unitIds: string[], destination: TilePoint) => {
        this.session?.teleportUnits(unitIds, destination);
      },
      getScreenPointForEntity: (id: string) => this.scene?.getScreenPointForEntity(id),
      getScreenPointForTile: (tile: TilePoint) => this.scene?.getScreenPointForTile(tile),
      selectInScreenRect: (from: TilePoint, to: TilePoint) => {
        this.scene?.selectInScreenRect(from, to);
      },
      getAnimationState: (id: string) => this.scene?.getAnimationState(id),
      getTargetIndicators: () => this.scene?.getTargetIndicators() ?? [],
      getHoverPreview: () => this.scene?.getHoverPreview(),
      getCameraState: () => this.scene?.getCameraState(),
    };
  }

  public start(): void {
    this.resumeMeta = this.storage.getResumeMetadata();
    this.settings = this.storage.loadSettings();
    this.profile = normalizeProfile(this.storage.loadProfile());
    this.launchPreferences = sanitizeLaunchPreferences(this.profile, this.storage.loadLaunchPreferences());
    this.renderMenu();
  }

  private setDocumentMode(mode: AppMode): void {
    document.body.dataset.appMode = mode;
  }

  private renderMenu(): void {
    this.setDocumentMode("menu");
    const unlockedSummary = getUnlockedSummary(this.profile);
    const nextUnlockHint = getNextUnlockHint(this.profile);
    const playableMaps = getPlayableMaps();
    const playableFactions = getPlayableFactions();
    const seedValue = this.params.get("seed") ?? "mossflower";
    const selectedFaction = getFactionDefinition(this.launchPreferences.playerFaction);
    const selectedMap = getMapDefinition(this.launchPreferences.mapPreset);
    const resumeMapLabel = this.resumeMeta?.mapPreset ? getMapDefinition(this.resumeMeta.mapPreset).label : undefined;

    this.root.innerHTML = `
      <div class="shell">
        <div class="frame">
          <header class="hero">
            <p class="eyebrow">Mossflower Frontiers</p>
            <h1>Redwall RTS</h1>
            <p class="lede">
              Static-hosted woodland warfare with persistent chronicle progression, multiple frontier maps, faction bonuses, and a guided tutorial path.
            </p>
          </header>
          <main class="layout">
            <section class="menu-card" data-testid="main-menu">
              <h2>Skirmish Table</h2>
              <p class="small-copy">Choose your front, faction, and difficulty. Complete the tutorial and win skirmishes to unlock the full chronicle.</p>
              <div class="settings-group">
                <label class="setting-row" for="map-select">
                  <span>
                    <strong>Map</strong>
                    <small>Different layouts change resource spread, travel routes, and choke points.</small>
                  </span>
                  <select id="map-select" data-testid="map-select">
                    ${playableMaps.map((map) => {
                      const unlocked = isMapUnlocked(this.profile, map.id);
                      return `<option value="${map.id}" ${this.launchPreferences.mapPreset === map.id ? "selected" : ""} ${unlocked ? "" : "disabled"}>${map.label}${unlocked ? "" : " (Locked)"}</option>`;
                    }).join("")}
                  </select>
                </label>
                <label class="setting-row" for="faction-select">
                  <span>
                    <strong>Faction</strong>
                    <small>Playable factions now carry different bonuses and progression unlocks.</small>
                  </span>
                  <select id="faction-select" data-testid="faction-select">
                    ${playableFactions.map((faction) => {
                      const unlocked = isFactionUnlocked(this.profile, faction.id);
                      return `<option value="${faction.id}" ${this.launchPreferences.playerFaction === faction.id ? "selected" : ""} ${unlocked ? "" : "disabled"}>${faction.label}${unlocked ? "" : " (Locked)"}</option>`;
                    }).join("")}
                  </select>
                </label>
                <label class="setting-row" for="difficulty-select">
                  <span>
                    <strong>Difficulty</strong>
                    <small>Controls AI pressure cadence and recovery speed.</small>
                  </span>
                  <select id="difficulty-select" data-testid="difficulty-select">
                    ${(["easy", "normal", "hard"] as Difficulty[]).map((difficulty) => `
                      <option value="${difficulty}" ${this.launchPreferences.difficulty === difficulty ? "selected" : ""}>${difficulty[0].toUpperCase()}${difficulty.slice(1)}</option>
                    `).join("")}
                  </select>
                </label>
              </div>
              <button class="primary-button" data-testid="start-skirmish">Start Skirmish</button>
              <button class="secondary-button" data-testid="start-tutorial">Start Guided Tutorial</button>
              <button class="secondary-button" data-testid="continue-skirmish" ${this.resumeMeta ? "" : "disabled"}>Continue Last Match</button>
              <dl class="info-grid">
                <div><dt>Faction</dt><dd data-testid="selected-faction">${selectedFaction.label}</dd></div>
                <div><dt>Map</dt><dd data-testid="selected-map">${selectedMap.label}</dd></div>
                <div><dt>Bonus</dt><dd data-testid="selected-bonus">${selectedFaction.shortBonus}</dd></div>
                <div><dt>Doctrine</dt><dd data-testid="selected-doctrine">${selectedFaction.doctrine}</dd></div>
                <div><dt>Seed</dt><dd data-testid="seed-value">${seedValue}</dd></div>
              </dl>
              <p class="small-copy" data-testid="selected-map-summary">${selectedMap.description}</p>
              <p class="small-copy" data-testid="selected-map-strategic-note">${selectedMap.strategicNote}</p>
              <p class="small-copy" data-testid="resume-status">${
                this.resumeMeta
                  ? `Resume available from ${new Date(this.resumeMeta.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} on ${resumeMapLabel ?? "saved battlefield"}.`
                  : "No local skirmish snapshot yet."
              }</p>
              ${this.profileNotice ? `<p class="small-copy" data-testid="profile-notice">${this.profileNotice}</p>` : ""}
            </section>
            <section class="status-card">
              <div class="status-row"><span>Mode</span><strong data-testid="app-mode">${this.mode}</strong></div>
              <div class="status-row"><span>E2E</span><strong data-testid="e2e-mode">${this.params.get("e2e") === "1" ? "enabled" : "disabled"}</strong></div>
              <div class="status-row"><span>Chronicle</span><strong data-testid="profile-level">Level ${this.profile.level}</strong></div>
              <div class="status-row"><span>Experience</span><strong data-testid="profile-xp">${this.profile.xp} XP</strong></div>
              <div class="status-row"><span>Unlocks</span><strong data-testid="profile-unlocks">${unlockedSummary}</strong></div>
              <div class="status-row"><span>Tutorial</span><strong data-testid="tutorial-status">${this.profile.completedTutorial ? "completed" : "pending"}</strong></div>
              <p class="small-copy" data-testid="next-unlock-hint">${nextUnlockHint}</p>
              <div class="settings-group" data-testid="settings-panel">
                <label class="setting-row" for="show-grid-toggle">
                  <span>
                    <strong>Show Grid</strong>
                    <small>Sharper battlefield tile outlines for precise placement.</small>
                  </span>
                  <input
                    id="show-grid-toggle"
                    data-testid="show-grid-toggle"
                    type="checkbox"
                    ${this.settings.showGrid ? "checked" : ""}
                  />
                </label>
                <label class="setting-row" for="reduced-motion-toggle">
                  <span>
                    <strong>Reduce Motion</strong>
                    <small>Softens battlefield ping animation and camera feedback.</small>
                  </span>
                  <input
                    id="reduced-motion-toggle"
                    data-testid="reduced-motion-toggle"
                    type="checkbox"
                    ${this.settings.reducedMotion ? "checked" : ""}
                  />
                </label>
              </div>
              <div class="control-copy">
                <p class="small-copy">Mac-friendly commands: use right click, <code>Ctrl</code>+click, or <code>Alt</code>+left-click.</p>
                <p class="small-copy">If contextual commands feel off, arm <code>Move</code>, <code>Gather</code>, <code>Attack</code>, or <code>Rally</code> from the HUD and place them with left click.</p>
              </div>
            </section>
          </main>
        </div>
      </div>
    `;

    this.root.querySelector<HTMLSelectElement>("[data-testid='map-select']")?.addEventListener("change", (event) => {
      const input = event.currentTarget as HTMLSelectElement;
      this.updateLaunchPreferences({ mapPreset: input.value as MapPreset });
    });
    this.root.querySelector<HTMLSelectElement>("[data-testid='faction-select']")?.addEventListener("change", (event) => {
      const input = event.currentTarget as HTMLSelectElement;
      this.updateLaunchPreferences({ playerFaction: input.value as FactionId });
    });
    this.root.querySelector<HTMLSelectElement>("[data-testid='difficulty-select']")?.addEventListener("change", (event) => {
      const input = event.currentTarget as HTMLSelectElement;
      this.updateLaunchPreferences({ difficulty: input.value as Difficulty });
    });
    this.root.querySelector<HTMLButtonElement>("[data-testid='start-skirmish']")?.addEventListener("click", () => {
      void this.startSkirmish();
    });
    this.root.querySelector<HTMLButtonElement>("[data-testid='start-tutorial']")?.addEventListener("click", () => {
      void this.startTutorial();
    });
    this.root.querySelector<HTMLButtonElement>("[data-testid='continue-skirmish']")?.addEventListener("click", () => {
      void this.continueLastMatch();
    });
    this.root.querySelector<HTMLInputElement>("[data-testid='show-grid-toggle']")?.addEventListener("change", (event) => {
      const input = event.currentTarget as HTMLInputElement;
      this.updateSettings({
        ...this.settings,
        showGrid: input.checked,
      });
    });
    this.root.querySelector<HTMLInputElement>("[data-testid='reduced-motion-toggle']")?.addEventListener("change", (event) => {
      const input = event.currentTarget as HTMLInputElement;
      this.updateSettings({
        ...this.settings,
        reducedMotion: input.checked,
      });
    });
  }

  private updateLaunchPreferences(patch: Partial<LaunchPreferences>): void {
    this.launchPreferences = sanitizeLaunchPreferences(this.profile, {
      ...this.launchPreferences,
      ...patch,
    });
    this.storage.saveLaunchPreferences(this.launchPreferences);
    this.renderMenu();
  }

  private async startTutorial(): Promise<void> {
    await this.startMatch("tutorial");
  }

  private async startSkirmish(existingWorld?: WorldState, resumeMeta?: ResumeMetadata): Promise<void> {
    await this.startMatch("skirmish", existingWorld, resumeMeta);
  }

  private async startMatch(scenario: ScenarioId, existingWorld?: WorldState, resumeMeta?: ResumeMetadata): Promise<void> {
    this.destroyGame();
    this.mode = "skirmish";
    this.setDocumentMode("skirmish");
    this.matchRewardApplied = false;
    this.root.innerHTML = `
      <div class="game-shell">
        <div class="battlefield-frame">
          <div class="canvas-shell">
            <div class="canvas-host" data-testid="game-shell"></div>
            <div class="hud-host"></div>
          </div>
        </div>
      </div>
    `;
    const canvasHost = this.root.querySelector<HTMLDivElement>("[data-testid='game-shell']");
    const hudHost = this.root.querySelector<HTMLDivElement>(".hud-host");
    if (!canvasHost || !hudHost) {
      throw new Error("Game shell failed to mount");
    }

    const config = this.buildConfig(scenario, resumeMeta);
    const [{ default: Phaser }, sessionModule, sceneModule, hudModule] = await Promise.all([
      import("phaser"),
      import("./GameSession"),
      import("../render/RedwallScene"),
      import("../ui/Hud"),
    ]);
    const { GameSession } = sessionModule;
    const { RedwallScene } = sceneModule;
    const { Hud } = hudModule;

    this.session = new GameSession(config, existingWorld);
    this.scene = new RedwallScene(this.session, this.settings);
    this.phaserGame = new Phaser.Game({
      type: Phaser.AUTO,
      width: 1280,
      height: 820,
      backgroundColor: "#0f1715",
      parent: canvasHost,
      scene: this.scene,
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
    });
    this.hud = new Hud(this.session, hudHost, {
      settings: this.settings,
      onSaveAndExit: async () => this.saveAndExitToMenu(),
      onSettingsChange: (settings) => this.updateSettings(settings),
      onReturnToMenu: async () => this.returnToMenu(),
      onStartNewMatch: async () => this.startSkirmish(),
      onNavigateMinimap: (tile) => this.scene?.focusCamera(tile),
      getVisibleTileBounds: () => this.scene?.getVisibleTileBounds(),
    });
    this.autosaveTimer = this.session.getElapsedMs();
    this.session.subscribe(() => {
      void this.handleAutosave();
    });
    this.session.start();
  }

  private async continueLastMatch(): Promise<boolean> {
    const snapshot = await this.storage.loadSnapshot();
    if (!snapshot) {
      this.resumeMeta = undefined;
      this.renderMenu();
      return false;
    }
    const resumeMeta: ResumeMetadata = {
      timestamp: snapshot.timestamp,
      difficulty: snapshot.difficulty,
      seed: snapshot.seed,
      mapPreset: snapshot.mapPreset,
      playerFaction: snapshot.playerFaction,
      aiFaction: snapshot.aiFaction,
      scenario: snapshot.scenario,
      elapsedMs: snapshot.elapsedMs,
    };
    this.resumeMeta = resumeMeta;
    this.launchPreferences = sanitizeLaunchPreferences(this.profile, {
      mapPreset: resumeMeta.mapPreset,
      difficulty: resumeMeta.difficulty,
      playerFaction: resumeMeta.playerFaction,
    });
    await this.startMatch(resumeMeta.scenario, snapshot.world, resumeMeta);
    return true;
  }

  private buildConfig(scenario: ScenarioId, resumeMeta?: ResumeMetadata): GameConfig {
    const seedParam = resumeMeta?.seed?.toString() ?? this.params.get("seed") ?? "mossflower";
    const mapPreset = resumeMeta?.mapPreset
      ?? (this.params.get("map") as MapPreset | null)
      ?? (scenario === "tutorial" ? "mossflowerMeadows" : this.launchPreferences.mapPreset);
    const difficulty = resumeMeta?.difficulty
      ?? (this.params.get("difficulty") as Difficulty | null)
      ?? (scenario === "tutorial" ? "easy" : this.launchPreferences.difficulty);
    const playerFaction = resumeMeta?.playerFaction
      ?? (this.params.get("faction") as FactionId | null)
      ?? (scenario === "tutorial" ? "abbeyAlliance" : this.launchPreferences.playerFaction);
    const aiFaction = resumeMeta?.aiFaction ?? "verminRaiders";
    return {
      seed: /^\d+$/.test(seedParam) ? Number(seedParam) : stringToSeed(seedParam),
      mapPreset,
      difficulty,
      playerFaction,
      aiFaction,
      scenario: resumeMeta?.scenario ?? scenario,
      e2e: this.params.get("e2e") === "1",
    };
  }

  private destroyGame(): void {
    this.hud?.destroy();
    this.hud = undefined;
    this.session?.destroy();
    this.session = undefined;
    if (this.phaserGame) {
      this.phaserGame.destroy(true);
      this.phaserGame = undefined;
    }
    this.scene = undefined;
  }

  private isTutorialComplete(): boolean {
    if (!this.session) {
      return false;
    }
    return Boolean(getTutorialState(this.session.getWorld(), this.session.getSelectedEntities())?.completed);
  }

  private awardSessionProgress(): void {
    if (!this.session || this.matchRewardApplied) {
      return;
    }
    const world = this.session.getWorld();
    if (world.scenario === "tutorial") {
      if (!this.isTutorialComplete()) {
        return;
      }
      const beforeXp = this.profile.xp;
      this.profile = awardTutorialCompletion(this.profile);
      this.profileNotice = `Tutorial complete. Chronicle +${this.profile.xp - beforeXp} XP.`;
    } else if (world.outcome !== "ongoing") {
      const beforeXp = this.profile.xp;
      this.profile = awardSkirmishResult(this.profile, world.outcome === "playerVictory");
      this.profileNotice = world.outcome === "playerVictory"
        ? `Victory recorded. Chronicle +${this.profile.xp - beforeXp} XP.`
        : `Defeat logged. Chronicle +${this.profile.xp - beforeXp} XP.`;
    } else {
      return;
    }
    this.storage.saveProfile(this.profile);
    this.launchPreferences = sanitizeLaunchPreferences(this.profile, this.launchPreferences);
    this.storage.saveLaunchPreferences(this.launchPreferences);
    this.matchRewardApplied = true;
  }

  private async handleAutosave(): Promise<void> {
    if (!this.session) {
      return;
    }
    const outcome = this.session.getWorld().outcome;
    if (outcome !== "ongoing" || this.isTutorialComplete()) {
      await this.storage.clearSnapshot();
      this.resumeMeta = undefined;
      return;
    }
    if (!this.session.hasUnsavedChanges()) {
      return;
    }
    if (this.session.getElapsedMs() - this.autosaveTimer >= 15_000) {
      await this.saveCurrentSession();
    }
  }

  private async saveCurrentSession(): Promise<boolean> {
    if (!this.session) {
      return false;
    }
    if (this.session.getWorld().scenario === "tutorial" && this.isTutorialComplete()) {
      return false;
    }
    const snapshot = createSnapshot(this.session.getSnapshot(), this.session.getDifficulty());
    await this.storage.saveSnapshot(snapshot);
    this.session.markSaved();
    this.autosaveTimer = snapshot.elapsedMs;
    this.resumeMeta = this.storage.getResumeMetadata();
    return true;
  }

  private updateSettings(settings: GameSettings): void {
    this.settings = settings;
    this.storage.saveSettings(settings);
    this.scene?.applySettings(settings);
    this.hud?.updateSettings(settings);
    if (this.mode === "menu") {
      this.renderMenu();
    }
  }

  private async saveAndExitToMenu(): Promise<boolean> {
    const tutorialComplete = this.isTutorialComplete();
    const saved = this.session?.getWorld().outcome === "ongoing" && !tutorialComplete
      ? await this.saveCurrentSession()
      : false;
    if (!saved) {
      this.awardSessionProgress();
      await this.storage.clearSnapshot();
    }
    this.destroyGame();
    this.mode = "menu";
    this.resumeMeta = this.storage.getResumeMetadata();
    this.renderMenu();
    return saved;
  }

  private async returnToMenu(): Promise<void> {
    this.awardSessionProgress();
    if (this.session?.getWorld().outcome !== "ongoing" || this.isTutorialComplete()) {
      await this.storage.clearSnapshot();
    }
    this.destroyGame();
    this.mode = "menu";
    this.resumeMeta = this.storage.getResumeMetadata();
    this.renderMenu();
  }
}
