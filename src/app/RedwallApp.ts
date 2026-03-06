import { stringToSeed } from "../core/random";
import { createSnapshot } from "../core/save";
import type { BuildingType, Difficulty, GameCommand, GameConfig, Outcome, TilePoint, WorldState } from "../core/types";
import { BrowserStorage, type GameSettings, type ResumeMetadata } from "../persistence/storage";
import type { GameSession } from "./GameSession";
import type { RedwallScene } from "../render/RedwallScene";
import type { Hud } from "../ui/Hud";

type AppMode = "menu" | "skirmish";

type DebugApi = {
  getMode: () => AppMode;
  startSkirmish: () => Promise<void>;
  continueLastMatch: () => Promise<boolean>;
  getSnapshot: () => WorldState | undefined;
  advanceTicks: (count: number) => void;
  getSelectedIds: () => string[];
  setSelection: (ids: string[]) => void;
  issueCommand: (command: GameCommand) => boolean;
  setBuildMode: (buildingType?: BuildingType) => void;
  saveNow: () => Promise<boolean>;
  clearSave: () => Promise<void>;
  hasResume: () => boolean;
  getSettings: () => GameSettings;
  forceOutcome: (outcome: Outcome) => void;
  getScreenPointForEntity: (id: string) => TilePoint | undefined;
  getScreenPointForTile: (tile: TilePoint) => TilePoint | undefined;
  getCameraState: () => { scrollX: number; scrollY: number; zoom: number } | undefined;
};

