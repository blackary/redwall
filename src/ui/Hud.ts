import { GameSession } from "../app/GameSession";
import { AGE_ORDER, BUILDING_DEFINITIONS, RESEARCH_DEFINITIONS, UNIT_DEFINITIONS } from "../core/content";
import { getFactionAdjustedUnitDefinition, getFactionDefinition, getFactionPalette } from "../core/factions";
import { getMapDefinition, tileIndex } from "../core/map";
import { getTutorialState } from "../core/tutorial";
import type {
  Age,
  BuildingEntity,
  BuildingType,
  Entity,
  ResearchId,
  ResourceBag,
  ResourceType,
  TilePoint,
  UnitEntity,
  UnitType,
} from "../core/types";
import type { GameSettings } from "../persistence/storage";

type VisibleBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

type ActionDescriptor = {
  label: string;
  testId: string;
  action: () => void;
  detail?: string;
  cost?: Partial<ResourceBag>;
  disabled?: boolean;
  disabledReason?: string;
  hotkeyLabel?: string;
  hotkeyCode?: string;
  tone?: "command" | "task" | "build" | "train" | "research" | "age";
  categoryLabel?: string;
  description?: string;
  detailRows?: Array<{ label: string; value: string }>;
};

const ACTION_GRID_HOTKEYS = [
  { label: "Q", code: "KeyQ" },
  { label: "W", code: "KeyW" },
  { label: "E", code: "KeyE" },
  { label: "R", code: "KeyR" },
  { label: "A", code: "KeyA" },
  { label: "S", code: "KeyS" },
  { label: "D", code: "KeyD" },
  { label: "F", code: "KeyF" },
  { label: "Z", code: "KeyZ" },
  { label: "X", code: "KeyX" },
  { label: "C", code: "KeyC" },
  { label: "V", code: "KeyV" },
] as const;

function formatAge(age: Age): string {
  return age === "settlement" ? "Settlement Age" : age === "abbey" ? "Abbey Age" : "Warhost Age";
}

function formatLabel(identifier: string): string {
  return identifier.replace(/[A-Z]/g, (match) => ` ${match}`).replace(/^./, (char) => char.toUpperCase());
}

function formatDuration(ms: number): string {
  return `${Math.max(0.2, ms / 1000).toFixed(1)}s`;
}

function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

function formatCost(cost?: Partial<ResourceBag>): string {
  if (!cost) {
    return "";
  }
  const parts: string[] = [];
  if (cost.food) {
    parts.push(`${cost.food}F`);
  }
  if (cost.timber) {
    parts.push(`${cost.timber}W`);
  }
  if (cost.stone) {
    parts.push(`${cost.stone}S`);
  }
  if (cost.iron) {
    parts.push(`${cost.iron}I`);
  }
  return parts.join(" ");
}

function formatFootprint(buildingType: BuildingType): string {
  const footprint = BUILDING_DEFINITIONS[buildingType].footprint;
  return `${footprint.x}x${footprint.y}`;
}

function formatResourceLabel(resourceType: ResourceType): string {
  switch (resourceType) {
    case "food":
      return "Food";
    case "timber":
      return "Wood";
    case "stone":
      return "Stone";
    case "iron":
      return "Iron";
    default:
      return formatLabel(resourceType);
  }
}

function bagHasCost(bag: ResourceBag, cost: Partial<ResourceBag>): boolean {
  return (cost.food ?? 0) <= bag.food
    && (cost.timber ?? 0) <= bag.timber
    && (cost.stone ?? 0) <= bag.stone
    && (cost.iron ?? 0) <= bag.iron;
}

