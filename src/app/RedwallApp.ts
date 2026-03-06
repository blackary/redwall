import Phaser from "phaser";
import { GameSession } from "./GameSession";
import { RedwallScene } from "../render/RedwallScene";
import { Hud } from "../ui/Hud";
import { stringToSeed } from "../core/random";
import type { BuildingType, Difficulty, GameCommand, GameConfig, TilePoint, WorldState } from "../core/types";

type AppMode = "menu" | "skirmish";

type DebugApi = {
  getMode: () => AppMode;
  startSkirmish: () => Promise<void>;
  getSnapshot: () => WorldState | undefined;
  advanceTicks: (count: number) => void;
  getSelectedIds: () => string[];
  setSelection: (ids: string[]) => void;
  issueCommand: (command: GameCommand) => boolean;
  setBuildMode: (buildingType?: BuildingType) => void;
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
  private phaserGame?: Phaser.Game;
  private scene?: RedwallScene;
  private session?: GameSession;

  public constructor(root: HTMLDivElement, search: string) {
    this.root = root;
    this.params = new URLSearchParams(search);
    window.__REDWALL_DEBUG__ = {
      getMode: () => this.mode,
      startSkirmish: async () => {
        await this.startSkirmish();
      },
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
      getScreenPointForEntity: (id: string) => this.scene?.getScreenPointForEntity(id),
      getScreenPointForTile: (tile: TilePoint) => this.scene?.getScreenPointForTile(tile),
      getCameraState: () => this.scene?.getCameraState(),
    };
  }

  public start(): void {
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
              <dl class="info-grid">
                <div><dt>Faction</dt><dd>Abbey alliance</dd></div>
                <div><dt>Mode</dt><dd>1v1 skirmish</dd></div>
                <div><dt>Seed</dt><dd data-testid="seed-value">${this.params.get("seed") ?? "mossflower"}</dd></div>
              </dl>
            </section>
            <section class="status-card">
              <div class="status-row"><span>Mode</span><strong data-testid="app-mode">${this.mode}</strong></div>
              <div class="status-row"><span>E2E</span><strong data-testid="e2e-mode">${this.params.get("e2e") === "1" ? "enabled" : "disabled"}</strong></div>
              <div class="status-row"><span>Build</span><strong>Stage 2</strong></div>
              <div class="status-row"><span>Controls</span><strong>WASD + click</strong></div>
            </section>
          </main>
        </div>
      </div>
    `;
    this.root.querySelector<HTMLButtonElement>("[data-testid='start-skirmish']")?.addEventListener("click", () => {
      void this.startSkirmish();
    });
  }

  private async startSkirmish(): Promise<void> {
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

    const config = this.buildConfig();
    this.session = new GameSession(config);
    this.scene = new RedwallScene(this.session);
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
    new Hud(this.session, hudHost);
    this.session.start();
  }

  private buildConfig(): GameConfig {
    const seedParam = this.params.get("seed") ?? "mossflower";
    const difficulty = (this.params.get("difficulty") as Difficulty | null) ?? "normal";
    return {
      seed: /^\d+$/.test(seedParam) ? Number(seedParam) : stringToSeed(seedParam),
      mapPreset: "mossflowerMeadows",
      difficulty,
      e2e: this.params.get("e2e") === "1",
    };
  }

  private destroyGame(): void {
    this.session?.destroy();
    this.session = undefined;
    if (this.phaserGame) {
      this.phaserGame.destroy(true);
      this.phaserGame = undefined;
    }
    this.scene = undefined;
  }
}
