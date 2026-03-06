import Phaser from "phaser";

type AppMode = "menu" | "loading" | "skirmish";

type DebugApi = {
  getMode: () => AppMode;
  startSkirmish: () => void;
};

class BootstrapScene extends Phaser.Scene {
  private readonly queryText: string;

  public constructor(queryText: string) {
    super("bootstrap");
    this.queryText = queryText;
  }

  public create(): void {
    this.cameras.main.setBackgroundColor("#172421");
    this.add
      .text(20, 20, "Redwall RTS bootstrap", {
        fontFamily: "Georgia, serif",
        fontSize: "28px",
        color: "#f7ecd6",
      })
      .setDepth(10);
    this.add
      .text(20, 60, `Query: ${this.queryText || "(none)"}`, {
        fontFamily: "monospace",
        fontSize: "16px",
        color: "#d8c9a4",
      })
      .setDepth(10);
    this.add.rectangle(260, 220, 260, 160, 0x40634b, 1).setStrokeStyle(4, 0xe6d6ae);
    this.add.circle(200, 220, 20, 0xd58b47);
    this.add.circle(250, 245, 18, 0xb8d4b2);
    this.add.circle(300, 210, 18, 0xb84c4c);
  }
}

declare global {
  interface Window {
    __REDWALL_DEBUG__?: DebugApi;
  }
}

export class RedwallApp {
  private readonly root: HTMLDivElement;
  private readonly search: string;
  private readonly params: URLSearchParams;
  private mode: AppMode = "menu";
  private phaserGame?: Phaser.Game;

  public constructor(root: HTMLDivElement, search: string) {
    this.root = root;
    this.search = search;
    this.params = new URLSearchParams(search);
    window.__REDWALL_DEBUG__ = {
      getMode: () => this.mode,
      startSkirmish: () => this.startSkirmish(),
    };
  }

  public start(): void {
    this.render();
  }

  private render(): void {
    this.root.innerHTML = "";
    const shell = document.createElement("div");
    shell.className = "shell";
    shell.innerHTML = `
      <div class="frame">
        <header class="hero">
          <p class="eyebrow">Mossflower Frontiers</p>
          <h1>Redwall RTS</h1>
          <p class="lede">
            Build the Abbey alliance, advance through the ages, and hold the woodland against vermin raiders.
          </p>
        </header>
        <main class="layout">
          <section class="menu-card" data-testid="main-menu">
            <h2>Skirmish</h2>
            <p class="small-copy">Static-hosted, deterministic, browser-only RTS prototype.</p>
            <button class="primary-button" data-testid="start-skirmish">Start Mossflower Skirmish</button>
            <dl class="info-grid">
              <div><dt>Faction</dt><dd>Abbey alliance</dd></div>
              <div><dt>Mode</dt><dd>1v1 skirmish</dd></div>
              <div><dt>Seed</dt><dd data-testid="seed-value">${this.params.get("seed") ?? "auto"}</dd></div>
            </dl>
          </section>
          <section class="status-card">
            <div class="status-row">
              <span>Mode</span>
              <strong data-testid="app-mode">${this.mode}</strong>
            </div>
            <div class="status-row">
              <span>E2E</span>
              <strong data-testid="e2e-mode">${this.params.get("e2e") === "1" ? "enabled" : "disabled"}</strong>
            </div>
            <div class="status-row">
              <span>Build</span>
              <strong>Bootstrap</strong>
            </div>
          </section>
        </main>
      </div>
    `;
    this.root.append(shell);

    const startButton = shell.querySelector<HTMLButtonElement>("[data-testid='start-skirmish']");
    startButton?.addEventListener("click", () => this.startSkirmish());
  }

  private startSkirmish(): void {
    this.mode = "loading";
    this.render();
    const host = document.createElement("div");
    host.className = "canvas-host";
    host.setAttribute("data-testid", "game-shell");
    this.root.querySelector(".frame")?.append(host);
    this.initializePhaser(host);
    this.mode = "skirmish";
    const modeLabel = this.root.querySelector("[data-testid='app-mode']");
    if (modeLabel) {
      modeLabel.textContent = this.mode;
    }
  }

  private initializePhaser(parent: HTMLDivElement): void {
    if (this.phaserGame) {
      this.phaserGame.destroy(true);
    }

    this.phaserGame = new Phaser.Game({
      type: Phaser.AUTO,
      width: 960,
      height: 540,
      backgroundColor: "#172421",
      parent,
      scene: new BootstrapScene(this.search),
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
    });
  }
}
