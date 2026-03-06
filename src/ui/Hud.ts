import { GameSession } from "../app/GameSession";
import { BUILDING_DEFINITIONS, RESEARCH_DEFINITIONS, UNIT_DEFINITIONS } from "../core/content";
import { tileIndex } from "../core/map";
import type { Age, BuildingEntity, BuildingType, Entity, ResearchId, UnitEntity, UnitType } from "../core/types";
import type { GameSettings } from "../persistence/storage";

function formatAge(age: Age): string {
  return age === "settlement" ? "Settlement Age" : age === "abbey" ? "Abbey Age" : "Warhost Age";
}

function formatLabel(identifier: string): string {
  return identifier.replace(/[A-Z]/g, (match) => ` ${match}`).replace(/^./, (char) => char.toUpperCase());
}

function formatDuration(ms: number): string {
  return `${Math.max(0.2, ms / 1000).toFixed(1)}s`;
}

function getQueuedItemLabel(item: BuildingEntity["queue"][number]): string {
  if (item.kind === "unit") {
    return UNIT_DEFINITIONS[item.id as UnitType].label;
  }
  if (item.kind === "research") {
    return RESEARCH_DEFINITIONS[item.id as ResearchId].label;
  }
  return item.id === "abbey" ? "Advance to Abbey Age" : "Advance to Warhost Age";
}

function getQueuedItemTotalMs(item: BuildingEntity["queue"][number]): number {
  if (item.kind === "unit") {
    return UNIT_DEFINITIONS[item.id as UnitType].trainTimeMs;
  }
  if (item.kind === "research") {
    return RESEARCH_DEFINITIONS[item.id as ResearchId].researchTimeMs;
  }
  return item.id === "abbey"
    ? RESEARCH_DEFINITIONS.abbeyAge.researchTimeMs
    : RESEARCH_DEFINITIONS.warhostAge.researchTimeMs;
}

interface HudOptions {
  settings: GameSettings;
  onSaveAndExit: () => Promise<unknown> | void;
  onSettingsChange: (settings: GameSettings) => void;
  onReturnToMenu: () => Promise<unknown> | void;
  onStartNewMatch: () => Promise<unknown> | void;
}

export class Hud {
  private readonly session: GameSession;
  private readonly root: HTMLDivElement;
  private readonly options: HudOptions;
  private readonly minimapCanvas: HTMLCanvasElement;
  private readonly actionsHost: HTMLDivElement;
  private readonly selectionHost: HTMLDivElement;
  private readonly hintHost: HTMLParagraphElement;
  private readonly resourceValues: Record<string, HTMLSpanElement>;
  private readonly ageLabel: HTMLSpanElement;
  private readonly commandLabel: HTMLSpanElement;
  private readonly outcomeLabel: HTMLParagraphElement;
  private readonly pauseButton: HTMLButtonElement;
  private readonly gridButton: HTMLButtonElement;
  private readonly motionButton: HTMLButtonElement;
  private readonly saveExitButton: HTMLButtonElement;
  private readonly overlay: HTMLDivElement;
  private readonly handleKeydownBound: (event: KeyboardEvent) => void;
  private readonly unsubscribe: () => void;
  private settings: GameSettings;
  private lastActionSignature = "";

