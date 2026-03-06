import { Simulation, TICK_MS } from "../core/simulation";
import { BUILDING_DEFINITIONS } from "../core/content";
import type {
  BuildingType,
  Difficulty,
  GameCommand,
  GameConfig,
  Outcome,
  SessionState,
  TilePoint,
  WorldState,
} from "../core/types";

type SessionListener = () => void;

export class GameSession {
  private readonly simulation: Simulation;
  private readonly listeners = new Set<SessionListener>();
  private sessionState: SessionState = {
    selectedIds: [],
    paused: false,
  };
  private animationFrame = 0;
  private accumulatorMs = 0;
  private lastFrameMs = 0;
  private started = false;
  private dirty = true;
  private readonly config: GameConfig;

  public constructor(config: GameConfig, world?: WorldState) {
    this.config = config;
    this.simulation = new Simulation(config, world);
  }

  public start(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    this.lastFrameMs = performance.now();
    this.animationFrame = window.requestAnimationFrame((timestamp) => this.loop(timestamp));
  }

  public destroy(): void {
    window.cancelAnimationFrame(this.animationFrame);
    this.started = false;
  }

  public subscribe(listener: SessionListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getWorld(): WorldState {
    return this.simulation.getWorld();
  }

  public getSnapshot(): WorldState {
    return this.simulation.getSnapshot();
  }

  public getSeed(): number {
    return this.config.seed;
  }

  public getDifficulty(): Difficulty {
    return this.config.difficulty;
  }

  public getElapsedMs(): number {
    return this.getWorld().elapsedMs;
  }

  public hasUnsavedChanges(): boolean {
    return this.dirty;
  }

  public markSaved(): void {
    this.dirty = false;
  }

  public getSessionState(): SessionState {
    return {
      selectedIds: [...this.sessionState.selectedIds],
      buildMode: this.sessionState.buildMode,
      commandMode: this.sessionState.commandMode,
      paused: this.sessionState.paused,
    };
  }

  public advanceTicks(count: number): void {
    this.simulation.advanceTicks(count);
    this.dirty = true;
    this.notify();
  }

  public issueCommand(command: GameCommand): boolean {
    const handled = this.simulation.issueCommand(command);
    if (command.type === "build" && handled) {
      this.sessionState.buildMode = undefined;
    }
    if (handled) {
      this.sessionState.commandMode = undefined;
      this.dirty = true;
      this.notify();
    }
    return handled;
  }

  public setSelection(ids: string[]): void {
    this.sessionState.selectedIds = ids.filter((id) => this.getWorld().entities[id] !== undefined);
    this.notify();
  }

  public clearSelection(): void {
    this.sessionState.selectedIds = [];
    this.notify();
  }

  public setBuildMode(buildingType?: BuildingType): void {
    if (buildingType && !BUILDING_DEFINITIONS[buildingType]) {
      return;
    }
    this.sessionState.buildMode = buildingType;
    if (buildingType) {
      this.sessionState.commandMode = undefined;
    }
    this.notify();
  }

  public setCommandMode(mode?: SessionState["commandMode"]): void {
    this.sessionState.commandMode = mode;
    if (mode) {
      this.sessionState.buildMode = undefined;
    }
    this.notify();
  }

  public setPaused(paused: boolean): void {
    this.sessionState.paused = paused;
    this.notify();
  }

  public getSelectedEntities() {
    return this.sessionState.selectedIds.map((id) => this.getWorld().entities[id]).filter(Boolean);
  }

  public selectUnitsInBox(from: TilePoint, to: TilePoint): void {
    const minX = Math.min(from.x, to.x);
    const maxX = Math.max(from.x, to.x);
    const minY = Math.min(from.y, to.y);
    const maxY = Math.max(from.y, to.y);
    const selected = Object.values(this.getWorld().entities)
      .filter((entity): entity is import("../core/types").UnitEntity => entity.kind === "unit" && entity.playerId === "player")
      .filter((entity) => entity.position.x >= minX && entity.position.x <= maxX && entity.position.y >= minY && entity.position.y <= maxY)
      .map((entity) => entity.id);
    this.setSelection(selected);
  }

  public getPlayerControllableIds(): string[] {
    return Object.values(this.getWorld().entities)
      .filter((entity) => entity.kind === "unit" && entity.playerId === "player")
      .map((entity) => entity.id);
  }

  public forceOutcome(outcome: Outcome): void {
    this.simulation.forceOutcome(outcome);
    this.dirty = true;
    this.notify();
  }

  private loop(timestamp: number): void {
    if (!this.started) {
      return;
    }
    const delta = Math.min(64, timestamp - this.lastFrameMs);
    this.lastFrameMs = timestamp;
    let changed = false;
    if (!this.sessionState.paused) {
      this.accumulatorMs += delta;
      while (this.accumulatorMs >= TICK_MS) {
        this.simulation.advanceTicks(1);
        this.dirty = true;
        this.accumulatorMs -= TICK_MS;
        changed = true;
      }
    }
    if (changed) {
      this.notify();
    }
    this.animationFrame = window.requestAnimationFrame((nextTimestamp) => this.loop(nextTimestamp));
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}