function isAgeUnlocked(currentAge: Age, requiredAge: Age): boolean {
  return AGE_ORDER.indexOf(currentAge) >= AGE_ORDER.indexOf(requiredAge);
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

function getSelectionCountLabel(selected: Entity[]): string {
  if (selected.length === 0) {
    return "No Selection";
  }
  if (selected.length === 1) {
    const entity = selected[0];
    if (entity.kind === "unit") {
      return "1 Unit";
    }
    if (entity.kind === "building") {
      return "1 Building";
    }
  }
  return `${selected.length} Selected`;
}

function getEntityBadge(entity: Entity): string {
  if (entity.kind === "unit") {
    switch (entity.unitType) {
      case "worker":
        return "WK";
      case "shrewScout":
        return "SC";
      case "shieldbearer":
        return "SH";
      case "badgerChampion":
        return "BC";
      case "ramCart":
        return "RM";
      default:
        return UNIT_DEFINITIONS[entity.unitType].label.slice(0, 2).toUpperCase();
    }
  }
  if (entity.kind === "building") {
    switch (entity.buildingType) {
      case "abbeyHall":
        return "AH";
      case "longPatrolLodge":
        return "LP";
      default:
        return BUILDING_DEFINITIONS[entity.buildingType].label.slice(0, 2).toUpperCase();
    }
  }
  return formatLabel(entity.resourceType).slice(0, 2).toUpperCase();
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function toCssHex(color: number): string {
  return `#${color.toString(16).padStart(6, "0")}`;
}

function getPlayerQueuedUnits(session: GameSession): number {
  return Object.values(session.getWorld().entities)
    .filter((entity): entity is BuildingEntity => entity.kind === "building" && entity.playerId === "player")
    .reduce((total, entity) => total + entity.queue.filter((item) => item.kind === "unit").length, 0);
}

function getUnitDescription(unitType: UnitType): string {
  switch (unitType) {
    case "worker":
      return "Economic unit for gathering, hauling, and constructing the Abbey frontier.";
    case "shrewScout":
      return "Fast scouting beast with wide sight and quick response around the map.";
    case "militia":
      return "Basic melee line-holder for the first fights around your economy.";
    case "shieldbearer":
      return "Durable infantry that absorbs punishment and anchors the front line.";
    case "slinger":
      return "Low-cost ranged support for early volleys and skirmishes.";
    case "archer":
      return "Longer-range ranged unit for focused pressure and defense.";
    case "otterSkirmisher":
      return "Mobile warhost ranged unit with a stronger combat profile than early archers.";
    case "hareRunner":
      return "Fast striking infantry for raids, flanks, and quick reinforcement.";
    case "badgerChampion":
      return "Heavy elite bruiser meant to smash through late-game positions.";
    case "ramCart":
      return "Siege engine for bringing down towers, halls, and fortified lines.";
    default:
      return "Abbey alliance troop.";
  }
}

function getBuildingDescription(buildingType: BuildingType): string {
  switch (buildingType) {
    case "dormitory":
      return "Expands population room so the Abbey can support a larger host.";
    case "storehouse":
      return "Resource drop-off for timber, stone, and iron near outlying gather lines.";
    case "granary":
      return "Food drop-off and early eco upgrade site for a stable opening.";
    case "barracks":
      return "Primary military hall for melee troops and your first proper army.";
    case "range":
      return "Ranged production building unlocked in Abbey Age.";
    case "blacksmith":
      return "Upgrade hall for armor, damage, and tower improvements.";
    case "longPatrolLodge":
      return "Late-game military building for hares and badger champions.";
    case "tower":
      return "Static defense for protecting gatherers and controlling approaches.";
    case "wall":
      return "Cheap fortification piece for shaping battles and slowing raids.";
    case "gate":
      return "Passable wall segment that preserves your own movement lanes.";
    case "workshop":
      return "Siege production building for ram carts in the late game.";
    case "abbeyHall":
      return "Town center equivalent for villagers, scouts, and age advancement.";
    default:
      return "Abbey alliance structure.";
  }
}

function getResearchDescription(researchId: ResearchId): string {
  return RESEARCH_DEFINITIONS[researchId].grants.join(" ");
}

interface HudOptions {
  settings: GameSettings;
  onSaveAndExit: () => Promise<unknown> | void;
  onSettingsChange: (settings: GameSettings) => void;
  onReturnToMenu: () => Promise<unknown> | void;
  onStartNewMatch: () => Promise<unknown> | void;
  onNavigateMinimap: (tile: TilePoint) => void;
  getVisibleTileBounds: () => VisibleBounds | undefined;
}

export class Hud {
  private readonly session: GameSession;
  private readonly root: HTMLDivElement;
  private readonly options: HudOptions;
  private readonly minimapCanvas: HTMLCanvasElement;
  private readonly actionsHost: HTMLDivElement;
  private readonly queueHost: HTMLDivElement;
  private readonly queueSummaryHost: HTMLSpanElement;
  private readonly sidebarHost: HTMLDivElement;
  private readonly selectionHost: HTMLDivElement;
  private readonly selectionRosterHost: HTMLDivElement;
  private readonly selectionCountLabel: HTMLSpanElement;
  private readonly hintHost: HTMLParagraphElement;
  private readonly resourceValues: Record<string, HTMLSpanElement>;
  private readonly ageLabel: HTMLSpanElement;
  private readonly commandLabel: HTMLSpanElement;
  private readonly clockLabel: HTMLSpanElement;
  private readonly economySummaryLabel: HTMLSpanElement;
  private readonly outcomeLabel: HTMLParagraphElement;
  private readonly mapLabel: HTMLDivElement;
  private readonly factionLabel: HTMLSpanElement;
  private readonly pauseButton: HTMLButtonElement;
  private readonly gridButton: HTMLButtonElement;
  private readonly motionButton: HTMLButtonElement;
  private readonly saveExitButton: HTMLButtonElement;
  private readonly overlay: HTMLDivElement;
  private readonly handleKeydownBound: (event: KeyboardEvent) => void;
  private readonly handleMinimapClickBound: (event: MouseEvent) => void;
  private readonly unsubscribe: () => void;
  private settings: GameSettings;
  private lastActionSignature = "";
  private actionFocusId?: string;

  public constructor(session: GameSession, root: HTMLDivElement, options: HudOptions) {
    this.session = session;
    this.root = root;
    this.options = options;
    this.settings = options.settings;
    this.root.className = "hud";
    this.root.innerHTML = `
      <section class="hud-topbar" data-testid="hud">
        <div class="rts-panel resource-strip">
          <div class="resource-cell resource-food"><span class="resource-glyph">F</span><span class="resource-name">Food</span><strong data-testid="food-value">0</strong></div>
          <div class="resource-cell resource-timber"><span class="resource-glyph">W</span><span class="resource-name">Wood</span><strong data-testid="timber-value">0</strong></div>
          <div class="resource-cell resource-stone"><span class="resource-glyph">S</span><span class="resource-name">Stone</span><strong data-testid="stone-value">0</strong></div>
          <div class="resource-cell resource-iron"><span class="resource-glyph">I</span><span class="resource-name">Iron</span><strong data-testid="iron-value">0</strong></div>
          <div class="resource-cell resource-pop"><span class="resource-glyph">P</span><span class="resource-name">Pop</span><strong data-testid="population-value">0/0</strong></div>
        </div>
        <div class="rts-panel meta-ribbon">
          <div class="ribbon-section">
            <span class="ribbon-label">Age</span>
            <strong data-testid="age-label">Settlement Age</strong>
          </div>
          <div class="ribbon-section">
            <span class="ribbon-label">Clock</span>
            <strong data-testid="elapsed-time">00:00</strong>
          </div>
          <div class="ribbon-section ribbon-wide">
            <span class="ribbon-label">Economy</span>
            <strong data-testid="economy-summary">Workers 0 | Idle 0 | Army 0</strong>
          </div>
          <div class="ribbon-section ribbon-wide">
            <span class="ribbon-label">Orders</span>
            <strong data-testid="command-mode">Context</strong>
          </div>
          <div class="meta-actions">
            <button class="secondary-button" data-testid="toggle-grid-button">Grid: Off</button>
            <button class="secondary-button" data-testid="toggle-motion-button">Motion: Full</button>
            <button class="secondary-button" data-testid="save-exit-button">Save & Exit</button>
            <button class="secondary-button" data-testid="pause-button">Pause</button>
          </div>
        </div>
      </section>
      <aside class="panel hud-sidebar" data-testid="hud-sidebar"></aside>
      <section class="hud-dock">
        <div class="panel dock-panel minimap-panel">
          <div class="dock-header">
            <div class="panel-heading" data-testid="map-label">Mossflower Meadows</div>
            <span class="dock-kicker" data-testid="faction-label">Abbey Alliance</span>
          </div>
          <canvas data-testid="minimap" width="180" height="180"></canvas>
          <p class="minimap-instructions">Left click the minimap to shift the camera. Double-click units to grab the full group.</p>
          <p class="hint" data-testid="outcome-label">Hold the field. Destroy the enemy host.</p>
        </div>
        <div class="panel dock-panel selection-panel">
          <div class="dock-header">
            <div class="panel-heading">Selected</div>
            <span class="dock-kicker" data-testid="selection-count">No Selection</span>
          </div>
          <div class="selection-shell">
            <div data-testid="selection-panel"></div>
            <div class="selection-roster" data-testid="selection-roster"></div>
          </div>
          <p class="hint" data-testid="build-hint">Select units with left click. Right click, Ctrl+click, or Alt+left-click to command.</p>
        </div>
        <div class="panel dock-panel action-panel">
          <div class="dock-header">
            <div class="panel-heading">Command Palette</div>
            <span class="dock-kicker" data-testid="queue-summary">Select a unit or building</span>
          </div>
          <div class="queue-panel" data-testid="queue-panel"></div>
          <div data-testid="action-panel"></div>
        </div>
      </section>
      <div class="hud-overlay" data-testid="hud-overlay" hidden></div>
    `;

    this.minimapCanvas = this.root.querySelector("[data-testid='minimap']") as HTMLCanvasElement;
    this.actionsHost = this.root.querySelector("[data-testid='action-panel']") as HTMLDivElement;
    this.queueHost = this.root.querySelector("[data-testid='queue-panel']") as HTMLDivElement;
    this.queueSummaryHost = this.root.querySelector("[data-testid='queue-summary']") as HTMLSpanElement;
    this.sidebarHost = this.root.querySelector("[data-testid='hud-sidebar']") as HTMLDivElement;
    this.selectionHost = this.root.querySelector("[data-testid='selection-panel']") as HTMLDivElement;
    this.selectionRosterHost = this.root.querySelector("[data-testid='selection-roster']") as HTMLDivElement;
    this.selectionCountLabel = this.root.querySelector("[data-testid='selection-count']") as HTMLSpanElement;
    this.hintHost = this.root.querySelector("[data-testid='build-hint']") as HTMLParagraphElement;
    this.ageLabel = this.root.querySelector("[data-testid='age-label']") as HTMLSpanElement;
    this.clockLabel = this.root.querySelector("[data-testid='elapsed-time']") as HTMLSpanElement;
    this.economySummaryLabel = this.root.querySelector("[data-testid='economy-summary']") as HTMLSpanElement;
    this.commandLabel = this.root.querySelector("[data-testid='command-mode']") as HTMLSpanElement;
    this.outcomeLabel = this.root.querySelector("[data-testid='outcome-label']") as HTMLParagraphElement;
    this.mapLabel = this.root.querySelector("[data-testid='map-label']") as HTMLDivElement;
    this.factionLabel = this.root.querySelector("[data-testid='faction-label']") as HTMLSpanElement;
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
    this.handleMinimapClickBound = (event: MouseEvent) => this.handleMinimapClick(event);
    window.addEventListener("keydown", this.handleKeydownBound);
    this.minimapCanvas.addEventListener("click", this.handleMinimapClickBound);

    this.unsubscribe = this.session.subscribe(() => this.render());
    this.render();
  }

  public destroy(): void {
    window.removeEventListener("keydown", this.handleKeydownBound);
    this.minimapCanvas.removeEventListener("click", this.handleMinimapClickBound);
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
    const tutorialState = getTutorialState(world, this.session.getSelectedEntities());
    const faction = getFactionDefinition(player.faction);
    this.resourceValues.food.textContent = `${Math.round(player.resources.food)}`;
    this.resourceValues.timber.textContent = `${Math.round(player.resources.timber)}`;
    this.resourceValues.stone.textContent = `${Math.round(player.resources.stone)}`;
    this.resourceValues.iron.textContent = `${Math.round(player.resources.iron)}`;
    this.resourceValues.population.textContent = `${player.populationUsed}/${player.populationCap}`;
    this.ageLabel.textContent = formatAge(player.age);
    this.clockLabel.textContent = formatClock(world.elapsedMs);
    this.economySummaryLabel.textContent = this.getEconomySummary();
    this.commandLabel.textContent = this.getCommandLabel();
    this.mapLabel.textContent = getMapDefinition(world.map.preset).label;
    this.factionLabel.textContent = world.scenario === "tutorial" ? `${faction.label} Tutorial` : faction.label;
    this.factionLabel.style.color = toCssHex(getFactionPalette(player.faction, "player").main);
    this.outcomeLabel.textContent =
      world.scenario === "tutorial"
        ? tutorialState?.completed
          ? "Tutorial complete. Return to the menu to claim Chronicle progress."
          : tutorialState?.currentStep
            ? `Tutorial: ${tutorialState.currentStep.label}.`
            : "Follow the guided opening."
        : world.outcome === "playerVictory"
          ? `Victory on ${getMapDefinition(world.map.preset).label}.`
          : world.outcome === "playerDefeat"
            ? `The ${faction.label} host has fallen.`
            : "Hold the field. Destroy the enemy host.";
    this.pauseButton.textContent = sessionState.paused ? "Resume" : "Pause";
    this.gridButton.textContent = this.settings.showGrid ? "Grid: On" : "Grid: Off";
    this.motionButton.textContent = this.settings.reducedMotion ? "Motion: Reduced" : "Motion: Full";
    this.saveExitButton.textContent = tutorialState?.completed
      ? "Finish Tutorial"
      : world.outcome === "ongoing"
        ? "Save & Exit"
        : "Return to Menu";
    this.renderOverlay(world.outcome, sessionState.paused, player.age, world.elapsedMs);

    const selected = this.session.getSelectedEntities();
    this.selectionCountLabel.textContent = getSelectionCountLabel(selected);
    this.selectionHost.innerHTML = "";
    this.selectionRosterHost.innerHTML = "";

    if (selected.length === 0) {
      this.selectionHost.innerHTML = `
        <div class="selection-empty">
            <div class="selection-title">${faction.label} Command</div>
            <p class="hint">${
            world.scenario === "tutorial"
              ? "Follow the objective list in the right sidebar to learn the core opening sequence."
              : `${faction.shortBonus} Use the Command Palette below to issue orders, assign worker jobs, and open construction and production groups.`
          }</p>
        </div>
      `;
      this.hintHost.textContent = sessionState.buildMode
        ? `Build mode armed for ${BUILDING_DEFINITIONS[sessionState.buildMode].label}. Left click to place.`
        : sessionState.commandMode
          ? `${this.getCommandLabel()} armed. Left click the battlefield to issue the order.`
          : "Select units with left click. Right click, Ctrl+click, or Alt+left-click to command.";
    } else if (selected.length === 1) {
      this.selectionHost.append(this.renderSelectionCard(selected[0]));
      this.hintHost.textContent = this.getContextHint(selected);
    } else {
      const wrapper = document.createElement("div");
      wrapper.className = "selection-summary";
      wrapper.innerHTML = `
        <div class="selection-title">${selected.length} units ready</div>
        <div class="selection-meta">Double-click to grab a whole troop type. Click a roster chip below to filter the current group.</div>
      `;
      this.selectionHost.append(wrapper);
      this.hintHost.textContent = this.getContextHint(selected);
      this.renderSelectionRoster(selected);
    }

    const actions = this.getAvailableActions(selected);
    const actionSignature = this.getActionSignature(selected, player, actions);
    this.renderActionsPanel(actionSignature, actions);
    this.renderQueuePanel(selected);
    this.renderSidebar(selected, actions);
    this.drawMinimap();
  }

  private getCommandLabel(): string {
    const sessionState = this.session.getSessionState();
    if (sessionState.buildMode) {
      return `Build: ${BUILDING_DEFINITIONS[sessionState.buildMode].label}`;
    }
    switch (sessionState.commandMode) {
      case "move":
        return "Move Mode";
      case "gather":
        return "Gather Mode";
      case "attack":
        return "Attack Mode";
      case "rally":
        return "Rally Mode";
      default:
        return "Context";
    }
  }

  private getEconomySummary(): string {
    const entities = Object.values(this.session.getWorld().entities)
      .filter((entity): entity is UnitEntity => entity.kind === "unit" && entity.playerId === "player");
    const workers = entities.filter((entity) => UNIT_DEFINITIONS[entity.unitType].tags.includes("worker"));
    const resourceCounts = {
      food: 0,
      timber: 0,
      stone: 0,
      iron: 0,
    };
    let idleWorkers = 0;

    for (const worker of workers) {
      if (worker.order.type === "idle") {
        idleWorkers += 1;
        continue;
      }
      if (worker.order.type === "gather") {
        const target = this.session.getWorld().entities[worker.order.targetId];
        if (target?.kind === "resource") {
          resourceCounts[target.resourceType] += 1;
        } else {
          idleWorkers += 1;
        }
      }
    }

    return [
      `Workers ${workers.length}`,
      `Idle ${idleWorkers}`,
      `Food ${resourceCounts.food}`,
      `Wood ${resourceCounts.timber}`,
      `Stone ${resourceCounts.stone}`,
      `Iron ${resourceCounts.iron}`,
      `Army ${entities.length - workers.length}`,
    ].join(" | ");
  }

  private getContextHint(selected: Entity[]): string {
    const sessionState = this.session.getSessionState();
    if (sessionState.buildMode) {
      return `Build mode: ${BUILDING_DEFINITIONS[sessionState.buildMode].label}. Left click to place, Escape to cancel.`;
    }
    if (sessionState.commandMode) {
      return `${this.getCommandLabel()} armed. Left click the battlefield to place that order.`;
    }
    if (selected.length > 1) {
      const workerPresent = selected.some((entity) => entity.kind === "unit" && UNIT_DEFINITIONS[entity.unitType].tags.includes("worker"));
      return workerPresent
        ? "Mixed group selected. Command cards include movement plus worker construction."
        : "Troop group selected. Use the Command Palette or right click to move, patrol, and stop.";
    }
    const single = selected[0];
    if (single.kind === "unit") {
      return UNIT_DEFINITIONS[single.unitType].tags.includes("worker")
        ? "Workers use the Command Palette below. Tasking buttons auto-assign resources, and Construction buttons arm building placement."
        : "Troops respond best to right click context orders or Attack from the Command Palette.";
    }
    return "Production buildings show queue progress here. Use the Command Palette to train, research, and set rally points.";
  }

  private renderActionsPanel(signature: string, actions: ActionDescriptor[]): void {
    if (signature === this.lastActionSignature) {
      return;
    }

    this.actionsHost.innerHTML = "";
    this.actionsHost.className = "command-palette";
    if (actions.length === 0) {
      this.actionsHost.innerHTML = `
        <div class="action-empty">
          <strong>Command Palette</strong>
          <span>Select a worker, troop, or building to open grouped order, task, build, training, and research buttons.</span>
        </div>
      `;
      this.lastActionSignature = signature;
      return;
    }

    const groups = new Map<string, ActionDescriptor[]>();
    for (const action of actions) {
      const group = action.categoryLabel ?? "Commands";
      if (!groups.has(group)) {
        groups.set(group, []);
      }
      groups.get(group)?.push(action);
    }

    for (const [groupLabel, groupActions] of groups) {
      const section = document.createElement("section");
      section.className = "palette-section";
      section.dataset.testid = `palette-${groupLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
      section.innerHTML = `
        <div class="palette-header">
          <span class="palette-title">${groupLabel}</span>
          <span class="palette-count">${groupActions.length}</span>
        </div>
      `;
      const grid = document.createElement("div");
      grid.className = "command-grid palette-grid";
      for (const action of groupActions) {
        grid.append(this.createActionButton(action));
      }
      section.append(grid);
      this.actionsHost.append(section);
    }
    this.lastActionSignature = signature;
  }

  private getActionSignature(selected: Entity[], player: ReturnType<GameSession["getWorld"]>["players"]["player"], actions: ActionDescriptor[]): string {
    const selectionSignature = selected.map((entity) => {
      if (entity.kind === "unit") {
        return `u:${entity.id}:${entity.unitType}`;
      }
      if (entity.kind === "building") {
        return `b:${entity.id}:${entity.buildingType}:${entity.completed}:${entity.queue.map((item) => item.id).join(",")}`;
      }
      return `r:${entity.id}`;
    }).join("|");
    const actionSignature = actions.map((action) => `${action.testId}:${action.disabled ? "0" : "1"}`).join("|");
    const researched = Object.keys(player.research)
      .filter((researchId) => player.research[researchId as ResearchId])
      .join(",");
    return [
      selectionSignature || "none",
      actionSignature || "none",
      player.age,
      Math.floor(player.resources.food),
      Math.floor(player.resources.timber),
      Math.floor(player.resources.stone),
      Math.floor(player.resources.iron),
      `${player.populationUsed}/${player.populationCap}`,
      researched,
    ].join("|");
  }

  private renderOverlay(outcome: "ongoing" | "playerVictory" | "playerDefeat", paused: boolean, age: Age, elapsedMs: number): void {
    if (outcome === "ongoing" && !paused) {
      this.overlay.hidden = true;
      this.overlay.innerHTML = "";
      return;
    }

    const isOutcome = outcome !== "ongoing";
    const world = this.session.getWorld();
    const faction = getFactionDefinition(world.players.player.faction);
    const mapLabel = getMapDefinition(world.map.preset).label;
    const title = outcome === "playerVictory"
      ? `Victory at ${mapLabel}`
      : outcome === "playerDefeat"
        ? `${faction.label} Defeated`
        : world.scenario === "tutorial"
          ? "Tutorial Paused"
          : "Skirmish Paused";
    const summary = outcome === "playerVictory"
      ? `The enemy host is broken on ${mapLabel}. Regroup your woodland fighters and press the advantage.`
      : outcome === "playerDefeat"
        ? `The ${faction.label} line collapsed. Re-form the opening and try a different composition or map.`
        : world.scenario === "tutorial"
          ? "Orders are suspended. Review the current objective in the sidebar, then resume the drill when ready."
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
      const definition = getFactionAdjustedUnitDefinition(this.session.getWorld().players[entity.playerId].faction, UNIT_DEFINITIONS[entity.unitType]);
      const cargo = entity.carry ? `${formatLabel(entity.carry.type)} ${Math.round(entity.carry.amount)}` : "None";
      card.innerHTML = `
        <div class="selection-hero">
          <div class="portrait-badge">${getEntityBadge(entity)}</div>
          <div>
            <div class="selection-title" data-testid="selection-name">${definition.label}</div>
            <div class="selection-meta">${formatLabel(entity.order.type)}</div>
          </div>
        </div>
        <div class="selection-detail-grid">
          <div><span>HP</span><strong>${Math.round(entity.hp)}/${entity.maxHp}</strong></div>
          <div><span>Attack</span><strong>${definition.attackDamage}</strong></div>
          <div><span>Armor</span><strong>${definition.armor ?? 0}</strong></div>
          <div><span>Speed</span><strong>${definition.speed.toFixed(2)}</strong></div>
        </div>
        <div class="selection-health">Carry: ${cargo}</div>
      `;
      return card;
    }

    if (entity.kind === "building") {
      const definition = BUILDING_DEFINITIONS[entity.buildingType];
      const footprint = `${definition.footprint.x}x${definition.footprint.y}`;
      const output = definition.production?.length ? `${definition.production.length} options` : "No queue";
      card.innerHTML = `
        <div class="selection-hero">
          <div class="portrait-badge portrait-building">${getEntityBadge(entity)}</div>
          <div>
            <div class="selection-title" data-testid="selection-name">${definition.label}</div>
            <div class="selection-meta">${entity.completed ? "Operational" : "Under construction"}</div>
          </div>
        </div>
        <div class="selection-detail-grid">
          <div><span>HP</span><strong>${Math.round(entity.hp)}/${entity.maxHp}</strong></div>
          <div><span>Size</span><strong>${footprint}</strong></div>
          <div><span>Range</span><strong>${definition.attackRange ? definition.attackRange.toFixed(1) : "-"}</strong></div>
          <div><span>Output</span><strong>${output}</strong></div>
        </div>
      `;
      card.append(this.renderBuildingWorkState(entity));
      return card;
    }

    card.innerHTML = `
      <div class="selection-hero">
        <div class="portrait-badge">${getEntityBadge(entity)}</div>
        <div>
          <div class="selection-title" data-testid="selection-name">${formatLabel(entity.resourceType)}</div>
          <div class="selection-meta">Resource</div>
        </div>
      </div>
      <div class="selection-health">${entity.amount}/${entity.maxAmount} remaining</div>
    `;
    return card;
  }

  private renderSelectionRoster(selected: Entity[]): void {
    const groups = new Map<string, { label: string; ids: string[] }>();
    for (const entity of selected) {
      const key = entity.kind === "unit" ? `unit:${entity.unitType}` : entity.kind === "building" ? `building:${entity.buildingType}` : `resource:${entity.resourceType}`;
      const label = entity.kind === "unit"
        ? UNIT_DEFINITIONS[entity.unitType].label
        : entity.kind === "building"
          ? BUILDING_DEFINITIONS[entity.buildingType].label
          : formatLabel(entity.resourceType);
      if (!groups.has(key)) {
        groups.set(key, { label, ids: [] });
      }
      groups.get(key)?.ids.push(entity.id);
    }

    for (const group of groups.values()) {
      const button = document.createElement("button");
      button.className = "selection-roster-button";
      button.textContent = `${group.ids.length}x ${group.label}`;
      button.addEventListener("click", () => {
        this.session.setSelection(group.ids);
      });
      this.selectionRosterHost.append(button);
    }
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

  private renderQueuePanel(selected: Entity[]): void {
    this.queueHost.innerHTML = "";

    if (selected.length !== 1 || selected[0].kind !== "building") {
      this.queueSummaryHost.textContent = selected.length > 1 ? `${selected.length} units in the group` : "Select a production building";
      const note = document.createElement("div");
      note.className = "queue-entry";
      note.innerHTML = `
        <div class="queue-entry-title">Command Tips</div>
        <div class="queue-entry-meta">Double-click troops for same-type selection. Click the minimap to snap the camera. Use QWER / ASDF / ZXCV on the Command Palette.</div>
      `;
      this.queueHost.append(note);
      return;
    }

    const building = selected[0];
    this.queueSummaryHost.textContent = building.completed
      ? (building.queue.length > 0 ? `${building.queue.length} queued` : "Idle")
      : "Construction";

    if (!building.completed) {
      this.queueHost.append(this.createProgressBlock(
        "Construction",
        `${Math.round((building.buildProgressMs / Math.max(1, BUILDING_DEFINITIONS[building.buildingType].buildTimeMs)) * 100)}%`,
        building.buildProgressMs / Math.max(1, BUILDING_DEFINITIONS[building.buildingType].buildTimeMs),
        `${formatDuration(BUILDING_DEFINITIONS[building.buildingType].buildTimeMs - building.buildProgressMs)} remaining`,
      ));
      return;
    }

    if (building.queue.length === 0) {
      const note = document.createElement("div");
      note.className = "queue-entry";
      note.innerHTML = `
        <div class="queue-entry-title">Queue Empty</div>
        <div class="queue-entry-meta">Set a rally point or start training from the Command Palette. Current rally: ${building.rallyPoint.x}, ${building.rallyPoint.y}</div>
      `;
      this.queueHost.append(note);
      return;
    }

    building.queue.forEach((item, index) => {
      const entry = document.createElement("div");
      entry.className = `queue-entry${index === 0 ? " active" : ""}`;
      const totalMs = Math.max(1, getQueuedItemTotalMs(item));
      const progress = Math.min(1, Math.max(0, (totalMs - item.remainingMs) / totalMs));
      entry.innerHTML = `
        <div class="queue-entry-title">${index === 0 ? "Active" : `Queued ${index}`}: ${getQueuedItemLabel(item)}</div>
        <div class="queue-entry-meta">${item.kind === "research" ? "Research" : item.kind === "age" ? "Age Up" : "Training"} · ${formatDuration(item.remainingMs)} remaining</div>
      `;
      if (index === 0) {
        const track = document.createElement("div");
        track.className = "progress-track";
        track.innerHTML = `<div class="progress-fill" style="width: ${Math.max(4, progress * 100)}%"></div>`;
        entry.append(track);
      }
      this.queueHost.append(entry);
    });
  }

  private renderSidebar(selected: Entity[], actions: ActionDescriptor[]): void {
    const world = this.session.getWorld();
    const playerFaction = getFactionDefinition(world.players.player.faction);
    const tutorialState = getTutorialState(world, selected);
    const focusedAction = this.resolveFocusedAction(actions);
    const sessionState = this.session.getSessionState();
    const selectedEntity = selected.length === 1 ? selected[0] : undefined;

    if (selected.length === 0 && !sessionState.buildMode && !sessionState.commandMode) {
      this.sidebarHost.innerHTML = `
        <div class="sidebar-shell">
          <div class="sidebar-header">
            <div class="panel-heading">Right Sidebar</div>
            <span class="dock-kicker">Field Manual</span>
          </div>
          <div class="sidebar-card">
            <h3 data-testid="sidebar-title">${playerFaction.label} Advisor</h3>
            <p class="sidebar-copy" data-testid="sidebar-summary">${
              world.scenario === "tutorial"
                ? "The guided drill is active. Select a worker, follow the objective list below, and use the Command Palette to learn the opening flow."
                : `Select a worker to open the full building list, or select a production building to see ${playerFaction.label} training, upgrade, and age-up requirements in detail.`
            }</p>
          </div>
          ${this.getSidebarGuidanceCard(world.scenario === "tutorial", tutorialState)}
        </div>
      `;
      return;
    }

    const selectionTitle = selected.length > 1
      ? `${selected.length} Units Selected`
      : selectedEntity?.kind === "unit"
        ? UNIT_DEFINITIONS[selectedEntity.unitType].label
        : selectedEntity?.kind === "building"
          ? BUILDING_DEFINITIONS[selectedEntity.buildingType].label
          : selectedEntity
            ? formatLabel(selectedEntity.resourceType)
            : "Selection";
    const selectionSummary = this.getContextHint(selected);
    const selectedActionSummary = focusedAction?.description
      ?? (sessionState.buildMode
        ? `Build mode is armed for ${BUILDING_DEFINITIONS[sessionState.buildMode].label}.`
        : sessionState.commandMode
          ? `${this.getCommandLabel()} is armed.`
          : "Hover or focus a Command Palette button to inspect it here.");

    const sidebar = document.createElement("div");
    sidebar.className = "sidebar-shell";
    sidebar.innerHTML = `
      <div class="sidebar-header">
        <div class="panel-heading">Right Sidebar</div>
        <span class="dock-kicker">${focusedAction?.categoryLabel ?? "Selection Detail"}</span>
      </div>
      <div class="sidebar-card">
        <div class="sidebar-label">Current Selection</div>
        <h3 data-testid="sidebar-title">${selectionTitle}</h3>
        <p class="sidebar-copy" data-testid="sidebar-summary">${selectionSummary}</p>
      </div>
      <div class="sidebar-card">
        <div class="sidebar-label">Current Task</div>
        <h3 data-testid="sidebar-action-title">${focusedAction?.label ?? this.getCommandLabel()}</h3>
        <p class="sidebar-copy" data-testid="sidebar-action-summary">${selectedActionSummary}</p>
        <div class="sidebar-meta" data-testid="sidebar-action-meta"></div>
        <p class="sidebar-status" data-testid="sidebar-status"></p>
      </div>
      <div class="sidebar-card">
        <div class="sidebar-label">Available Now</div>
        <div class="sidebar-action-list" data-testid="sidebar-action-list"></div>
      </div>
    `;
    this.sidebarHost.innerHTML = "";
    this.sidebarHost.append(sidebar);

    const metaHost = this.sidebarHost.querySelector("[data-testid='sidebar-action-meta']") as HTMLDivElement;
    const statusHost = this.sidebarHost.querySelector("[data-testid='sidebar-status']") as HTMLParagraphElement;
    const actionListHost = this.sidebarHost.querySelector("[data-testid='sidebar-action-list']") as HTMLDivElement;

    const rows = focusedAction?.detailRows ?? this.getSelectionDetailRows(selected);
    for (const row of rows) {
      const item = document.createElement("div");
      item.className = "sidebar-meta-row";
      item.innerHTML = `<span>${row.label}</span><strong>${row.value}</strong>`;
      metaHost.append(item);
    }

    statusHost.textContent = focusedAction?.disabledReason
      ? `Unavailable: ${focusedAction.disabledReason}`
      : sessionState.buildMode && focusedAction?.tone === "build"
        ? "Placement armed: left click the battlefield to place this structure."
        : sessionState.commandMode && focusedAction?.tone === "command"
          ? "Command armed: left click the battlefield to issue this order."
          : focusedAction
            ? "Ready now."
            : "Inspect the options below to plan the next step.";

    const previewActions = actions.length > 0 ? actions.slice(0, 6) : [];
    for (const action of previewActions) {
      const button = document.createElement("button");
      button.className = `sidebar-action-chip${focusedAction?.testId === action.testId ? " active" : ""}`;
      button.dataset.testid = `sidebar-chip-${action.testId}`;
      button.innerHTML = `
        <span>${action.label}</span>
        <strong>${action.hotkeyLabel ?? "-"}</strong>
      `;
      button.addEventListener("click", () => {
        this.actionFocusId = action.testId;
        this.renderSidebar(selected, actions);
      });
      actionListHost.append(button);
    }

    if (previewActions.length === 0) {
      actionListHost.innerHTML = `<p class="sidebar-copy">No direct actions are available for this selection yet.</p>`;
    }

    if (world.scenario === "tutorial" && tutorialState) {
      this.sidebarHost.append(this.renderTutorialCard(tutorialState));
    }
  }

  private getSidebarGuidanceCard(isTutorial: boolean, tutorialState: ReturnType<typeof getTutorialState>): string {
    if (isTutorial && tutorialState) {
      return `
        <div class="sidebar-card tutorial-card" data-testid="tutorial-panel">
          <div class="sidebar-section-title">Tutorial Objectives</div>
          <div class="sidebar-status" data-testid="tutorial-progress">${tutorialState.steps.filter((step) => step.completed).length}/${tutorialState.steps.length} completed</div>
          <p class="sidebar-copy" data-testid="tutorial-current-step">${
            tutorialState.completed
              ? "Opening drill completed. Finish the tutorial from the top bar to unlock the next Chronicle content."
              : `${tutorialState.currentStep?.label}: ${tutorialState.currentStep?.description}`
          }</p>
        </div>
      `;
    }
    return `
      <div class="sidebar-card">
        <div class="sidebar-section-title">Build Flow</div>
        <ol class="sidebar-steps">
          <li>Select one or more workers.</li>
          <li>Read the Command Palette or this sidebar for building costs and unlock age.</li>
          <li>Click a build card, then left click the battlefield to place it.</li>
          <li>Use Esc to cancel if you change your mind.</li>
        </ol>
      </div>
    `;
  }

  private renderTutorialCard(tutorialState: NonNullable<ReturnType<typeof getTutorialState>>): HTMLDivElement {
    const card = document.createElement("div");
    card.className = "sidebar-card tutorial-card";
    card.dataset.testid = "tutorial-panel";
    const completedCount = tutorialState.steps.filter((step) => step.completed).length;
    const items = tutorialState.steps.map((step) => `
      <li class="${step.completed ? "tutorial-step complete" : "tutorial-step"}">${step.label}</li>
    `).join("");
    card.innerHTML = `
      <div class="sidebar-label">Tutorial Objectives</div>
      <h3 data-testid="tutorial-progress">${completedCount}/${tutorialState.steps.length} completed</h3>
      <p class="sidebar-copy" data-testid="tutorial-current-step">${
        tutorialState.completed
          ? "Opening drill completed. Finish the tutorial to unlock Abbey Orchard and the Riverfolk Collective."
          : `${tutorialState.currentStep?.label}: ${tutorialState.currentStep?.description}`
      }</p>
      <ol class="sidebar-steps tutorial-step-list">${items}</ol>
    `;
    return card;
  }

  private resolveFocusedAction(actions: ActionDescriptor[]): ActionDescriptor | undefined {
    if (actions.length === 0) {
      this.actionFocusId = undefined;
      return undefined;
    }
    const sessionState = this.session.getSessionState();
    const preferredId = this.actionFocusId
      ?? (sessionState.buildMode ? `action-build-${sessionState.buildMode}` : undefined)
      ?? (sessionState.commandMode === "move"
        ? "action-mode-move"
        : sessionState.commandMode === "gather"
          ? "action-mode-gather"
          : sessionState.commandMode === "attack"
            ? "action-mode-attack"
            : sessionState.commandMode === "rally"
              ? "action-mode-rally"
              : undefined);
    const explicit = preferredId ? actions.find((action) => action.testId === preferredId) : undefined;
    if (explicit) {
      this.actionFocusId = explicit.testId;
      return explicit;
    }
    const defaultAction = actions.find((action) => !action.disabled && action.tone === "build")
      ?? actions.find((action) => !action.disabled && action.tone === "train")
      ?? actions.find((action) => !action.disabled && action.tone === "research")
      ?? actions.find((action) => !action.disabled)
      ?? actions[0];
    this.actionFocusId = defaultAction.testId;
    return defaultAction;
  }

  private getSelectionDetailRows(selected: Entity[]): Array<{ label: string; value: string }> {
    if (selected.length !== 1) {
      return [{ label: "Units", value: `${selected.length}` }];
    }
    const entity = selected[0];
    if (entity.kind === "unit") {
      const definition = getFactionAdjustedUnitDefinition(this.session.getWorld().players[entity.playerId].faction, UNIT_DEFINITIONS[entity.unitType]);
      return [
        { label: "HP", value: `${Math.round(entity.hp)}/${entity.maxHp}` },
        { label: "Attack", value: `${definition.attackDamage}` },
        { label: "Armor", value: `${definition.armor ?? 0}` },
        { label: "Speed", value: `${definition.speed.toFixed(2)}` },
      ];
    }
    if (entity.kind === "building") {
      const definition = BUILDING_DEFINITIONS[entity.buildingType];
      return [
        { label: "HP", value: `${Math.round(entity.hp)}/${entity.maxHp}` },
        { label: "Size", value: formatFootprint(entity.buildingType) },
        { label: "Queue", value: `${entity.queue.length}` },
        { label: "Age", value: formatAge(definition.age) },
      ];
    }
    return [{ label: "Remaining", value: `${entity.amount}` }];
  }

  private getAvailableActions(selected: Entity[]): ActionDescriptor[] {
    const player = this.session.getWorld().players.player;
    const actions: ActionDescriptor[] = [];

    if (selected.length === 0) {
      return actions;
    }

    if (selected.length === 1 && selected[0].kind === "building") {
      this.appendBuildingActions(actions, selected[0], player);
      return this.assignGridHotkeys(actions);
    }

    const units = selected.filter((entity): entity is UnitEntity => entity.kind === "unit");
    if (units.length === 0) {
      return actions;
    }

    const hasWorkers = units.some((unit) => UNIT_DEFINITIONS[unit.unitType].tags.includes("worker"));
    actions.push(
      {
        label: "Move",
        testId: units.length === 1 ? "action-mode-move" : "action-group-move",
        action: () => this.session.setCommandMode("move"),
        detail: "Ground order",
        tone: "command",
        categoryLabel: "Orders",
        description: "Moves the selected units to a ground point without forcing attacks on the way.",
        detailRows: [
          { label: "Use", value: "Left click ground" },
          { label: "Hotkey", value: "Q" },
        ],
      },
      {
        label: "Gather",
        testId: units.length === 1 ? "action-mode-gather" : "action-group-gather",
        action: () => this.session.setCommandMode("gather"),
        detail: hasWorkers ? "Resource order" : "Requires worker",
        disabled: !hasWorkers,
        disabledReason: !hasWorkers ? "Only workers can gather resources." : undefined,
        tone: "command",
        categoryLabel: "Orders",
        description: "Orders selected workers to gather from a resource node and return it to the nearest drop-off.",
        detailRows: [
          { label: "Use", value: "Left click resource" },
          { label: "Hotkey", value: "W" },
        ],
      },
      {
        label: "Attack",
        testId: units.length === 1 ? "action-mode-attack" : "action-group-attack",
        action: () => this.session.setCommandMode("attack"),
        detail: "Attack order",
        tone: "command",
        categoryLabel: "Orders",
        description: "Orders selected troops to attack an enemy target directly, or attack-move toward a ground destination if you click open terrain.",
        detailRows: [
          { label: "Use", value: "Left click ground or enemy" },
          { label: "Hotkey", value: "E" },
        ],
      },
      {
        label: "Stop",
        testId: units.length === 1 ? "action-stop" : "action-group-stop",
        action: () => {
          this.session.issueCommand({ type: "stop", unitIds: units.map((unit) => unit.id) });
        },
        detail: "Cancel orders",
        tone: "command",
        categoryLabel: "Orders",
        description: "Clears the current orders so the selected units return to an idle state.",
        detailRows: [
          { label: "Use", value: "Instant" },
          { label: "Hotkey", value: "R" },
        ],
      },
    );

    if (hasWorkers) {
      const workerUnits = units.filter((unit) => UNIT_DEFINITIONS[unit.unitType].tags.includes("worker"));
      actions.push(
        this.createTaskingAction(workerUnits, "food", "Forage", "Sends the selected workers to the nearest food patch."),
        this.createTaskingAction(workerUnits, "timber", "Lumber", "Sends the selected workers to the nearest timber stand."),
        this.createTaskingAction(workerUnits, "stone", "Quarry", "Sends the selected workers to the nearest stone outcrop."),
        this.createTaskingAction(workerUnits, "iron", "Mine", "Sends the selected workers to the nearest iron seam."),
      );

      const buildingOptions: BuildingType[] = [
        "dormitory",
        "storehouse",
        "granary",
        "barracks",
        "range",
        "blacksmith",
        "tower",
        "wall",
        "gate",
        "longPatrolLodge",
        "workshop",
      ];
      for (const buildingType of buildingOptions) {
        const definition = BUILDING_DEFINITIONS[buildingType];
        const unlocked = isAgeUnlocked(player.age, definition.age);
        const affordable = bagHasCost(player.resources, definition.cost);
        actions.push({
          label: definition.label,
          testId: `action-build-${buildingType}`,
          action: () => this.session.setBuildMode(buildingType),
          detail: formatDuration(definition.buildTimeMs),
          cost: definition.cost,
          disabled: !unlocked || !affordable,
          disabledReason: !unlocked ? `${definition.label} unlocks in ${formatAge(definition.age)}.` : !affordable ? "Not enough resources." : undefined,
          tone: "build",
          categoryLabel: "Construction",
          description: getBuildingDescription(buildingType),
          detailRows: [
            { label: "Cost", value: formatCost(definition.cost) || "Free" },
            { label: "Build", value: formatDuration(definition.buildTimeMs) },
            { label: "Age", value: formatAge(definition.age) },
            { label: "Size", value: formatFootprint(buildingType) },
          ],
        });
      }
    }

    return this.assignGridHotkeys(actions);
  }

  private createTaskingAction(
    workers: UnitEntity[],
    resourceType: ResourceType,
    label: string,
    description: string,
  ): ActionDescriptor {
    const targetId = this.findNearestResourceTarget(workers, resourceType);
    return {
      label,
      testId: `action-task-${resourceType}`,
      action: () => {
        const currentTarget = this.findNearestResourceTarget(workers, resourceType);
        if (!currentTarget) {
          return;
        }
        this.session.issueCommand({
          type: "gather",
          unitIds: workers.map((worker) => worker.id),
          targetId: currentTarget,
        });
      },
      detail: `Nearest ${formatResourceLabel(resourceType)}`,
      disabled: !targetId,
      disabledReason: !targetId ? `No ${formatResourceLabel(resourceType).toLowerCase()} node is currently available.` : undefined,
      tone: "task",
      categoryLabel: "Tasking",
      description,
      detailRows: [
        { label: "Target", value: formatResourceLabel(resourceType) },
        { label: "Use", value: "Direct task button" },
      ],
    };
  }

  private findNearestResourceTarget(workers: UnitEntity[], resourceType: ResourceType): string | undefined {
    if (workers.length === 0) {
      return undefined;
    }
    let bestId: string | undefined;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const entity of Object.values(this.session.getWorld().entities)) {
      if (entity.kind !== "resource" || entity.resourceType !== resourceType || entity.amount <= 0) {
        continue;
      }
      const distance = workers.reduce((closest, worker) => {
        const currentDistance = Math.hypot(entity.tile.x - worker.position.x, entity.tile.y - worker.position.y);
        return Math.min(closest, currentDistance);
      }, Number.POSITIVE_INFINITY);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestId = entity.id;
      }
    }
    return bestId;
  }

  private appendBuildingActions(
    actions: ActionDescriptor[],
    building: BuildingEntity,
    player: ReturnType<GameSession["getWorld"]>["players"]["player"],
  ): void {
    if (!building.completed) {
      return;
    }

    actions.push({
      label: "Set Rally",
      testId: "action-mode-rally",
      action: () => this.session.setCommandMode("rally"),
      detail: `${building.rallyPoint.x}, ${building.rallyPoint.y}`,
      tone: "command",
      categoryLabel: "Orders",
      description: "Changes where freshly trained units leave the building and head after spawning.",
      detailRows: [
        { label: "Rally", value: `${building.rallyPoint.x}, ${building.rallyPoint.y}` },
        { label: "Hotkey", value: "Q" },
      ],
    });

    if (building.buildingType === "abbeyHall") {
      actions.push(
        this.createTrainAction(building, player, "worker"),
        this.createTrainAction(building, player, "shrewScout"),
        this.createAgeAction(building, player, "abbey"),
        this.createAgeAction(building, player, "warhost"),
      );
    }

    if (building.buildingType === "barracks") {
      actions.push(this.createTrainAction(building, player, "militia"), this.createTrainAction(building, player, "shieldbearer"));
    }
    if (building.buildingType === "range") {
      actions.push(
        this.createTrainAction(building, player, "slinger"),
        this.createTrainAction(building, player, "archer"),
        this.createTrainAction(building, player, "otterSkirmisher"),
      );
    }
    if (building.buildingType === "longPatrolLodge") {
      actions.push(this.createTrainAction(building, player, "hareRunner"), this.createTrainAction(building, player, "badgerChampion"));
    }
    if (building.buildingType === "workshop") {
      actions.push(this.createTrainAction(building, player, "ramCart"));
    }
    if (building.buildingType === "granary") {
      actions.push(this.createResearchAction(building, player, "woodcraft"));
    }
    if (building.buildingType === "blacksmith") {
      const researchIds: ResearchId[] = ["stoneMasonry", "ironforging", "leatherwork", "towerGuard", "hareDrills"];
      actions.push(...researchIds.map((researchId) => this.createResearchAction(building, player, researchId)));
    }
  }

  private createTrainAction(
    building: BuildingEntity,
    player: ReturnType<GameSession["getWorld"]>["players"]["player"],
    unitType: UnitType,
  ): ActionDescriptor {
    const definition = getFactionAdjustedUnitDefinition(player.faction, UNIT_DEFINITIONS[unitType]);
    const unlocked = isAgeUnlocked(player.age, definition.age);
    const affordable = bagHasCost(player.resources, definition.cost);
    const queuedUnits = getPlayerQueuedUnits(this.session);
    const popAvailable = player.populationUsed + queuedUnits < player.populationCap;
    return {
      label: definition.label,
      testId: `action-train-${unitType}`,
      action: () => {
        this.session.issueCommand({ type: "train", buildingId: building.id, unitType });
      },
      detail: formatDuration(definition.trainTimeMs),
      cost: definition.cost,
      disabled: !unlocked || !affordable || !popAvailable,
      disabledReason: !unlocked
        ? `${definition.label} requires ${formatAge(definition.age)}.`
        : !affordable
          ? "Not enough resources."
          : !popAvailable
            ? "Need more population room."
            : undefined,
      tone: "train",
      categoryLabel: "Training",
      description: getUnitDescription(unitType),
      detailRows: [
        { label: "Cost", value: formatCost(definition.cost) || "Free" },
        { label: "Train", value: formatDuration(definition.trainTimeMs) },
        { label: "HP", value: `${definition.hp}` },
        { label: "Attack", value: `${definition.attackDamage}` },
      ],
    };
  }

  private createResearchAction(
    building: BuildingEntity,
    player: ReturnType<GameSession["getWorld"]>["players"]["player"],
    researchId: ResearchId,
  ): ActionDescriptor {
    const definition = RESEARCH_DEFINITIONS[researchId];
    const alreadyQueued = building.queue.some((item) => item.id === researchId);
    const unlocked = isAgeUnlocked(player.age, definition.age);
    const affordable = bagHasCost(player.resources, definition.cost);
    const complete = Boolean(player.research[researchId]);
    return {
      label: definition.label,
      testId: `action-research-${researchId}`,
      action: () => {
        this.session.issueCommand({ type: "research", buildingId: building.id, researchId });
      },
      detail: formatDuration(definition.researchTimeMs),
      cost: definition.cost,
      disabled: complete || alreadyQueued || !unlocked || !affordable,
      disabledReason: complete
        ? "Already researched."
        : alreadyQueued
          ? "Already in queue."
          : !unlocked
            ? `Requires ${formatAge(definition.age)}.`
            : !affordable
              ? "Not enough resources."
              : undefined,
      tone: "research",
      categoryLabel: "Research",
      description: getResearchDescription(researchId),
      detailRows: [
        { label: "Cost", value: formatCost(definition.cost) || "Free" },
        { label: "Time", value: formatDuration(definition.researchTimeMs) },
        { label: "Age", value: formatAge(definition.age) },
        { label: "Site", value: BUILDING_DEFINITIONS[building.buildingType].label },
      ],
    };
  }

  private createAgeAction(
    building: BuildingEntity,
    player: ReturnType<GameSession["getWorld"]>["players"]["player"],
    nextAge: Age,
  ): ActionDescriptor {
    const researchId = nextAge === "abbey" ? "abbeyAge" : "warhostAge";
    const definition = RESEARCH_DEFINITIONS[researchId];
    const alreadyQueued = building.queue.some((item) => item.id === nextAge);
    const alreadyAtAge = AGE_ORDER.indexOf(player.age) >= AGE_ORDER.indexOf(nextAge);
    const affordable = bagHasCost(player.resources, definition.cost);
    return {
      label: nextAge === "abbey" ? "Advance to Abbey" : "Advance to Warhost",
      testId: nextAge === "abbey" ? "action-age-abbey" : "action-age-warhost",
      action: () => {
        this.session.issueCommand({ type: "ageUp", buildingId: building.id, nextAge });
      },
      detail: formatDuration(definition.researchTimeMs),
      cost: definition.cost,
      disabled: alreadyAtAge || alreadyQueued || !affordable,
      disabledReason: alreadyAtAge
        ? `${formatAge(nextAge)} already reached.`
        : alreadyQueued
          ? "Age up already in queue."
          : !affordable
            ? "Not enough resources."
            : undefined,
      tone: "age",
      categoryLabel: "Age Advancement",
      description: definition.grants.join(" "),
      detailRows: [
        { label: "Cost", value: formatCost(definition.cost) || "Free" },
        { label: "Time", value: formatDuration(definition.researchTimeMs) },
        { label: "Next Age", value: formatAge(nextAge) },
        { label: "Hall", value: BUILDING_DEFINITIONS[building.buildingType].label },
      ],
    };
  }

  private assignGridHotkeys(actions: ActionDescriptor[]): ActionDescriptor[] {
    return actions.map((action, index) => {
      const hotkey = ACTION_GRID_HOTKEYS[index];
      return hotkey
        ? { ...action, hotkeyLabel: hotkey.label, hotkeyCode: hotkey.code }
        : action;
    });
  }

  private createActionButton(action: ActionDescriptor): HTMLButtonElement {
    const button = document.createElement("button");
	    button.className = `action-button${action.tone ? ` action-${action.tone}` : ""}`;
    button.dataset.testid = action.testId;
    button.disabled = Boolean(action.disabled);
    if (action.disabledReason) {
      button.title = action.disabledReason;
    }
    button.innerHTML = `
      <span class="action-card-top">
        <span class="action-title">${action.label}</span>
        ${action.hotkeyLabel ? `<span class="action-hotkey">${action.hotkeyLabel}</span>` : ""}
      </span>
      <span class="action-card-bottom">
        <span class="action-detail">${action.detail ?? ""}</span>
        <span class="action-cost">${formatCost(action.cost)}</span>
      </span>
    `;
    const syncSidebarFocus = () => {
      this.actionFocusId = action.testId;
      this.renderSidebar(this.session.getSelectedEntities(), this.getAvailableActions(this.session.getSelectedEntities()));
    };
    button.addEventListener("mouseenter", syncSidebarFocus);
    button.addEventListener("focus", syncSidebarFocus);
    button.addEventListener("click", () => {
      syncSidebarFocus();
      action.action();
    });
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
    const actions = this.getAvailableActions(selected);
    const hotkeyMatch = actions.find((action) => action.hotkeyCode === event.code && !action.disabled);
    if (hotkeyMatch) {
      event.preventDefault();
      hotkeyMatch.action();
    }
  }

  private handleMinimapClick(event: MouseEvent): void {
    const rect = this.minimapCanvas.getBoundingClientRect();
    const normalizedX = clamp((event.clientX - rect.left) / Math.max(1, rect.width), 0, 0.999);
    const normalizedY = clamp((event.clientY - rect.top) / Math.max(1, rect.height), 0, 0.999);
    const world = this.session.getWorld();
    this.options.onNavigateMinimap({
      x: Math.floor(normalizedX * world.map.width),
      y: Math.floor(normalizedY * world.map.height),
    });
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
        context.fillStyle = !explored ? "#08100f" : visible ? "#4c7750" : "#23372c";
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
      context.fillStyle = toCssHex(getFactionPalette(world.players[entity.playerId].faction, entity.playerId).main);
      const x = entity.kind === "unit" ? entity.position.x : entity.tile.x;
      const y = entity.kind === "unit" ? entity.position.y : entity.tile.y;
      context.fillRect(x * tileWidth, y * tileHeight, Math.max(2, tileWidth), Math.max(2, tileHeight));
    }

    const bounds = this.options.getVisibleTileBounds();
    if (bounds) {
      context.strokeStyle = "#f7e7b6";
      context.lineWidth = 2;
      context.strokeRect(
        bounds.minX * tileWidth,
        bounds.minY * tileHeight,
        Math.max(tileWidth * 1.5, (bounds.maxX - bounds.minX + 1) * tileWidth),
        Math.max(tileHeight * 1.5, (bounds.maxY - bounds.minY + 1) * tileHeight),
      );
    }
  }
}