  public constructor(session: GameSession, root: HTMLDivElement, options: HudOptions) {
    this.session = session;
    this.root = root;
    this.options = options;
    this.settings = options.settings;
    this.root.className = "hud";
    this.root.innerHTML = `
      <section class="hud-bar" data-testid="hud">
        <div class="resource-strip">
          <span>Food <strong data-testid="food-value">0</strong></span>
          <span>Timber <strong data-testid="timber-value">0</strong></span>
          <span>Stone <strong data-testid="stone-value">0</strong></span>
          <span>Iron <strong data-testid="iron-value">0</strong></span>
          <span>Pop <strong data-testid="population-value">0/0</strong></span>
        </div>
        <div class="meta-strip">
          <span data-testid="age-label">Settlement Age</span>
          <span data-testid="command-mode">Context</span>
          <div class="meta-actions">
            <button class="secondary-button" data-testid="toggle-grid-button">Grid: Off</button>
            <button class="secondary-button" data-testid="toggle-motion-button">Motion: Full</button>
            <button class="secondary-button" data-testid="save-exit-button">Save & Exit</button>
            <button class="secondary-button" data-testid="pause-button">Pause</button>
          </div>
        </div>
      </section>
      <section class="hud-columns">
        <div class="panel selection-panel">
          <div class="panel-heading">Selection</div>
          <div data-testid="selection-panel"></div>
          <p class="hint" data-testid="build-hint">Select units with left click. Right click, Ctrl+click, or Alt+left-click to command.</p>
        </div>
        <div class="panel action-panel">
          <div class="panel-heading">Orders</div>
          <div data-testid="action-panel"></div>
        </div>
        <div class="panel minimap-panel">
          <div class="panel-heading">Mossflower</div>
          <canvas data-testid="minimap" width="180" height="180"></canvas>
          <p class="hint" data-testid="outcome-label">Hold the field. Destroy the enemy host.</p>
        </div>
      </section>
      <div class="hud-overlay" data-testid="hud-overlay" hidden></div>
    `;

    this.minimapCanvas = this.root.querySelector("[data-testid='minimap']") as HTMLCanvasElement;
    this.actionsHost = this.root.querySelector("[data-testid='action-panel']") as HTMLDivElement;
    this.selectionHost = this.root.querySelector("[data-testid='selection-panel']") as HTMLDivElement;
    this.hintHost = this.root.querySelector("[data-testid='build-hint']") as HTMLParagraphElement;
    this.ageLabel = this.root.querySelector("[data-testid='age-label']") as HTMLSpanElement;
    this.commandLabel = this.root.querySelector("[data-testid='command-mode']") as HTMLSpanElement;
    this.outcomeLabel = this.root.querySelector("[data-testid='outcome-label']") as HTMLParagraphElement;
    this.resourceValues = {
      food: this.root.querySelector("[data-testid='food-value']") as HTMLSpanElement,
      timber: this.root.querySelector("[data-testid='timber-value']") as HTMLSpanElement,
      stone: this.root.querySelector("[data-testid='stone-value']") as HTMLSpanElement,
      iron: this.root.querySelector("[data-testid='iron-value']") as HTMLSpanElement,
      population: this.root.querySelector("[data-testid='population-value']") as HTMLSpanElement,
    };

    this.pauseButton = this.root.querySelector("[data-testid='pause-button']") as HTMLButtonElement;
    this.gridButton = this.root.querySelector("[data-testid='toggle-grid-button']") as HTMLButtonElement;
    this.motionButton = this.root.querySelector("[data-testid='toggle-motion-button']") as HTMLButtonElement;
    this.saveExitButton = this.root.querySelector("[data-testid='save-exit-button']") as HTMLButtonElement;
    this.overlay = this.root.querySelector("[data-testid='hud-overlay']") as HTMLDivElement;

    this.pauseButton.addEventListener("click", () => {
      const next = !this.session.getSessionState().paused;
      this.session.setPaused(next);
    });
    this.gridButton.addEventListener("click", () => {
      this.options.onSettingsChange({
        ...this.settings,
        showGrid: !this.settings.showGrid,
      });
    });
    this.motionButton.addEventListener("click", () => {
      this.options.onSettingsChange({
        ...this.settings,
        reducedMotion: !this.settings.reducedMotion,
      });
    });
    this.saveExitButton.addEventListener("click", () => {
      void this.options.onSaveAndExit();
    });

    this.handleKeydownBound = (event: KeyboardEvent) => this.handleKeydown(event);
    window.addEventListener("keydown", this.handleKeydownBound);
    this.unsubscribe = this.session.subscribe(() => this.render());
    this.render();
  }

  public destroy(): void {
    window.removeEventListener("keydown", this.handleKeydownBound);
    this.unsubscribe();
  }