declare global {
  interface Window {
    __REDWALL_DEBUG__?: DebugApi;
  }
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
  private resumeMeta?: ResumeMetadata;
  private autosaveTimer = 0;

  public constructor(root: HTMLDivElement, search: string) {
    this.root = root;
    this.params = new URLSearchParams(search);
    this.settings = this.storage.loadSettings();
    window.__REDWALL_DEBUG__ = {
      getMode: () => this.mode,
      startSkirmish: async () => {
        await this.startSkirmish();
      },
      continueLastMatch: async () => this.continueLastMatch(),
      getSnapshot: () => this.session?.getSnapshot(),
      advanceTicks: (count: number) => {
        this.session?.advanceTicks(count);
      },
      getSelectedIds: () => this.session?.getSessionState().selectedIds ?? [],
      setSelection: (ids: string[]) => {
        this.session?.setSelection(ids);
      },
      issueCommand: (command: GameCommand) => this.session?.issueCommand(command) ?? false,
      setBuildMode: (buildingType?: BuildingType) => {
        this.session?.setBuildMode(buildingType);
      },
      saveNow: async () => this.saveCurrentSession(),
      clearSave: async () => {
        await this.storage.clearSnapshot();
        this.resumeMeta = undefined;
        this.renderMenu();
      },
      hasResume: () => Boolean(this.resumeMeta),
      getSettings: () => ({ ...this.settings }),
      forceOutcome: (outcome: Outcome) => {
        this.session?.forceOutcome(outcome);
      },
      getScreenPointForEntity: (id: string) => this.scene?.getScreenPointForEntity(id),
      getScreenPointForTile: (tile: TilePoint) => this.scene?.getScreenPointForTile(tile),
      getCameraState: () => this.scene?.getCameraState(),
    };
  }

  public start(): void {
    this.resumeMeta = this.storage.getResumeMetadata();
    this.settings = this.storage.loadSettings();
    this.renderMenu();
  }

  private renderMenu(): void {
    this.root.innerHTML = `
      <div class="shell">
        <div class="frame">
          <header class="hero">
            <p class="eyebrow">Mossflower Frontiers</p>
            <h1>Redwall RTS</h1>
            <p class="lede">
              Static-hosted woodland warfare with deterministic skirmishes, local persistence, and Abbey alliance command.
            </p>
          </header>
          <main class="layout">
            <section class="menu-card" data-testid="main-menu">
              <h2>Skirmish</h2>
              <p class="small-copy">Abbey alliance versus vermin raiders on Mossflower Meadows.</p>
              <button class="primary-button" data-testid="start-skirmish">Start Mossflower Skirmish</button>
              <button class="secondary-button" data-testid="continue-skirmish" ${this.resumeMeta ? "" : "disabled"}>Continue Last Match</button>
              <dl class="info-grid">
                <div><dt>Faction</dt><dd>Abbey alliance</dd></div>
                <div><dt>Mode</dt><dd>1v1 skirmish</dd></div>
                <div><dt>Seed</dt><dd data-testid="seed-value">${this.params.get("seed") ?? "mossflower"}</dd></div>
              </dl>
              <p class="small-copy" data-testid="resume-status">${
                this.resumeMeta
                  ? `Resume available from ${new Date(this.resumeMeta.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                  : "No local skirmish snapshot yet."
              }</p>
            </section>
            <section class="status-card">
              <div class="status-row"><span>Mode</span><strong data-testid="app-mode">${this.mode}</strong></div>
              <div class="status-row"><span>E2E</span><strong data-testid="e2e-mode">${this.params.get("e2e") === "1" ? "enabled" : "disabled"}</strong></div>
              <div class="status-row"><span>Build</span><strong>Vertical Slice</strong></div>
              <div class="status-row"><span>Controls</span><strong>Context + command modes</strong></div>
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
    this.root.querySelector<HTMLButtonElement>("[data-testid='start-skirmish']")?.addEventListener("click", () => {
      void this.startSkirmish();
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

  private async startSkirmish(existingWorld?: WorldState, resumeMeta?: ResumeMetadata): Promise<void> {
    this.destroyGame();
    this.mode = "skirmish";
    this.root.innerHTML = `
      <div class="game-shell">
        <div class="battlefield-frame">
          <div class="canvas-host" data-testid="game-shell"></div>
          <div class="hud-host"></div>
        </div>
      </div>
    `;
    const canvasHost = this.root.querySelector<HTMLDivElement>("[data-testid='game-shell']");
    const hudHost = this.root.querySelector<HTMLDivElement>(".hud-host");
    if (!canvasHost || !hudHost) {
      throw new Error("Game shell failed to mount");
    }

    const config = this.buildConfig(resumeMeta);
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
    const resumeMeta = {
      timestamp: snapshot.timestamp,
      difficulty: snapshot.difficulty,
      seed: snapshot.seed,
      elapsedMs: snapshot.elapsedMs,
    };
    this.resumeMeta = resumeMeta;
    await this.startSkirmish(snapshot.world, resumeMeta);
    return true;
  }

  private buildConfig(resumeMeta?: ResumeMetadata): GameConfig {
    const seedParam = resumeMeta?.seed?.toString() ?? this.params.get("seed") ?? "mossflower";
    const difficulty = resumeMeta?.difficulty ?? (this.params.get("difficulty") as Difficulty | null) ?? "normal";
    return {
      seed: /^\d+$/.test(seedParam) ? Number(seedParam) : stringToSeed(seedParam),
      mapPreset: "mossflowerMeadows",
      difficulty,
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

  private async handleAutosave(): Promise<void> {
    if (!this.session) {
      return;
    }
    const outcome = this.session.getWorld().outcome;
    if (outcome !== "ongoing") {
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
    const saved = this.session?.getWorld().outcome === "ongoing"
      ? await this.saveCurrentSession()
      : false;
    if (!saved && this.session?.getWorld().outcome !== "ongoing") {
      await this.storage.clearSnapshot();
    }
    this.destroyGame();
    this.mode = "menu";
    this.resumeMeta = this.storage.getResumeMetadata();
    this.renderMenu();
    return saved;
  }

  private async returnToMenu(): Promise<void> {
    if (this.session?.getWorld().outcome !== "ongoing") {
      await this.storage.clearSnapshot();
    }
    this.destroyGame();
    this.mode = "menu";
    this.resumeMeta = this.storage.getResumeMetadata();
    this.renderMenu();
  }
}
