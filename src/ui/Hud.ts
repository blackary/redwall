import { BUILDING_DEFINITIONS, RESEARCH_DEFINITIONS, UNIT_DEFINITIONS } from "../core/content";
import { tileIndex } from "../core/map";
import type { Age, BuildingEntity, BuildingType, Entity, ResearchId, UnitEntity, UnitType } from "../core/types";
import { GameSession } from "../app/GameSession";

function formatAge(age: Age): string {
  return age === "settlement" ? "Settlement Age" : age === "abbey" ? "Abbey Age" : "Warhost Age";
}

function formatLabel(identifier: string): string {
  return identifier.replace(/[A-Z]/g, (match) => ` ${match}`).replace(/^./, (char) => char.toUpperCase());
}

export class Hud {
  private readonly session: GameSession;
  private readonly root: HTMLDivElement;
  private readonly minimapCanvas: HTMLCanvasElement;
  private readonly actionsHost: HTMLDivElement;
  private readonly selectionHost: HTMLDivElement;
  private readonly continueHint: HTMLParagraphElement;
  private readonly resourceValues: Record<string, HTMLSpanElement>;
  private readonly ageLabel: HTMLSpanElement;
  private readonly outcomeLabel: HTMLDivElement;

  public constructor(session: GameSession, root: HTMLDivElement) {
    this.session = session;
    this.root = root;
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
          <button class="secondary-button" data-testid="pause-button">Pause</button>
        </div>
      </section>
      <section class="hud-columns">
        <div class="panel selection-panel">
          <div class="panel-heading">Selection</div>
          <div data-testid="selection-panel"></div>
          <p class="hint" data-testid="build-hint">Select units with left click. Right click to move or interact.</p>
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
    `;

    this.minimapCanvas = this.root.querySelector("[data-testid='minimap']") as HTMLCanvasElement;
    this.actionsHost = this.root.querySelector("[data-testid='action-panel']") as HTMLDivElement;
    this.selectionHost = this.root.querySelector("[data-testid='selection-panel']") as HTMLDivElement;
    this.continueHint = this.root.querySelector("[data-testid='build-hint']") as HTMLParagraphElement;
    this.ageLabel = this.root.querySelector("[data-testid='age-label']") as HTMLSpanElement;
    this.outcomeLabel = this.root.querySelector("[data-testid='outcome-label']") as HTMLDivElement;
    this.resourceValues = {
      food: this.root.querySelector("[data-testid='food-value']") as HTMLSpanElement,
      timber: this.root.querySelector("[data-testid='timber-value']") as HTMLSpanElement,
      stone: this.root.querySelector("[data-testid='stone-value']") as HTMLSpanElement,
      iron: this.root.querySelector("[data-testid='iron-value']") as HTMLSpanElement,
      population: this.root.querySelector("[data-testid='population-value']") as HTMLSpanElement,
    };

    const pauseButton = this.root.querySelector("[data-testid='pause-button']") as HTMLButtonElement;
    pauseButton.addEventListener("click", () => {
      const next = !this.session.getSessionState().paused;
      this.session.setPaused(next);
      pauseButton.textContent = next ? "Resume" : "Pause";
    });

    window.addEventListener("keydown", (event) => this.handleKeydown(event));
    this.session.subscribe(() => this.render());
    this.render();
  }

  public render(): void {
    const world = this.session.getWorld();
    const player = world.players.player;
    this.resourceValues.food.textContent = `${Math.round(player.resources.food)}`;
    this.resourceValues.timber.textContent = `${Math.round(player.resources.timber)}`;
    this.resourceValues.stone.textContent = `${Math.round(player.resources.stone)}`;
    this.resourceValues.iron.textContent = `${Math.round(player.resources.iron)}`;
    this.resourceValues.population.textContent = `${player.populationUsed}/${player.populationCap}`;
    this.ageLabel.textContent = formatAge(player.age);
    this.outcomeLabel.textContent =
      world.outcome === "playerVictory"
        ? "Victory in Mossflower."
        : world.outcome === "playerDefeat"
          ? "The Abbey alliance has fallen."
          : "Hold the field. Destroy the enemy host.";

    const selected = this.session.getSelectedEntities();
    this.selectionHost.innerHTML = "";
    this.actionsHost.innerHTML = "";
    if (selected.length === 0) {
      this.selectionHost.innerHTML = "<p class='hint'>No current selection.</p>";
      this.continueHint.textContent = this.session.getSessionState().buildMode
        ? `Build mode: ${BUILDING_DEFINITIONS[this.session.getSessionState().buildMode as BuildingType].label}. Right click on the map to place it.`
        : "Select units with left click. Right click to move or interact.";
    } else if (selected.length === 1) {
      const entity = selected[0];
      this.selectionHost.append(this.renderSelectionCard(entity));
      this.renderActions(entity);
    } else {
      const wrapper = document.createElement("div");
      wrapper.className = "selection-summary";
      wrapper.innerHTML = `<div class="selection-title">${selected.length} units selected</div>`;
      this.selectionHost.append(wrapper);
      this.renderGroupActions(selected.filter((entity): entity is UnitEntity => entity.kind === "unit"));
    }

    this.drawMinimap();
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
      return card;
    }
    card.innerHTML = `
      <div class="selection-title" data-testid="selection-name">${formatLabel(entity.resourceType)}</div>
      <div class="selection-meta">${entity.amount}/${entity.maxAmount} remaining</div>
    `;
    return card;
  }

  private renderActions(entity: Entity): void {
    if (entity.kind === "unit") {
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
        this.actionsHost.append(...buildingOptions.map((buildingType) => this.createButton(
          BUILDING_DEFINITIONS[buildingType].label,
          `action-build-${buildingType}`,
          () => this.session.setBuildMode(buildingType),
        )));
      } else {
        this.actionsHost.append(this.createButton("Stop", "action-stop", () => {
          this.session.issueCommand({ type: "stop", unitIds: [entity.id] });
        }));
      }
      return;
    }

    if (entity.kind !== "building" || !entity.completed) {
      return;
    }

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
    const workerPresent = units.some((unit) => UNIT_DEFINITIONS[unit.unitType].tags.includes("worker"));
    if (workerPresent) {
      this.actionsHost.append(this.createButton("Build Dormitory", "action-build-dormitory", () => {
        this.session.setBuildMode("dormitory");
      }));
      this.actionsHost.append(this.createButton("Build Barracks", "action-build-barracks", () => {
        this.session.setBuildMode("barracks");
      }));
      this.actionsHost.append(this.createButton("Build Tower", "action-build-tower", () => {
        this.session.setBuildMode("tower");
      }));
    }
    this.actionsHost.append(this.createButton("Stop", "action-group-stop", () => {
      this.session.issueCommand({ type: "stop", unitIds: units.map((unit) => unit.id) });
    }));
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
      case "Escape":
        this.session.setBuildMode(undefined);
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
      if (entity.playerId !== "player" && !world.players.player.visible[tileIndex(world.map, entity.kind === "unit" ? { x: Math.round(entity.position.x), y: Math.round(entity.position.y) } : entity.tile)]) {
        continue;
      }
      context.fillStyle = entity.playerId === "player" ? "#f1d387" : "#d16a6a";
      const x = entity.kind === "unit" ? entity.position.x : entity.tile.x;
      const y = entity.kind === "unit" ? entity.position.y : entity.tile.y;
      context.fillRect(x * tileWidth, y * tileHeight, Math.max(2, tileWidth), Math.max(2, tileHeight));
    }
  }
}