  public updateSettings(settings: GameSettings): void {
    this.settings = settings;
    this.render();
  }

  public render(): void {
    const world = this.session.getWorld();
    const player = world.players.player;
    const sessionState = this.session.getSessionState();
    this.resourceValues.food.textContent = `${Math.round(player.resources.food)}`;
    this.resourceValues.timber.textContent = `${Math.round(player.resources.timber)}`;
    this.resourceValues.stone.textContent = `${Math.round(player.resources.stone)}`;
    this.resourceValues.iron.textContent = `${Math.round(player.resources.iron)}`;
    this.resourceValues.population.textContent = `${player.populationUsed}/${player.populationCap}`;
    this.ageLabel.textContent = formatAge(player.age);
    this.commandLabel.textContent = sessionState.buildMode
      ? `Build: ${BUILDING_DEFINITIONS[sessionState.buildMode].label}`
      : sessionState.commandMode
        ? `${formatLabel(sessionState.commandMode)} Mode`
        : "Context";
    this.outcomeLabel.textContent =
      world.outcome === "playerVictory"
        ? "Victory in Mossflower."
        : world.outcome === "playerDefeat"
          ? "The Abbey alliance has fallen."
          : "Hold the field. Destroy the enemy host.";
    this.pauseButton.textContent = sessionState.paused ? "Resume" : "Pause";
    this.gridButton.textContent = this.settings.showGrid ? "Grid: On" : "Grid: Off";
    this.motionButton.textContent = this.settings.reducedMotion ? "Motion: Reduced" : "Motion: Full";
    this.saveExitButton.textContent = world.outcome === "ongoing" ? "Save & Exit" : "Return to Menu";
    this.renderOverlay(world.outcome, sessionState.paused, player.age, world.elapsedMs);

    const selected = this.session.getSelectedEntities();
    const actionSignature = this.getActionSignature(selected, player.age);
    this.selectionHost.innerHTML = "";
    if (selected.length === 0) {
      this.selectionHost.innerHTML = "<p class='hint'>No current selection.</p>";
      this.hintHost.textContent = sessionState.buildMode
        ? `Build mode: ${BUILDING_DEFINITIONS[sessionState.buildMode as BuildingType].label}. Left click to place, or use right click/Ctrl+click.`
        : sessionState.commandMode
          ? `${formatLabel(sessionState.commandMode)} mode armed. Left click to issue that order.`
          : "Select units with left click. Right click, Ctrl+click, or Alt+left-click to command.";
      this.renderActionsPanel(actionSignature, () => {
        this.actionsHost.innerHTML = "";
      });
    } else if (selected.length === 1) {
      const entity = selected[0];
      this.selectionHost.append(this.renderSelectionCard(entity));
      this.renderActionsPanel(actionSignature, () => {
        this.actionsHost.innerHTML = "";
        this.renderActions(entity);
      });
    } else {
      const wrapper = document.createElement("div");
      wrapper.className = "selection-summary";
      wrapper.innerHTML = `<div class="selection-title">${selected.length} units selected</div>`;
      this.selectionHost.append(wrapper);
      this.renderActionsPanel(actionSignature, () => {
        this.actionsHost.innerHTML = "";
        this.renderGroupActions(selected.filter((entity): entity is UnitEntity => entity.kind === "unit"));
      });
      this.hintHost.textContent = "Group selected. Use Move, Attack, or Gather modes for left-click orders.";
    }

    this.drawMinimap();
  }

  private renderActionsPanel(signature: string, render: () => void): void {
    if (signature === this.lastActionSignature) {
      return;
    }
    render();
    this.lastActionSignature = signature;
  }

  private getActionSignature(selected: Entity[], age: Age): string {
    if (selected.length === 0) {
      return "none";
    }
    return selected.map((entity) => {
      if (entity.kind === "unit") {
        return `unit:${entity.id}:${entity.unitType}`;
      }
      if (entity.kind === "building") {
        return `building:${entity.id}:${entity.buildingType}:${entity.completed}:${age}`;
      }
      return `resource:${entity.id}`;
    }).join("|");
  }

  private renderOverlay(outcome: "ongoing" | "playerVictory" | "playerDefeat", paused: boolean, age: Age, elapsedMs: number): void {
    if (outcome === "ongoing" && !paused) {
      this.overlay.hidden = true;
      this.overlay.innerHTML = "";
      return;
    }

    const isOutcome = outcome !== "ongoing";
    const title = outcome === "playerVictory"
      ? "Victory in Mossflower"
      : outcome === "playerDefeat"
        ? "The Abbey Has Fallen"
        : "Skirmish Paused";
    const summary = outcome === "playerVictory"
      ? "The vermin host is broken. Regroup your woodland fighters and press the advantage."
      : outcome === "playerDefeat"
        ? "The raiders overran the Abbey alliance. Re-form the line and try a different opening."
        : "Orders are suspended. Review queues, plan your next age-up, or save the field for later.";
    const time = formatDuration(elapsedMs);

    this.overlay.hidden = false;
    this.overlay.innerHTML = `
      <div class="overlay-card" data-testid="${isOutcome ? "outcome-screen" : "pause-menu"}">
        <p class="eyebrow">${isOutcome ? "Match Result" : "Pause Menu"}</p>
        <h2 data-testid="overlay-title">${title}</h2>
        <p class="overlay-copy">${summary}</p>
        <dl class="overlay-stats">
          <div><dt>Time</dt><dd data-testid="overlay-time">${time}</dd></div>
          <div><dt>Age</dt><dd data-testid="overlay-age">${formatAge(age)}</dd></div>
        </dl>
        <div class="overlay-actions">
          ${isOutcome
            ? `
              <button class="primary-button" data-testid="overlay-new-skirmish">Start New Skirmish</button>
              <button class="secondary-button" data-testid="overlay-return-menu">Return to Menu</button>
            `
            : `
              <button class="primary-button" data-testid="overlay-resume">Resume Battle</button>
              <button class="secondary-button" data-testid="overlay-save-exit">Save & Exit</button>
            `}
        </div>
      </div>
    `;

    if (isOutcome) {
      this.overlay.querySelector<HTMLButtonElement>("[data-testid='overlay-new-skirmish']")?.addEventListener("click", () => {
        void this.options.onStartNewMatch();
      });
      this.overlay.querySelector<HTMLButtonElement>("[data-testid='overlay-return-menu']")?.addEventListener("click", () => {
        void this.options.onReturnToMenu();
      });
      return;
    }

    this.overlay.querySelector<HTMLButtonElement>("[data-testid='overlay-resume']")?.addEventListener("click", () => {
      this.session.setPaused(false);
    });
    this.overlay.querySelector<HTMLButtonElement>("[data-testid='overlay-save-exit']")?.addEventListener("click", () => {
      void this.options.onSaveAndExit();
    });
  }

  private renderSelectionCard(entity: Entity): HTMLDivElement {
    const card = document.createElement("div");
    card.className = "selection-card";
    if (entity.kind === "unit") {
      const definition = UNIT_DEFINITIONS[entity.unitType];
      card.innerHTML = `
        <div class="selection-title" data-testid="selection-name">${definition.label}</div>
        <div class="selection-meta">${formatLabel(entity.order.type)}</div>
        <div class="selection-health">${Math.round(entity.hp)}/${entity.maxHp} hp</div>
      `;
      return card;
    }
    if (entity.kind === "building") {
      const definition = BUILDING_DEFINITIONS[entity.buildingType];
      card.innerHTML = `
        <div class="selection-title" data-testid="selection-name">${definition.label}</div>
        <div class="selection-meta">${entity.completed ? "Operational" : "Under construction"}</div>
        <div class="selection-health">${Math.round(entity.hp)}/${entity.maxHp} hp</div>
      `;
      card.append(this.renderBuildingWorkState(entity));
      return card;
    }
    card.innerHTML = `
      <div class="selection-title" data-testid="selection-name">${formatLabel(entity.resourceType)}</div>
      <div class="selection-meta">${entity.amount}/${entity.maxAmount} remaining</div>
    `;
    return card;
  }

  private renderBuildingWorkState(building: BuildingEntity): HTMLDivElement {
    const panel = document.createElement("div");
    panel.className = "work-state";

    if (!building.completed) {
      const totalMs = Math.max(1, BUILDING_DEFINITIONS[building.buildingType].buildTimeMs);
      const progress = Math.min(1, building.buildProgressMs / totalMs);
      panel.append(this.createProgressBlock("Construction", `${Math.round(progress * 100)}%`, progress, `${formatDuration(totalMs - building.buildProgressMs)} remaining`));
      return panel;
    }

    if (building.queue.length === 0) {
      panel.innerHTML = `
        <div class="work-row">
          <span class="work-label" data-testid="work-label">Idle</span>
          <strong data-testid="work-progress-value">Ready</strong>
        </div>
        <p class="hint" data-testid="work-queue">No queued tasks.</p>
      `;
      return panel;
    }

    const active = building.queue[0];
    const totalMs = Math.max(1, getQueuedItemTotalMs(active));
    const progress = Math.min(1, Math.max(0, (totalMs - active.remainingMs) / totalMs));
    const statusLabel = active.kind === "unit"
      ? "Training"
      : active.kind === "research"
        ? "Researching"
        : "Advancing";

    panel.append(
      this.createProgressBlock(
        `${statusLabel}: ${getQueuedItemLabel(active)}`,
        `${Math.round(progress * 100)}%`,
        progress,
        `${formatDuration(active.remainingMs)} remaining`,
      ),
    );

    const queuedItems = building.queue.slice(1).map((item) => getQueuedItemLabel(item));
    const queueSummary = document.createElement("p");
    queueSummary.className = "hint";
    queueSummary.dataset.testid = "work-queue";
    queueSummary.textContent = queuedItems.length > 0
      ? `Queued next: ${queuedItems.join(" -> ")}`
      : "Queue ends after the current task.";
    panel.append(queueSummary);
    return panel;
  }

  private createProgressBlock(label: string, value: string, progress: number, subtitle: string): HTMLDivElement {
    const wrapper = document.createElement("div");
    wrapper.className = "progress-block";

    const row = document.createElement("div");
    row.className = "work-row";
    row.innerHTML = `
      <span class="work-label" data-testid="work-label">${label}</span>
      <strong data-testid="work-progress-value">${value}</strong>
    `;

    const track = document.createElement("div");
    track.className = "progress-track";
    track.innerHTML = `<div class="progress-fill" style="width: ${Math.max(4, progress * 100)}%"></div>`;

    const meta = document.createElement("div");
    meta.className = "selection-meta";
    meta.dataset.testid = "work-eta";
    meta.textContent = subtitle;

    wrapper.append(row, track, meta);
    return wrapper;
  }

  private renderActions(entity: Entity): void {
    if (entity.kind === "unit") {
      this.actionsHost.append(
        this.createButton("Move", "action-mode-move", () => this.session.setCommandMode("move")),
        this.createButton("Gather", "action-mode-gather", () => this.session.setCommandMode("gather")),
        this.createButton("Attack", "action-mode-attack", () => this.session.setCommandMode("attack")),
      );
      if (UNIT_DEFINITIONS[entity.unitType].tags.includes("worker")) {
        const buildingOptions: BuildingType[] = [
          "dormitory",
          "storehouse",
          "granary",
          "barracks",
          "range",
          "blacksmith",
          "longPatrolLodge",
          "tower",
          "wall",
          "gate",
          "workshop",
        ];
        this.actionsHost.append(
          ...buildingOptions.map((buildingType) =>
            this.createButton(
              BUILDING_DEFINITIONS[buildingType].label,
              `action-build-${buildingType}`,
              () => this.session.setBuildMode(buildingType),
            ),
          ),
        );
      } else {
        this.actionsHost.append(
          this.createButton("Stop", "action-stop", () => {
            this.session.issueCommand({ type: "stop", unitIds: [entity.id] });
          }),
        );
      }
      return;
    }

    if (entity.kind !== "building" || !entity.completed) {
      return;
    }

    this.actionsHost.append(this.createButton("Set Rally", "action-mode-rally", () => this.session.setCommandMode("rally")));

    if (entity.buildingType === "abbeyHall") {
      this.actionsHost.append(
        this.createTrainButton(entity, "worker"),
        this.createTrainButton(entity, "shrewScout"),
        this.createButton("Advance to Abbey Age", "action-age-abbey", () => {
          this.session.issueCommand({ type: "ageUp", buildingId: entity.id, nextAge: "abbey" });
        }),
        this.createButton("Advance to Warhost Age", "action-age-warhost", () => {
          this.session.issueCommand({ type: "ageUp", buildingId: entity.id, nextAge: "warhost" });
        }),
      );
    }

    if (entity.buildingType === "barracks") {
      this.actionsHost.append(this.createTrainButton(entity, "militia"), this.createTrainButton(entity, "shieldbearer"));
    }
    if (entity.buildingType === "range") {
      this.actionsHost.append(
        this.createTrainButton(entity, "slinger"),
        this.createTrainButton(entity, "archer"),
        this.createTrainButton(entity, "otterSkirmisher"),
      );
    }
    if (entity.buildingType === "longPatrolLodge") {
      this.actionsHost.append(this.createTrainButton(entity, "hareRunner"), this.createTrainButton(entity, "badgerChampion"));
    }
    if (entity.buildingType === "workshop") {
      this.actionsHost.append(this.createTrainButton(entity, "ramCart"));
    }
    if (entity.buildingType === "granary") {
      this.actionsHost.append(this.createResearchButton(entity, "woodcraft"));
    }
    if (entity.buildingType === "blacksmith") {
      const researchIds: ResearchId[] = ["stoneMasonry", "ironforging", "leatherwork", "towerGuard", "hareDrills"];
      this.actionsHost.append(...researchIds.map((researchId) => this.createResearchButton(entity, researchId)));
    }
  }

  private renderGroupActions(units: UnitEntity[]): void {
    if (units.length === 0) {
      this.actionsHost.innerHTML = "<p class='hint'>No actions available.</p>";
      return;
    }
    this.actionsHost.append(
      this.createButton("Move", "action-group-move", () => this.session.setCommandMode("move")),
      this.createButton("Attack", "action-group-attack", () => this.session.setCommandMode("attack")),
      this.createButton("Gather", "action-group-gather", () => this.session.setCommandMode("gather")),
    );
    const workerPresent = units.some((unit) => UNIT_DEFINITIONS[unit.unitType].tags.includes("worker"));
    if (workerPresent) {
      this.actionsHost.append(this.createButton("Build Dormitory", "action-build-dormitory", () => this.session.setBuildMode("dormitory")));
      this.actionsHost.append(this.createButton("Build Barracks", "action-build-barracks", () => this.session.setBuildMode("barracks")));
      this.actionsHost.append(this.createButton("Build Tower", "action-build-tower", () => this.session.setBuildMode("tower")));
    }
    this.actionsHost.append(
      this.createButton("Stop", "action-group-stop", () => {
        this.session.issueCommand({ type: "stop", unitIds: units.map((unit) => unit.id) });
      }),
    );
  }

  private createTrainButton(building: BuildingEntity, unitType: UnitType): HTMLButtonElement {
    return this.createButton(UNIT_DEFINITIONS[unitType].label, `action-train-${unitType}`, () => {
      this.session.issueCommand({ type: "train", buildingId: building.id, unitType });
    });
  }

  private createResearchButton(building: BuildingEntity, researchId: ResearchId): HTMLButtonElement {
    return this.createButton(RESEARCH_DEFINITIONS[researchId].label, `action-research-${researchId}`, () => {
      this.session.issueCommand({ type: "research", buildingId: building.id, researchId });
    });
  }

  private createButton(label: string, testId: string, action: () => void): HTMLButtonElement {
    const button = document.createElement("button");
    button.className = "action-button";
    button.textContent = label;
    button.dataset.testid = testId;
    button.addEventListener("click", action);
    return button;
  }

  private handleKeydown(event: KeyboardEvent): void {
    if (event.repeat) {
      return;
    }
    if (event.code === "Space") {
      event.preventDefault();
      this.session.setPaused(!this.session.getSessionState().paused);
      return;
    }
    if (this.session.getWorld().outcome !== "ongoing") {
      return;
    }
    if (this.session.getSessionState().paused) {
      return;
    }
    if (event.code === "Escape") {
      this.session.setBuildMode(undefined);
      this.session.setCommandMode(undefined);
      return;
    }
    const selected = this.session.getSelectedEntities();
    if (selected.length === 0) {
      return;
    }
    const single = selected[0];
    switch (event.code) {
      case "KeyH":
        if (selected.some((entity) => entity.kind === "unit" && UNIT_DEFINITIONS[entity.unitType].tags.includes("worker"))) {
          this.session.setBuildMode("dormitory");
        }
        break;
      case "KeyB":
        if (selected.some((entity) => entity.kind === "unit" && UNIT_DEFINITIONS[entity.unitType].tags.includes("worker"))) {
          this.session.setBuildMode("barracks");
        }
        break;
      case "KeyM":
        this.session.setCommandMode("move");
        break;
      case "KeyG":
        this.session.setCommandMode("gather");
        break;
      case "KeyT":
        this.session.setCommandMode("attack");
        break;
      case "KeyY":
        if (single?.kind === "building") {
          this.session.setCommandMode("rally");
        }
        break;
      case "KeyQ":
        if (single?.kind === "building" && single.buildingType === "abbeyHall") {
          this.session.issueCommand({ type: "train", buildingId: single.id, unitType: "worker" });
        }
        break;
      case "KeyR":
        if (single?.kind === "building" && single.buildingType === "range") {
          this.session.issueCommand({ type: "train", buildingId: single.id, unitType: "archer" });
        }
        break;
      default:
        break;
    }
  }

  private drawMinimap(): void {
    const world = this.session.getWorld();
    const context = this.minimapCanvas.getContext("2d");
    if (!context) {
      return;
    }
    context.clearRect(0, 0, this.minimapCanvas.width, this.minimapCanvas.height);
    const tileWidth = this.minimapCanvas.width / world.map.width;
    const tileHeight = this.minimapCanvas.height / world.map.height;
    for (let y = 0; y < world.map.height; y += 1) {
      for (let x = 0; x < world.map.width; x += 1) {
        const index = tileIndex(world.map, { x, y });
        const explored = world.players.player.explored[index];
        const visible = world.players.player.visible[index];
        context.fillStyle = !explored ? "#08100f" : visible ? "#456b4a" : "#22352b";
        context.fillRect(x * tileWidth, y * tileHeight, tileWidth, tileHeight);
      }
    }
    for (const entity of Object.values(world.entities)) {
      if (entity.kind === "resource") {
        continue;
      }
      if (
        entity.playerId !== "player"
        && !world.players.player.visible[
          tileIndex(world.map, entity.kind === "unit" ? { x: Math.round(entity.position.x), y: Math.round(entity.position.y) } : entity.tile)
        ]
      ) {
        continue;
      }
      context.fillStyle = entity.playerId === "player" ? "#f1d387" : "#d16a6a";
      const x = entity.kind === "unit" ? entity.position.x : entity.tile.x;
      const y = entity.kind === "unit" ? entity.position.y : entity.tile.y;
      context.fillRect(x * tileWidth, y * tileHeight, Math.max(2, tileWidth), Math.max(2, tileHeight));
    }
  }
}
