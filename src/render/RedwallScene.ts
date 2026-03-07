import Phaser from "phaser";
import { BUILDING_DEFINITIONS, RESEARCH_DEFINITIONS, UNIT_DEFINITIONS } from "../core/content";
import { getFactionPalette } from "../core/factions";
import { tileIndex } from "../core/map";
import { evaluateBuildingPlacement, type PlacementBlockReason, type PlacementTileState } from "../core/simulation";
import type { BuildingEntity, BuildingType, Entity, PlayerId, ResourceType, TilePoint, UnitEntity, WorldState } from "../core/types";
import { GameSession } from "../app/GameSession";
import type { GameSettings } from "../persistence/storage";
import { getUnitAnimationState, type UnitAnimationState } from "./animation";
import { getBoxSelectionIds } from "./selection";

type Ping = { tile: TilePoint; ttlMs: number };
type TargetHighlightTone = "attack" | "gather";
type TargetIndicator = {
  id: string;
  tone: TargetHighlightTone;
  source: "issued" | "selected";
};
type BuildingPalette = {
  wall: number;
  roof: number;
  trim: number;
  accent: number;
  banner: number;
  shadow: number;
};
type UnitPalette = {
  fur: number;
  cloth: number;
  accent: number;
  metal: number;
  shadow: number;
};
type UnitSpecies = "mouse" | "shrew" | "otter" | "hare" | "badger" | "machine";
type DragPoint = {
  screenX: number;
  screenY: number;
  worldX: number;
  worldY: number;
};

type CanvasMetrics = {
  displayWidth: number;
  displayHeight: number;
  scaleX: number;
  scaleY: number;
};

type HoverPreviewKind =
  | "friendly"
  | "enemy"
  | "resource"
  | "move"
  | "attack-ground"
  | "gather-ground"
  | "rally"
  | "build-valid"
  | "build-invalid";

type HoverPreview = {
  kind: HoverPreviewKind;
  label: string;
  detail?: string;
  tile: TilePoint;
  entityId?: string;
  blockedReasons?: PlacementBlockReason[];
  tiles?: PlacementTileState[];
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function mixColor(base: number, target: number, amount: number): number {
  const ratio = clamp(amount, 0, 1);
  const baseRed = (base >> 16) & 0xff;
  const baseGreen = (base >> 8) & 0xff;
  const baseBlue = base & 0xff;
  const targetRed = (target >> 16) & 0xff;
  const targetGreen = (target >> 8) & 0xff;
  const targetBlue = target & 0xff;
  const red = Math.round(baseRed + (targetRed - baseRed) * ratio);
  const green = Math.round(baseGreen + (targetGreen - baseGreen) * ratio);
  const blue = Math.round(baseBlue + (targetBlue - baseBlue) * ratio);
  return (red << 16) | (green << 8) | blue;
}

function getUnitRenderSize(unit: UnitEntity): number {
  const species = getUnitSpecies(unit);
  if (species === "badger") {
    return 16;
  }
  if (species === "machine") {
    return 17;
  }
  if (species === "hare") {
    return 13;
  }
  if (species === "otter") {
    return 12;
  }
  if (species === "shrew") {
    return 10;
  }
  return 11;
}

function getResourceLabel(resourceType: ResourceType): string {
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
      return resourceType;
  }
}

function formatPlacementReason(reason: PlacementBlockReason): string {
  switch (reason) {
    case "out-of-bounds":
      return "off the map";
    case "occupied":
      return "another structure";
    case "resource":
      return "a resource node";
    default:
      return reason;
  }
}

function getQueueItemTotalMs(building: BuildingEntity): number | undefined {
  const current = building.queue[0];
  if (!current) {
    return undefined;
  }
  if (current.kind === "unit") {
    return UNIT_DEFINITIONS[current.id as keyof typeof UNIT_DEFINITIONS].trainTimeMs;
  }
  if (current.kind === "research") {
    return RESEARCH_DEFINITIONS[current.id as keyof typeof RESEARCH_DEFINITIONS].researchTimeMs;
  }
  return current.id === "abbey"
    ? RESEARCH_DEFINITIONS.abbeyAge.researchTimeMs
    : RESEARCH_DEFINITIONS.warhostAge.researchTimeMs;
}

function getFactionTheme(world: WorldState, playerId: PlayerId) {
  return getFactionPalette(world.players[playerId].faction, playerId);
}

function getBuildingPalette(building: BuildingEntity, world: WorldState): BuildingPalette {
  const factionTheme = getFactionTheme(world, building.playerId);
  const playerPalette = {
    wall: mixColor(factionTheme.main, 0x36271b, 0.18),
    roof: mixColor(factionTheme.accent, 0x4d2c1d, 0.42),
    trim: mixColor(factionTheme.main, 0xf8efd7, 0.38),
    accent: mixColor(factionTheme.accent, factionTheme.main, 0.18),
    banner: mixColor(factionTheme.main, factionTheme.accent, 0.34),
    shadow: mixColor(factionTheme.main, 0x120d09, 0.84),
  };

  switch (building.buildingType) {
    case "granary":
      return { ...playerPalette, roof: mixColor(playerPalette.roof, 0x8b7841, 0.42), accent: mixColor(playerPalette.accent, 0xc9944f, 0.5) };
    case "range":
      return { ...playerPalette, roof: mixColor(playerPalette.roof, 0x496d4c, 0.56), accent: mixColor(playerPalette.accent, 0xd8b77d, 0.44) };
    case "blacksmith":
      return { ...playerPalette, roof: mixColor(playerPalette.roof, 0x4b4e55, 0.5), accent: mixColor(playerPalette.accent, 0xe08b4e, 0.54) };
    case "longPatrolLodge":
      return { ...playerPalette, roof: mixColor(playerPalette.roof, 0xa14538, 0.58), accent: mixColor(playerPalette.accent, 0xefc178, 0.48) };
    case "tower":
    case "wall":
    case "gate":
      return {
        ...playerPalette,
        wall: mixColor(playerPalette.wall, 0x969389, 0.52),
        roof: mixColor(playerPalette.roof, 0x6d6f74, 0.32),
      };
    case "workshop":
      return { ...playerPalette, roof: mixColor(playerPalette.roof, 0x7a5a34, 0.46), accent: mixColor(playerPalette.accent, 0xc78948, 0.48) };
    default:
      return playerPalette;
  }
}

function getUnitSpecies(unit: UnitEntity): UnitSpecies {
  switch (unit.unitType) {
    case "shrewScout":
      return "shrew";
    case "otterSkirmisher":
      return "otter";
    case "hareRunner":
      return "hare";
    case "badgerChampion":
      return "badger";
    case "ramCart":
      return "machine";
    default:
      return "mouse";
  }
}

function getUnitPalette(unit: UnitEntity, world: WorldState): UnitPalette {
  const factionTheme = getFactionTheme(world, unit.playerId);
  const base = {
    fur: unit.playerId === "player" ? 0xf0d7aa : 0xc06d63,
    cloth: mixColor(factionTheme.accent, 0x241912, 0.22),
    accent: mixColor(factionTheme.main, factionTheme.accent, 0.28),
    metal: mixColor(factionTheme.main, 0x8e8f95, 0.58),
    shadow: mixColor(factionTheme.main, 0x150f0b, 0.86),
  };

  switch (unit.unitType) {
    case "worker":
      return { ...base, cloth: mixColor(base.cloth, 0x5c7254, 0.4) };
    case "shrewScout":
      return { ...base, fur: unit.playerId === "player" ? 0xc8b89d : 0xb87368, cloth: mixColor(base.cloth, 0x4f6c81, 0.45) };
    case "militia":
      return { ...base, fur: unit.playerId === "player" ? 0xd9c59f : 0xc97d6b, cloth: mixColor(base.cloth, 0x6a5139, 0.4) };
    case "shieldbearer":
      return { ...base, fur: unit.playerId === "player" ? 0xe1cfab : 0xca806e, cloth: mixColor(base.cloth, 0x6a4b34, 0.42) };
    case "slinger":
      return { ...base, fur: unit.playerId === "player" ? 0xe2d0ae : 0xc78673, cloth: mixColor(base.cloth, 0x4e6f57, 0.4) };
    case "archer":
      return { ...base, fur: unit.playerId === "player" ? 0xe0cba4 : 0xc97f6d, cloth: mixColor(base.cloth, 0x4f6a5e, 0.4) };
    case "otterSkirmisher":
      return { ...base, fur: unit.playerId === "player" ? 0x8f7253 : 0x8d5048, cloth: mixColor(base.cloth, 0x436f73, 0.42), accent: mixColor(base.accent, 0xe4cb8c, 0.35) };
    case "hareRunner":
      return { ...base, fur: unit.playerId === "player" ? 0xe9cf9f : 0xd2856d, cloth: mixColor(base.cloth, 0xa34a3c, 0.46) };
    case "badgerChampion":
      return { fur: 0xe8e3d7, cloth: mixColor(base.cloth, 0x7a4334, 0.44), accent: mixColor(base.accent, 0xf0d391, 0.4), metal: mixColor(base.metal, 0xa9aaaf, 0.3), shadow: 0x161212 };
    case "ramCart":
      return { fur: 0x8d6844, cloth: mixColor(base.cloth, 0x6a4a2b, 0.5), accent: mixColor(base.accent, 0xd7b36f, 0.26), metal: mixColor(base.metal, 0x77716c, 0.2), shadow: 0x18120f };
    default:
      return base;
  }
}

export class RedwallScene extends Phaser.Scene {
  private readonly session: GameSession;
  private settings: GameSettings;
  private readonly tileWidth = 88;
  private readonly tileHeight = 44;
  private readonly origin = { x: 600, y: 88 };
  private terrainGraphics?: Phaser.GameObjects.Graphics;
  private entityGraphics?: Phaser.GameObjects.Graphics;
  private overlayGraphics?: Phaser.GameObjects.Graphics;
  private dragStart?: DragPoint;
  private dragCurrent?: DragPoint;
  private cameraKeys?: Record<string, Phaser.Input.Keyboard.Key>;
  private pings: Ping[] = [];
  private isPanning = false;
  private lastPanPoint?: { x: number; y: number };
  private lastSelectionClick?: { entityId: string; atMs: number };
  private readonly hitFlashes = new Map<string, number>();
  private readonly previousHpByEntity = new Map<string, number>();
  private readonly targetHighlights = new Map<string, { tone: TargetHighlightTone; untilMs: number }>();
  private hoverPreview?: HoverPreview;
  private hoverLabel?: Phaser.GameObjects.Text;

  public constructor(session: GameSession, settings: GameSettings) {
    super("battlefield");
    this.session = session;
    this.settings = settings;
  }

  public applySettings(settings: GameSettings): void {
    this.settings = settings;
  }

  public create(): void {
    this.terrainGraphics = this.add.graphics();
    this.entityGraphics = this.add.graphics();
    this.overlayGraphics = this.add.graphics();
    this.hoverLabel = this.add.text(0, 0, "", {
      fontFamily: "Georgia",
      fontSize: "16px",
      color: "#f4e8cf",
      backgroundColor: "#20160fd9",
      padding: { left: 10, right: 10, top: 6, bottom: 6 },
    })
      .setDepth(20)
      .setScrollFactor(0)
      .setVisible(false);
    this.cameras.main.setBackgroundColor("#0f1715");
    this.cameras.main.setZoom(0.82);
    this.cameras.main.setScroll(-200, -120);

    this.input.mouse?.disableContextMenu();
    this.game.canvas.addEventListener("contextmenu", (event) => {
      event.preventDefault();
    });
    this.cameraKeys = this.input.keyboard?.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
      altUp: Phaser.Input.Keyboard.KeyCodes.UP,
      altDown: Phaser.Input.Keyboard.KeyCodes.DOWN,
      altLeft: Phaser.Input.Keyboard.KeyCodes.LEFT,
      altRight: Phaser.Input.Keyboard.KeyCodes.RIGHT,
    }) as Record<string, Phaser.Input.Keyboard.Key> | undefined;

    this.input.on("wheel", (_pointer: Phaser.Input.Pointer, _objects: unknown[], _deltaX: number, deltaY: number) => {
      const nextZoom = clamp(this.cameras.main.zoom - deltaY * 0.001, 0.55, 1.3);
      this.cameras.main.setZoom(nextZoom);
    });

    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      const domEvent = pointer.event as MouseEvent | undefined;
      const worldPoint = this.getPointerWorldPoint(pointer);
      if (pointer.button === 1 || Boolean(domEvent?.shiftKey)) {
        this.isPanning = true;
        this.lastPanPoint = { x: pointer.x, y: pointer.y };
        return;
      }
      if (this.isSecondaryCommand(pointer)) {
        return;
      }
      this.dragStart = {
        screenX: pointer.x,
        screenY: pointer.y,
        worldX: worldPoint.x,
        worldY: worldPoint.y,
      };
      this.dragCurrent = this.dragStart;
    });

    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (this.isPanning && this.lastPanPoint) {
        const deltaX = (pointer.x - this.lastPanPoint.x) / this.cameras.main.zoom;
        const deltaY = (pointer.y - this.lastPanPoint.y) / this.cameras.main.zoom;
        this.cameras.main.scrollX -= deltaX;
        this.cameras.main.scrollY -= deltaY;
        this.lastPanPoint = { x: pointer.x, y: pointer.y };
        return;
      }
      if (!this.dragStart) {
        return;
      }
      const worldPoint = this.getPointerWorldPoint(pointer);
      this.dragCurrent = {
        screenX: pointer.x,
        screenY: pointer.y,
        worldX: worldPoint.x,
        worldY: worldPoint.y,
      };
    });

    this.input.on("pointerup", (pointer: Phaser.Input.Pointer) => {
      const domEvent = pointer.event as MouseEvent | undefined;
      const worldPoint = this.getPointerWorldPoint(pointer);
      if (this.isPanning) {
        this.isPanning = false;
        this.lastPanPoint = undefined;
        this.clearDragSelection();
        return;
      }
      if (this.isSecondaryCommand(pointer)) {
        this.handleContextCommand(worldPoint.x, worldPoint.y);
        this.clearDragSelection();
        return;
      }
      if (!this.dragStart) {
        return;
      }
      const endPoint = {
        screenX: pointer.x,
        screenY: pointer.y,
        worldX: worldPoint.x,
        worldY: worldPoint.y,
      };
      const end = this.screenToTile(endPoint.worldX, endPoint.worldY);
      const sessionState = this.session.getSessionState();
      if (sessionState.buildMode || sessionState.commandMode) {
        this.handlePrimaryCommand(end);
        this.clearDragSelection();
        return;
      }
      const start = this.dragStart;
      const distance = Phaser.Math.Distance.Between(start.screenX, start.screenY, endPoint.screenX, endPoint.screenY);
      if (distance > 10) {
        this.selectEntitiesInWorldRect(
          { x: start.worldX, y: start.worldY },
          { x: endPoint.worldX, y: endPoint.worldY },
        );
        this.lastSelectionClick = undefined;
      } else {
        this.handleSelection(worldPoint.x, worldPoint.y, end, {
          append: Boolean(domEvent?.metaKey),
          selectAllType: (domEvent?.detail ?? 0) >= 2,
        });
      }
      this.clearDragSelection();
    });
  }

  public update(_time: number, delta: number): void {
    this.updateCamera(delta);
    this.draw();
    this.pings = this.pings
      .map((ping) => ({ ...ping, ttlMs: ping.ttlMs - delta }))
      .filter((ping) => ping.ttlMs > 0);
    this.cleanupTargetHighlights(this.session.getWorld());
  }

  public getScreenPointForTile(tile: TilePoint): TilePoint {
    return this.worldToScreenPoint(this.tileToScreen({ x: tile.x + 0.5, y: tile.y + 0.5 }));
  }

  public getScreenPointForEntity(entityId: string): TilePoint | undefined {
    const entity = this.session.getWorld().entities[entityId];
    if (!entity) {
      return undefined;
    }
    const world = entity.kind === "unit"
      ? this.tileToScreen(entity.position)
      : entity.kind === "building"
        ? this.tileToScreen({
            x: entity.tile.x + BUILDING_DEFINITIONS[entity.buildingType].footprint.x / 2,
            y: entity.tile.y + BUILDING_DEFINITIONS[entity.buildingType].footprint.y / 2,
          })
        : this.tileToScreen({ x: entity.tile.x + 0.5, y: entity.tile.y + 0.5 });
    return this.worldToScreenPoint(world);
  }

  public getAnimationState(entityId: string): UnitAnimationState | undefined {
    const entity = this.session.getWorld().entities[entityId];
    if (!entity || entity.kind !== "unit") {
      return undefined;
    }
    return getUnitAnimationState(entity, this.time.now, { reducedMotion: this.settings.reducedMotion });
  }

  public getTargetIndicators(): TargetIndicator[] {
    const selectedIds = this.session.getSessionState().selectedIds;
    return this.collectTargetIndicators(this.session.getWorld(), selectedIds)
      .map(({ emphasis: _emphasis, ...indicator }) => indicator);
  }

  public getHoverPreview(): HoverPreview | undefined {
    return this.hoverPreview
      ? {
          ...this.hoverPreview,
          tile: { ...this.hoverPreview.tile },
          blockedReasons: this.hoverPreview.blockedReasons ? [...this.hoverPreview.blockedReasons] : undefined,
          tiles: this.hoverPreview.tiles?.map((tileState) => ({
            tile: { ...tileState.tile },
            blocked: tileState.blocked,
            reason: tileState.reason,
          })),
        }
      : undefined;
  }

  public selectInScreenRect(from: TilePoint, to: TilePoint): void {
    this.selectEntitiesInWorldRect(this.screenToWorld(from), this.screenToWorld(to));
  }

  public getCameraState() {
    if (!this.cameras?.main) {
      return undefined;
    }
    return {
      scrollX: this.cameras.main.scrollX,
      scrollY: this.cameras.main.scrollY,
      zoom: this.cameras.main.zoom,
    };
  }

  public focusCamera(tile: TilePoint): void {
    if (!this.cameras?.main) {
      return;
    }
    const point = this.tileToScreen({ x: tile.x + 0.5, y: tile.y + 0.5 });
    this.cameras.main.centerOn(point.x, point.y + 12);
  }

  public getVisibleTileBounds() {
    const camera = this.cameras?.main;
    if (!camera) {
      return undefined;
    }
    const corners = [
      this.screenToTile(camera.scrollX, camera.scrollY),
      this.screenToTile(camera.scrollX + camera.width / camera.zoom, camera.scrollY),
      this.screenToTile(camera.scrollX, camera.scrollY + camera.height / camera.zoom),
      this.screenToTile(camera.scrollX + camera.width / camera.zoom, camera.scrollY + camera.height / camera.zoom),
    ];
    return {
      minX: Math.min(...corners.map((corner) => corner.x)),
      minY: Math.min(...corners.map((corner) => corner.y)),
      maxX: Math.max(...corners.map((corner) => corner.x)),
      maxY: Math.max(...corners.map((corner) => corner.y)),
    };
  }

  private updateCamera(delta: number): void {
    if (!this.cameraKeys) {
      return;
    }
    const speed = delta * 0.45 / this.cameras.main.zoom;
    if (this.cameraKeys.left.isDown || this.cameraKeys.altLeft.isDown) {
      this.cameras.main.scrollX -= speed;
    }
    if (this.cameraKeys.right.isDown || this.cameraKeys.altRight.isDown) {
      this.cameras.main.scrollX += speed;
    }
    if (this.cameraKeys.up.isDown || this.cameraKeys.altUp.isDown) {
      this.cameras.main.scrollY -= speed;
    }
    if (this.cameraKeys.down.isDown || this.cameraKeys.altDown.isDown) {
      this.cameras.main.scrollY += speed;
    }
  }

  private draw(): void {
    const terrainGraphics = this.terrainGraphics;
    const entityGraphics = this.entityGraphics;
    const overlayGraphics = this.overlayGraphics;
    if (!terrainGraphics || !entityGraphics || !overlayGraphics) {
      return;
    }
    const world = this.session.getWorld();
    const session = this.session.getSessionState();
    this.updateDamageFlashes(world);
    terrainGraphics.clear();
    entityGraphics.clear();
    overlayGraphics.clear();

    this.drawTerrain(terrainGraphics, world);
    this.drawEntities(entityGraphics, world, session.selectedIds);
    this.drawOverlay(overlayGraphics, world, session.buildMode, session.commandMode, session.selectedIds);
  }

  private drawTerrain(graphics: Phaser.GameObjects.Graphics, world: WorldState): void {
    const player = world.players.player;
    for (let y = 0; y < world.map.height; y += 1) {
      for (let x = 0; x < world.map.width; x += 1) {
        const index = y * world.map.width + x;
        const tile = world.map.tiles[index];
        const visible = player.visible[index];
        const explored = player.explored[index];
        const point = this.tileToScreen({ x, y });
        const fillColor = !explored
          ? 0x08100f
          : tile.terrain === "moss"
            ? visible ? 0x335a44 : 0x21362a
            : tile.terrain === "dirt"
              ? visible ? 0x705336 : 0x4c3827
              : visible
                ? 0x4e6f48
                : 0x2d402b;
        const lineAlpha = this.settings.showGrid ? 0.72 : 0.14;
        const shadowColor = tile.terrain === "dirt" ? 0x3a281d : 0x18231b;
        const highlightColor = tile.terrain === "dirt" ? 0xa47b53 : 0x6e9d72;
        graphics.fillStyle(fillColor, 1);
        graphics.lineStyle(1, visible ? 0x182220 : 0x0d1412, lineAlpha);
        graphics.beginPath();
        graphics.moveTo(point.x, point.y);
        graphics.lineTo(point.x + this.tileWidth / 2, point.y + this.tileHeight / 2);
        graphics.lineTo(point.x, point.y + this.tileHeight);
        graphics.lineTo(point.x - this.tileWidth / 2, point.y + this.tileHeight / 2);
        graphics.closePath();
        graphics.fillPath();
        graphics.strokePath();

        if (explored) {
          graphics.fillStyle(highlightColor, visible ? 0.18 : 0.08);
          graphics.fillTriangle(
            point.x,
            point.y + 5,
            point.x + this.tileWidth / 2 - 8,
            point.y + this.tileHeight / 2 - 4,
            point.x - this.tileWidth / 2 + 8,
            point.y + this.tileHeight / 2 - 4,
          );
          graphics.fillStyle(shadowColor, visible ? 0.2 : 0.12);
          graphics.fillTriangle(
            point.x - this.tileWidth / 2 + 4,
            point.y + this.tileHeight / 2 + 1,
            point.x + this.tileWidth / 2 - 4,
            point.y + this.tileHeight / 2 + 1,
            point.x,
            point.y + this.tileHeight - 5,
          );
        }
      }
    }
  }

  private drawEntities(graphics: Phaser.GameObjects.Graphics, world: WorldState, selectedIds: string[]): void {
    const timeMs = this.time.now;
    const entities = Object.values(world.entities)
      .filter((entity) => this.isEntityVisibleToPlayer(world, entity))
      .sort((left, right) => {
        const leftY = left.kind === "unit" ? left.position.y : left.tile.y;
        const rightY = right.kind === "unit" ? right.position.y : right.tile.y;
        return leftY - rightY;
      });
    for (const entity of entities) {
      if (entity.kind === "resource") {
        this.drawResource(graphics, entity);
        continue;
      }
      if (entity.kind === "building") {
        this.drawBuilding(graphics, entity, selectedIds.includes(entity.id), world, timeMs);
        continue;
      }
      this.drawUnit(graphics, entity, selectedIds.includes(entity.id), world, timeMs);
    }
    for (const projectile of world.projectiles) {
      const point = this.tileToScreen(projectile.position);
      const target = world.entities[projectile.targetId];
      const targetPosition = target && (target.kind === "unit" || target.kind === "building")
        ? target.kind === "unit"
          ? this.tileToScreen(target.position)
          : this.tileToScreen({ x: target.tile.x + 0.5, y: target.tile.y + 0.5 })
        : undefined;
      const trailColor = getFactionTheme(world, projectile.playerId).accent;
      if (targetPosition) {
        const trailEndX = point.x + (point.x - targetPosition.x) * 0.18;
        const trailEndY = point.y + (point.y - targetPosition.y) * 0.18 + 12;
        graphics.lineStyle(2, trailColor, 0.78);
        graphics.strokeLineShape(new Phaser.Geom.Line(point.x, point.y + 12, trailEndX, trailEndY));
      }
      graphics.fillStyle(trailColor, 1);
      graphics.fillCircle(point.x, point.y + 12, 4);
    }
  }

  private drawOverlay(
    graphics: Phaser.GameObjects.Graphics,
    world: WorldState,
    buildMode: BuildingType | undefined,
    commandMode: "move" | "gather" | "attack" | "rally" | undefined,
    selectedIds: string[],
  ): void {
    const hoverPreview = this.getHoverPreviewState(world, buildMode, commandMode);
    this.hoverPreview = hoverPreview;

    if (this.dragStart && this.dragCurrent) {
      const minX = Math.min(this.dragStart.worldX, this.dragCurrent.worldX);
      const minY = Math.min(this.dragStart.worldY, this.dragCurrent.worldY);
      const width = Math.abs(this.dragCurrent.worldX - this.dragStart.worldX);
      const height = Math.abs(this.dragCurrent.worldY - this.dragStart.worldY);
      graphics.lineStyle(2, 0xf2dfa8, 0.9);
      graphics.fillStyle(0xf2dfa8, 0.08);
      graphics.fillRect(minX, minY, width, height);
      graphics.strokeRect(minX, minY, width, height);
    }

    if (buildMode && hoverPreview) {
      const definition = BUILDING_DEFINITIONS[buildMode];
      const validPlacement = hoverPreview.kind === "build-valid";
      const tiles = hoverPreview.tiles ?? [{
        tile: hoverPreview.tile,
        blocked: !validPlacement,
      }];
      this.drawPlacementPreview(graphics, hoverPreview.tile, definition.footprint, tiles, validPlacement);
    }

    if (!buildMode && commandMode && hoverPreview && !hoverPreview.entityId) {
      const tile = hoverPreview.tile;
      const point = this.tileToScreen({ x: tile.x + 0.5, y: tile.y + 0.5 });
      const color = commandMode === "attack" ? 0xd16a6a : commandMode === "gather" ? 0x8fb66a : 0x8fbac3;
      graphics.lineStyle(2, color, 0.9);
      graphics.strokeCircle(point.x, point.y + 12, 18);
    }

    if (hoverPreview?.entityId) {
      const entity = world.entities[hoverPreview.entityId];
      if (entity && this.isEntityVisibleToPlayer(world, entity)) {
        this.drawHoverEntityIndicator(graphics, entity, hoverPreview.kind);
      }
    }

    for (const ping of this.pings) {
      const point = this.tileToScreen({ x: ping.tile.x + 0.5, y: ping.tile.y + 0.5 });
      const radius = this.settings.reducedMotion ? 18 : 10 + ((1800 - ping.ttlMs) / 1800) * 22;
      const alpha = this.settings.reducedMotion ? 0.85 : ping.ttlMs / 1800;
      graphics.lineStyle(2, 0xf2dfa8, alpha);
      graphics.strokeCircle(point.x, point.y + 12, radius);
    }

    for (const indicator of this.collectTargetIndicators(world, selectedIds)) {
      const entity = world.entities[indicator.id];
      if (!entity || !this.isEntityVisibleToPlayer(world, entity)) {
        continue;
      }
      this.drawTargetIndicator(graphics, entity, indicator.tone, indicator.emphasis);
    }

    this.updateHoverLabel(hoverPreview);

    if (selectedIds.length === 0) {
      return;
    }
    const selectedEntity = world.entities[selectedIds[0]];
    if (!selectedEntity || selectedEntity.kind !== "building") {
      return;
    }
    const buildingCenter = this.tileToScreen({
      x: selectedEntity.tile.x + BUILDING_DEFINITIONS[selectedEntity.buildingType].footprint.x / 2,
      y: selectedEntity.tile.y + BUILDING_DEFINITIONS[selectedEntity.buildingType].footprint.y / 2,
    });
    const rally = this.tileToScreen({ x: selectedEntity.rallyPoint.x + 0.5, y: selectedEntity.rallyPoint.y + 0.5 });
    graphics.lineStyle(2, 0x8fbac3, 0.8);
    graphics.strokeLineShape(new Phaser.Geom.Line(buildingCenter.x, buildingCenter.y + 16, rally.x, rally.y));
    graphics.fillStyle(0x8fbac3, 1);
    graphics.fillCircle(rally.x, rally.y, 5);
  }

  private getHoverPreviewState(
    world: WorldState,
    buildMode: BuildingType | undefined,
    commandMode: "move" | "gather" | "attack" | "rally" | undefined,
  ): HoverPreview | undefined {
    const pointer = this.input.activePointer;
    if (!this.isPointerInsideCanvas(pointer) || this.dragStart || this.isPanning) {
      return undefined;
    }

    const worldPoint = this.getPointerWorldPoint(pointer);
    const tile = this.screenToTile(worldPoint.x, worldPoint.y);
    if (buildMode) {
      const placement = evaluateBuildingPlacement(world.map, world.entities, buildMode, tile);
      return {
        kind: placement.allowed ? "build-valid" : "build-invalid",
        label: `${BUILDING_DEFINITIONS[buildMode].label}: ${placement.allowed ? "Ready to Place" : "Placement Blocked"}`,
        detail: placement.allowed
          ? `${placement.footprint.x}x${placement.footprint.y} footprint clear`
          : `Blocked by ${placement.blockedReasons.map(formatPlacementReason).join(" and ")}`,
        tile,
        blockedReasons: placement.blockedReasons,
        tiles: placement.tiles,
      };
    }

    const hoveredEntity = this.findHoverEntityAtPoint(world, worldPoint.x, worldPoint.y, tile, commandMode);
    if (hoveredEntity) {
      return {
        kind: hoveredEntity.kind === "resource" ? "resource" : hoveredEntity.playerId === "player" ? "friendly" : "enemy",
        label: this.getHoverEntityLabel(hoveredEntity),
        tile: hoveredEntity.kind === "unit"
          ? { x: Math.round(hoveredEntity.position.x), y: Math.round(hoveredEntity.position.y) }
          : hoveredEntity.tile,
        entityId: hoveredEntity.id,
      };
    }

    if (!commandMode) {
      return undefined;
    }

    return {
      kind: commandMode === "attack"
        ? "attack-ground"
        : commandMode === "gather"
          ? "gather-ground"
          : commandMode === "rally"
            ? "rally"
            : "move",
      label: commandMode === "attack"
        ? "Attack-Move Ground"
        : commandMode === "gather"
          ? "Select a Resource Node"
          : commandMode === "rally"
            ? "Set Rally Point"
            : "Move Destination",
      tile,
    };
  }

  private findHoverEntityAtPoint(
    world: WorldState,
    worldX: number,
    worldY: number,
    tile: TilePoint,
    commandMode: "move" | "gather" | "attack" | "rally" | undefined,
  ): Entity | undefined {
    if (commandMode === "gather") {
      return this.findVisibleResourceAtTile(world, tile) ?? this.findPlayerEntityAtPoint(worldX, worldY, tile);
    }
    if (commandMode === "attack") {
      return this.findVisibleEnemyAtPoint(world, worldX, worldY, tile);
    }
    if (commandMode === "move" || commandMode === "rally") {
      return undefined;
    }
    return this.findPlayerEntityAtPoint(worldX, worldY, tile)
      ?? this.findVisibleResourceAtTile(world, tile)
      ?? this.findVisibleEnemyAtPoint(world, worldX, worldY, tile);
  }

  private findVisibleResourceAtTile(world: WorldState, tile: TilePoint): Entity | undefined {
    return Object.values(world.entities).find((entity) => {
      if (entity.kind !== "resource") {
        return false;
      }
      return this.isEntityVisibleToPlayer(world, entity) && entity.tile.x === tile.x && entity.tile.y === tile.y;
    });
  }

  private findVisibleEnemyAtPoint(world: WorldState, worldX: number, worldY: number, tile: TilePoint): Entity | undefined {
    const hoveredEnemyUnit = this.findClosestUnitAtWorldPoint(worldX, worldY, (unit) => unit.playerId === "ai");
    if (hoveredEnemyUnit) {
      return hoveredEnemyUnit;
    }
    return Object.values(world.entities).find((entity) => {
      if (entity.kind !== "building" || entity.playerId !== "ai" || !this.isEntityVisibleToPlayer(world, entity)) {
        return false;
      }
      const definition = BUILDING_DEFINITIONS[entity.buildingType];
      return tile.x >= entity.tile.x
        && tile.y >= entity.tile.y
        && tile.x < entity.tile.x + definition.footprint.x
        && tile.y < entity.tile.y + definition.footprint.y;
    });
  }

  private getHoverEntityLabel(entity: Entity): string {
    if (entity.kind === "unit") {
      return `${entity.playerId === "player" ? "Friendly" : "Enemy"} ${UNIT_DEFINITIONS[entity.unitType].label}`;
    }
    if (entity.kind === "building") {
      return `${entity.playerId === "player" ? "Friendly" : "Enemy"} ${BUILDING_DEFINITIONS[entity.buildingType].label}`;
    }
    return `${getResourceLabel(entity.resourceType)} Resource`;
  }

  private drawHoverEntityIndicator(graphics: Phaser.GameObjects.Graphics, entity: Entity, kind: HoverPreviewKind): void {
    const color = kind === "enemy"
      ? 0xdb7465
      : kind === "resource"
        ? 0x95c66f
        : 0xf2dfa8;
    const alpha = this.settings.reducedMotion ? 0.92 : 0.62 + ((Math.sin(this.time.now / 160) + 1) * 0.5) * 0.28;

    if (entity.kind === "building") {
      const footprint = BUILDING_DEFINITIONS[entity.buildingType].footprint;
      const corners = [
        this.tileToScreen({ x: entity.tile.x, y: entity.tile.y }),
        this.tileToScreen({ x: entity.tile.x + footprint.x, y: entity.tile.y }),
        this.tileToScreen({ x: entity.tile.x + footprint.x, y: entity.tile.y + footprint.y }),
        this.tileToScreen({ x: entity.tile.x, y: entity.tile.y + footprint.y }),
      ];
      graphics.fillStyle(color, 0.05);
      graphics.lineStyle(2, color, alpha);
      graphics.beginPath();
      graphics.moveTo(corners[0].x, corners[0].y);
      for (const corner of corners.slice(1)) {
        graphics.lineTo(corner.x, corner.y);
      }
      graphics.closePath();
      graphics.fillPath();
      graphics.strokePath();
      return;
    }

    const point = entity.kind === "unit"
      ? this.tileToScreen(entity.position)
      : this.tileToScreen({ x: entity.tile.x + 0.5, y: entity.tile.y + 0.5 });
    const radius = entity.kind === "unit" ? getUnitRenderSize(entity) * 1.6 + 10 : 22;
    graphics.lineStyle(2, color, alpha);
    graphics.strokeCircle(point.x, point.y + 12, radius);
    graphics.lineStyle(1, color, Math.min(1, alpha + 0.12));
    graphics.strokeCircle(point.x, point.y + 12, Math.max(10, radius - 6));
  }

  private drawPlacementPreview(
    graphics: Phaser.GameObjects.Graphics,
    originTile: TilePoint,
    footprint: TilePoint,
    tiles: PlacementTileState[],
    validPlacement: boolean,
  ): void {
    for (const tileState of tiles) {
      const point = this.tileToScreen({ x: tileState.tile.x, y: tileState.tile.y });
      const color = tileState.blocked ? 0xdb7a70 : 0x9ad27f;
      graphics.fillStyle(color, tileState.blocked ? 0.22 : 0.16);
      graphics.lineStyle(2, color, 0.95);
      graphics.beginPath();
      graphics.moveTo(point.x, point.y);
      graphics.lineTo(point.x + this.tileWidth / 2, point.y + this.tileHeight / 2);
      graphics.lineTo(point.x, point.y + this.tileHeight);
      graphics.lineTo(point.x - this.tileWidth / 2, point.y + this.tileHeight / 2);
      graphics.closePath();
      graphics.fillPath();
      graphics.strokePath();

      if (tileState.blocked) {
        graphics.lineStyle(1, 0xfff1dc, 0.7);
        graphics.strokeLineShape(new Phaser.Geom.Line(
          point.x - this.tileWidth / 2 + 10,
          point.y + this.tileHeight / 2,
          point.x + this.tileWidth / 2 - 10,
          point.y + this.tileHeight / 2,
        ));
        graphics.strokeLineShape(new Phaser.Geom.Line(
          point.x,
          point.y + 8,
          point.x,
          point.y + this.tileHeight - 8,
        ));
      }
    }

    const corners = [
      this.tileToScreen({ x: originTile.x, y: originTile.y }),
      this.tileToScreen({ x: originTile.x + footprint.x, y: originTile.y }),
      this.tileToScreen({ x: originTile.x + footprint.x, y: originTile.y + footprint.y }),
      this.tileToScreen({ x: originTile.x, y: originTile.y + footprint.y }),
    ];
    graphics.lineStyle(3, validPlacement ? 0xe2f0be : 0xf1c2ba, 0.92);
    graphics.beginPath();
    graphics.moveTo(corners[0].x, corners[0].y);
    for (const corner of corners.slice(1)) {
      graphics.lineTo(corner.x, corner.y);
    }
    graphics.closePath();
    graphics.strokePath();
  }

  private updateHoverLabel(hoverPreview: HoverPreview | undefined): void {
    const label = this.hoverLabel;
    const pointer = this.input.activePointer;
    if (!label || !this.isPointerInsideCanvas(pointer) || !hoverPreview) {
      label?.setVisible(false);
      return;
    }
    const canvasPoint = this.getPointerCanvasPoint(pointer);
    const metrics = this.getCanvasMetrics();
    const gamePoint = {
      x: canvasPoint.x / metrics.scaleX,
      y: canvasPoint.y / metrics.scaleY,
    };
    label.setText(hoverPreview.detail ? [hoverPreview.label, hoverPreview.detail] : hoverPreview.label);
    const color = hoverPreview.kind === "build-invalid" || hoverPreview.kind === "enemy" || hoverPreview.kind === "attack-ground"
      ? "#f7d7cf"
      : hoverPreview.kind === "resource" || hoverPreview.kind === "build-valid"
        ? "#e5f4d6"
        : "#f4e8cf";
    label.setColor(color);
    const x = Math.min(this.scale.gameSize.width - label.width - 16, gamePoint.x + 18);
    const y = Math.max(18, Math.min(this.scale.gameSize.height - label.height - 18, gamePoint.y - label.height - 10));
    label.setPosition(x, y).setVisible(true);
  }

  private drawBuilding(
    graphics: Phaser.GameObjects.Graphics,
    building: BuildingEntity,
    selected: boolean,
    world: WorldState,
    timeMs: number,
  ): void {
    const definition = BUILDING_DEFINITIONS[building.buildingType];
    const flashAmount = Math.max(0, Math.min(1, ((this.hitFlashes.get(building.id) ?? 0) - timeMs) / 160));
    const basePalette = getBuildingPalette(building, world);
    const palette = flashAmount > 0
      ? {
          ...basePalette,
          wall: mixColor(basePalette.wall, 0xffffff, flashAmount * 0.42),
          roof: mixColor(basePalette.roof, 0xffffff, flashAmount * 0.2),
          trim: mixColor(basePalette.trim, 0xffffff, flashAmount * 0.3),
        }
      : basePalette;
    const point = this.tileToScreen({
      x: building.tile.x + definition.footprint.x / 2,
      y: building.tile.y + definition.footprint.y / 2,
    });
    const width = definition.footprint.x * 38;
    const height = definition.footprint.y * 24 + 30;
    const topY = point.y - 18;
    const bodyHeight = height - 10;
    const pulse = (Math.sin(timeMs / 320 + point.x * 0.01) + 1) * 0.5;

    graphics.fillStyle(palette.shadow, 0.26);
    graphics.fillEllipse(point.x, point.y + height * 0.45, width * 1.1, 18 + definition.footprint.y * 7);

    graphics.lineStyle(selected ? 3 : 2, selected ? 0xf2dfa8 : 0x241710, 1);
    graphics.fillStyle(palette.wall, building.completed ? 0.98 : 0.58);
    graphics.fillRoundedRect(point.x - width / 2, topY + 18, width, bodyHeight - 18, 12);
    graphics.strokeRoundedRect(point.x - width / 2, topY + 18, width, bodyHeight - 18, 12);

    this.drawBuildingRoof(graphics, building, point.x, topY, width, height, palette, pulse);
    this.drawBuildingDetails(graphics, building, point.x, topY, width, height, palette, pulse);
    this.drawBuildingStatusBars(graphics, building, point.x, topY, width);
  }

  private drawBuildingRoof(
    graphics: Phaser.GameObjects.Graphics,
    building: BuildingEntity,
    centerX: number,
    topY: number,
    width: number,
    height: number,
    palette: BuildingPalette,
    pulse: number,
  ): void {
    const roofHeight = Math.max(22, height * 0.34);

    if (building.buildingType === "tower") {
      graphics.fillStyle(palette.roof, 1);
      graphics.fillRoundedRect(centerX - width * 0.24, topY - roofHeight * 0.2, width * 0.48, height * 0.8, 14);
      graphics.fillStyle(palette.trim, 1);
      for (let index = -1; index <= 1; index += 1) {
        graphics.fillRect(centerX + index * 10 - 4, topY - roofHeight * 0.2 - 7, 8, 9);
      }
      return;
    }

    if (building.buildingType === "wall" || building.buildingType === "gate") {
      graphics.fillStyle(palette.roof, 1);
      graphics.fillRoundedRect(centerX - width / 2, topY + 8, width, 14, 6);
      return;
    }

    graphics.fillStyle(palette.roof, 1);
    graphics.fillTriangle(centerX - width / 2 - 6, topY + 22, centerX, topY - roofHeight, centerX + width / 2 + 6, topY + 22);
    graphics.fillStyle(palette.trim, 0.18);
    graphics.fillTriangle(centerX - width / 2 + 6, topY + 20, centerX, topY - roofHeight + 8, centerX + width / 2 - 8, topY + 20);

    if (building.buildingType === "abbeyHall") {
      graphics.fillStyle(palette.roof, 1);
      graphics.fillRoundedRect(centerX - width * 0.38, topY - 10, width * 0.24, height * 0.78, 10);
      graphics.fillStyle(palette.trim, 1);
      graphics.fillRect(centerX - width * 0.34, topY - 16, width * 0.16, 10);
      graphics.fillStyle(palette.banner, 0.55 + pulse * 0.24);
      graphics.fillCircle(centerX - width * 0.26, topY - 20, 3 + pulse * 1.5);
    }
  }

  private drawBuildingDetails(
    graphics: Phaser.GameObjects.Graphics,
    building: BuildingEntity,
    centerX: number,
    topY: number,
    width: number,
    height: number,
    palette: BuildingPalette,
    pulse: number,
  ): void {
    const bodyTop = topY + 22;

    graphics.fillStyle(0x2b1d12, 0.75);
    graphics.fillRect(centerX - 8, topY + height - 14, 16, 22);
    graphics.fillStyle(palette.trim, 0.85);
    graphics.fillRect(centerX - 4, topY + height - 10, 8, 18);

    if (building.buildingType !== "wall" && building.buildingType !== "gate") {
      const flutter = 8 + pulse * 4;
      graphics.fillStyle(palette.banner, building.completed ? 0.95 : 0.6);
      graphics.fillRect(centerX + width * 0.22, bodyTop + 4, 2, 18);
      graphics.fillTriangle(
        centerX + width * 0.22 + 2,
        bodyTop + 5,
        centerX + width * 0.22 + flutter,
        bodyTop + 9,
        centerX + width * 0.22 + 2,
        bodyTop + 15,
      );
    }

    switch (building.buildingType) {
      case "abbeyHall":
        graphics.fillStyle(palette.trim, 0.9);
        graphics.fillCircle(centerX - width * 0.26, topY + 12, 9);
        graphics.fillStyle(palette.accent, 1);
        graphics.fillRect(centerX + width * 0.08, bodyTop + 2, 24, 10);
        break;
      case "barracks":
        graphics.fillStyle(palette.accent, 1);
        graphics.fillRect(centerX - 2, bodyTop + 4, 4, 28);
        graphics.fillRect(centerX - 15, bodyTop + 14, 30, 4);
        break;
      case "range":
        graphics.fillStyle(palette.trim, 1);
        graphics.fillCircle(centerX, bodyTop + 16, 11);
        graphics.fillStyle(palette.accent, 1);
        graphics.fillCircle(centerX, bodyTop + 16, 5);
        break;
      case "blacksmith":
        graphics.fillStyle(0x37261a, 1);
        graphics.fillRect(centerX + width * 0.2, topY - 8, 12, 26);
        graphics.fillStyle(palette.accent, 0.95);
        graphics.fillCircle(centerX - width * 0.16, bodyTop + 18, 8);
        if (building.queue.length > 0) {
          graphics.fillStyle(0xf0a35c, 0.35 + pulse * 0.3);
          graphics.fillCircle(centerX + width * 0.2 + 6, topY - 10 - pulse * 8, 4 + pulse * 2);
        }
        break;
      case "granary":
        graphics.fillStyle(palette.accent, 1);
        graphics.fillCircle(centerX - 10, bodyTop + 18, 6);
        graphics.fillCircle(centerX + 4, bodyTop + 20, 7);
        break;
      case "storehouse":
        graphics.fillStyle(palette.accent, 1);
        graphics.fillRect(centerX - 14, bodyTop + 10, 10, 14);
        graphics.fillRect(centerX + 2, bodyTop + 8, 10, 16);
        break;
      case "longPatrolLodge":
        graphics.fillStyle(palette.banner, 1);
        graphics.fillTriangle(centerX - 6, bodyTop + 4, centerX + 20, bodyTop + 10, centerX - 6, bodyTop + 18);
        break;
      case "tower":
        graphics.fillStyle(palette.banner, 1);
        graphics.fillRect(centerX + 10, topY + 10, 7, 18);
        break;
      case "wall":
        graphics.fillStyle(palette.trim, 0.9);
        graphics.fillRect(centerX - width / 2 + 6, bodyTop + 8, width - 12, 8);
        break;
      case "gate":
        graphics.fillStyle(0x25170f, 1);
        graphics.fillRect(centerX - 12, bodyTop + 6, 24, 20);
        graphics.lineStyle(2, palette.trim, 0.95);
        graphics.beginPath();
        graphics.arc(centerX, bodyTop + 12, 12, Math.PI, Math.PI * 2, false);
        graphics.strokePath();
        break;
      case "workshop":
        graphics.fillStyle(palette.trim, 1);
        graphics.fillCircle(centerX - 12, bodyTop + 18, 9);
        graphics.fillStyle(palette.accent, 1);
        graphics.fillCircle(centerX - 12, bodyTop + 18, 3);
        graphics.lineStyle(2, palette.accent, 0.9);
        graphics.strokeLineShape(new Phaser.Geom.Line(centerX - 12, bodyTop + 9, centerX - 12, bodyTop + 27));
        graphics.strokeLineShape(new Phaser.Geom.Line(centerX - 21, bodyTop + 18, centerX - 3, bodyTop + 18));
        if (building.queue.length > 0) {
          graphics.fillStyle(palette.banner, 0.28 + pulse * 0.24);
          graphics.fillCircle(centerX + 14, bodyTop - 4 - pulse * 6, 3 + pulse);
        }
        break;
      default:
        graphics.fillStyle(palette.trim, 0.85);
        graphics.fillRect(centerX - 16, bodyTop + 8, 8, 8);
        graphics.fillRect(centerX + 8, bodyTop + 8, 8, 8);
        break;
    }
  }

  private drawBuildingStatusBars(graphics: Phaser.GameObjects.Graphics, building: BuildingEntity, centerX: number, topY: number, width: number): void {
    graphics.fillStyle(0x20160f, 1);
    graphics.fillRect(centerX - width / 2, topY - 10, width, 6);
    graphics.fillStyle(0x78b66f, 1);
    graphics.fillRect(centerX - width / 2, topY - 10, width * Math.max(0, building.hp) / building.maxHp, 6);

    const totalMs = !building.completed
      ? BUILDING_DEFINITIONS[building.buildingType].buildTimeMs
      : getQueueItemTotalMs(building);
    if (!totalMs) {
      return;
    }
    const progress = !building.completed
      ? building.buildProgressMs / Math.max(1, totalMs)
      : (totalMs - building.queue[0].remainingMs) / Math.max(1, totalMs);
    const barColor = !building.completed
      ? 0xd0a35b
      : building.queue[0].kind === "research"
        ? 0x87c07a
        : building.queue[0].kind === "age"
          ? 0xe0c879
          : 0x7aa6d0;

    graphics.fillStyle(0x20160f, 0.95);
    graphics.fillRect(centerX - width / 2, topY - 2, width, 5);
    graphics.fillStyle(barColor, 1);
    graphics.fillRect(centerX - width / 2, topY - 2, width * clamp(progress, 0, 1), 5);

    const queuedCount = building.queue.length;
    if (queuedCount > 1) {
      for (let index = 1; index < Math.min(queuedCount, 4); index += 1) {
        graphics.fillStyle(0xe8d8aa, 0.85);
        graphics.fillCircle(centerX + width / 2 - index * 10, topY - 18, 3);
      }
    }
  }

  private drawUnit(graphics: Phaser.GameObjects.Graphics, unit: UnitEntity, selected: boolean, world: WorldState, timeMs: number): void {
    const basePoint = this.tileToScreen(unit.position);
    const palette = getUnitPalette(unit, world);
    const species = getUnitSpecies(unit);
    const pose = getUnitAnimationState(unit, timeMs, { reducedMotion: this.settings.reducedMotion });
    const point = {
      x: basePoint.x + pose.sway,
      y: basePoint.y + pose.bob,
    };
    const size = getUnitRenderSize(unit);
    const hitFlash = Math.max(0, (this.hitFlashes.get(unit.id) ?? 0) - timeMs);
    const flashAmount = hitFlash > 0 ? Math.min(1, hitFlash / 160) : 0;
    if (selected) {
      graphics.lineStyle(2, 0xf2dfa8, 1);
      graphics.strokeEllipse(basePoint.x, basePoint.y + 15, species === "machine" ? 40 : 36, species === "machine" ? 18 : 16);
    }
    if (pose.dustAlpha > 0.06 && (pose.activity === "march" || pose.activity === "carry")) {
      graphics.fillStyle(0xd1b57b, pose.dustAlpha);
      graphics.fillCircle(basePoint.x - 7, basePoint.y + 17, 2 + Math.abs(pose.stride) * 0.25);
      graphics.fillCircle(basePoint.x + 8, basePoint.y + 18, 1.6 + Math.abs(pose.armSwing) * 0.18);
    }
    graphics.fillStyle(palette.shadow, 0.25);
    graphics.fillEllipse(basePoint.x, basePoint.y + 16, species === "machine" ? size * 2.6 : size * 2.2, species === "machine" ? 12 : 10);

    if (species === "machine") {
      this.drawRamCart(graphics, point, palette, pose);
    } else {
      const furColor = flashAmount > 0 ? mixColor(palette.fur, 0xffffff, flashAmount * 0.45) : palette.fur;
      const belly = mixColor(furColor, 0xf8f2e4, species === "badger" ? 0.45 : 0.3);
      const cloak = mixColor(palette.cloth, 0x1a130d, 0.18);
      this.drawSpeciesTail(graphics, point, size, palette, species, pose);
      this.drawSpeciesLegs(graphics, point, size, palette, species, pose);
      graphics.fillStyle(cloak, 0.95);
      graphics.fillTriangle(
        point.x - size * 0.9 + pose.lean * 0.7,
        point.y + 4,
        point.x + size * 0.8 + pose.lean,
        point.y + 4,
        point.x - size * 0.08 + pose.lean * 0.3,
        point.y + size * 1.5,
      );
      graphics.fillStyle(palette.cloth, 1);
      graphics.fillRoundedRect(point.x - size * 0.62 + pose.lean * 0.4, point.y - 2, size * 1.2, size * 1.38, 6);
      graphics.fillStyle(mixColor(palette.accent, 0xffffff, 0.18), 0.95);
      graphics.fillRect(point.x - size * 0.42 + pose.lean * 0.45, point.y + size * 0.34, size * 0.84, 3);
      graphics.fillStyle(belly, 0.9);
      graphics.fillEllipse(point.x + size * 0.04 + pose.lean * 0.6, point.y + size * 0.2, size * 0.8, size * 0.98);
      this.drawSpeciesHead(graphics, point, size, palette, species, pose, furColor);
      this.drawUnitGear(graphics, point, size, palette, unit, species, pose);
      graphics.fillStyle(palette.accent, 0.92);
      graphics.fillRect(point.x - 4 + pose.lean * 0.4, point.y - 1, 8, 10);
      this.drawUnitActionEffects(graphics, point, size, palette, unit, pose, world);
    }
    graphics.fillStyle(0x20160f, 1);
    graphics.fillRect(point.x - 16, point.y - 24, 32, 5);
    graphics.fillStyle(0x79bb72, 1);
    graphics.fillRect(point.x - 16, point.y - 24, 32 * Math.max(0, unit.hp) / unit.maxHp, 5);
  }

  private drawRamCart(graphics: Phaser.GameObjects.Graphics, point: TilePoint, palette: UnitPalette, pose: UnitAnimationState): void {
    const wood = mixColor(palette.fur, 0x4f321d, 0.36);
    const hide = mixColor(palette.cloth, 0xd2bf8d, 0.16);
    graphics.fillStyle(wood, 1);
    graphics.fillRoundedRect(point.x - 18, point.y + 1 + pose.bob * 0.2, 28, 13, 4);
    graphics.fillStyle(mixColor(wood, 0xf3e1b6, 0.18), 0.95);
    graphics.fillRect(point.x - 17, point.y + 4 + pose.bob * 0.2, 22, 3);
    graphics.fillStyle(palette.metal, 1);
    graphics.fillRect(point.x - 5, point.y + 3 + pose.bob * 0.18, 24, 4);
    graphics.fillTriangle(point.x + 16, point.y + 2, point.x + 28 + pose.gearSwing, point.y + 8, point.x + 16, point.y + 14);
    graphics.fillStyle(hide, 1);
    graphics.fillTriangle(point.x - 5, point.y - 2, point.x + 11, point.y + 2, point.x - 2, point.y + 11);
    graphics.fillStyle(palette.metal, 1);
    graphics.fillCircle(point.x - 10, point.y + 17, 5);
    graphics.fillCircle(point.x + 7, point.y + 17, 5);
    graphics.fillStyle(mixColor(palette.fur, 0xf7eed5, 0.28), 1);
    graphics.fillCircle(point.x - 4, point.y - 4, 4);
    graphics.fillCircle(point.x + 4, point.y - 3, 4);
    graphics.fillStyle(mixColor(palette.fur, 0xe5bf9f, 0.28), 1);
    graphics.fillCircle(point.x - 6, point.y - 9, 2.3);
    graphics.fillCircle(point.x - 1, point.y - 9, 2.3);
    graphics.fillCircle(point.x + 2, point.y - 8, 2.3);
    graphics.fillCircle(point.x + 7, point.y - 8, 2.3);
    graphics.fillStyle(palette.accent, 0.95);
    graphics.fillRect(point.x + 10, point.y - 1, 3, 14);
    graphics.fillTriangle(point.x + 13, point.y - 1, point.x + 22, point.y + 2, point.x + 13, point.y + 7);
  }

  private drawSpeciesTail(
    graphics: Phaser.GameObjects.Graphics,
    point: TilePoint,
    size: number,
    palette: UnitPalette,
    species: UnitSpecies,
    pose: UnitAnimationState,
  ): void {
    const tailColor = mixColor(palette.fur, palette.shadow, 0.2);
    const swing = pose.tailSwing;
    switch (species) {
      case "mouse":
        graphics.lineStyle(2, mixColor(palette.fur, 0xe8b8a7, 0.35), 0.95);
        graphics.strokeLineShape(new Phaser.Geom.Line(point.x - size * 0.35, point.y + size * 0.9, point.x - size * 1.45 - swing, point.y + size * 1.1));
        graphics.strokeLineShape(new Phaser.Geom.Line(point.x - size * 1.45 - swing, point.y + size * 1.1, point.x - size * 1.82 - swing * 1.3, point.y + size * 0.4));
        break;
      case "shrew":
        graphics.lineStyle(2, mixColor(palette.fur, 0xe4b9a4, 0.26), 0.95);
        graphics.strokeLineShape(new Phaser.Geom.Line(point.x - size * 0.48, point.y + size * 0.82, point.x - size * 1.55 - swing, point.y + size * 0.95));
        graphics.strokeLineShape(new Phaser.Geom.Line(point.x - size * 1.55 - swing, point.y + size * 0.95, point.x - size * 2.2 - swing * 1.4, point.y + size * 0.18));
        break;
      case "otter":
        graphics.fillStyle(tailColor, 0.95);
        graphics.fillEllipse(point.x - size * 0.95 - swing * 0.4, point.y + size * 0.84, size * 1.15, size * 0.4);
        break;
      case "hare":
        graphics.fillStyle(mixColor(palette.fur, 0xf4eee2, 0.32), 1);
        graphics.fillCircle(point.x - size * 0.7 - swing * 0.18, point.y + size * 0.76, size * 0.16);
        break;
      case "badger":
        graphics.fillStyle(tailColor, 1);
        graphics.fillRoundedRect(point.x - size * 0.8 - swing * 0.25, point.y + size * 0.75, size * 0.42, size * 0.2, 3);
        break;
      default:
        break;
    }
  }

  private drawSpeciesLegs(
    graphics: Phaser.GameObjects.Graphics,
    point: TilePoint,
    size: number,
    palette: UnitPalette,
    species: UnitSpecies,
    pose: UnitAnimationState,
  ): void {
    const footColor = mixColor(palette.fur, palette.shadow, 0.16);
    const footY = point.y + size * 1.26;
    const stride = pose.stride;
    if (species === "hare") {
      graphics.fillStyle(footColor, 1);
      graphics.fillEllipse(point.x - size * 0.26 - stride * 0.2, footY, size * 0.44, size * 0.18);
      graphics.fillEllipse(point.x + size * 0.24 + stride * 0.24, footY - 1, size * 0.5, size * 0.18);
      return;
    }
    graphics.fillStyle(footColor, 1);
    graphics.fillEllipse(point.x - size * 0.2 - stride * 0.18, footY, size * 0.3, size * 0.16);
    graphics.fillEllipse(point.x + size * 0.2 + stride * 0.18, footY, size * 0.3, size * 0.16);
  }

  private drawSpeciesHead(
    graphics: Phaser.GameObjects.Graphics,
    point: TilePoint,
    size: number,
    palette: UnitPalette,
    species: UnitSpecies,
    pose: UnitAnimationState,
    furColor: number,
  ): void {
    const headX = point.x + size * 0.06 + pose.lean * 0.6;
    const headY = point.y - size * 0.76 + pose.headNod;
    const earColor = mixColor(furColor, 0xe7bca3, 0.24);
    const muzzleColor = mixColor(furColor, 0xf8f1e3, 0.38);

    switch (species) {
      case "mouse":
        graphics.fillStyle(earColor, 1);
        graphics.fillCircle(headX - size * 0.33, headY - size * 0.22, size * 0.24);
        graphics.fillCircle(headX + size * 0.18, headY - size * 0.26, size * 0.24);
        graphics.fillStyle(furColor, 1);
        graphics.fillEllipse(headX, headY, size * 0.95, size * 0.82);
        graphics.fillStyle(muzzleColor, 0.95);
        graphics.fillEllipse(headX + size * 0.2, headY + size * 0.1, size * 0.46, size * 0.3);
        graphics.fillStyle(mixColor(palette.accent, 0x1f1611, 0.2), 1);
        graphics.fillCircle(headX + size * 0.42, headY + size * 0.08, size * 0.07);
        this.drawWhiskers(graphics, headX + size * 0.22, headY + size * 0.1, size * 0.4, palette.shadow);
        break;
      case "shrew":
        graphics.fillStyle(earColor, 1);
        graphics.fillCircle(headX - size * 0.28, headY - size * 0.16, size * 0.13);
        graphics.fillCircle(headX - size * 0.05, headY - size * 0.24, size * 0.12);
        graphics.fillStyle(furColor, 1);
        graphics.fillEllipse(headX - size * 0.02, headY, size * 0.78, size * 0.54);
        graphics.fillTriangle(headX + size * 0.18, headY - size * 0.08, headX + size * 0.82, headY + size * 0.05, headX + size * 0.18, headY + size * 0.18);
        graphics.fillStyle(mixColor(palette.accent, 0x1f1611, 0.18), 1);
        graphics.fillCircle(headX + size * 0.76, headY + size * 0.05, size * 0.06);
        this.drawWhiskers(graphics, headX + size * 0.48, headY + size * 0.06, size * 0.34, palette.shadow);
        break;
      case "otter":
        graphics.fillStyle(earColor, 1);
        graphics.fillCircle(headX - size * 0.2, headY - size * 0.22, size * 0.12);
        graphics.fillCircle(headX + size * 0.12, headY - size * 0.24, size * 0.12);
        graphics.fillStyle(furColor, 1);
        graphics.fillEllipse(headX, headY, size * 0.98, size * 0.62);
        graphics.fillStyle(muzzleColor, 0.95);
        graphics.fillEllipse(headX + size * 0.18, headY + size * 0.05, size * 0.52, size * 0.26);
        graphics.fillStyle(mixColor(palette.accent, 0x23170e, 0.16), 1);
        graphics.fillCircle(headX + size * 0.42, headY + size * 0.04, size * 0.06);
        this.drawWhiskers(graphics, headX + size * 0.18, headY + size * 0.06, size * 0.36, palette.shadow);
        break;
      case "hare":
        graphics.fillStyle(furColor, 1);
        graphics.fillTriangle(headX - size * 0.18, headY - size * 0.1, headX + size * 0.02, headY - size * 1.34, headX + size * 0.18, headY - size * 0.1);
        graphics.fillTriangle(headX + size * 0.12, headY - size * 0.08, headX + size * 0.36, headY - size * 1.26, headX + size * 0.5, headY - size * 0.06);
        graphics.fillStyle(earColor, 1);
        graphics.fillTriangle(headX - size * 0.04, headY - size * 0.18, headX + size * 0.05, headY - size * 1.02, headX + size * 0.12, headY - size * 0.12);
        graphics.fillTriangle(headX + size * 0.2, headY - size * 0.16, headX + size * 0.29, headY - size * 0.94, headX + size * 0.36, headY - size * 0.1);
        graphics.fillStyle(furColor, 1);
        graphics.fillEllipse(headX + size * 0.08, headY, size * 0.76, size * 0.7);
        graphics.fillStyle(muzzleColor, 0.95);
        graphics.fillEllipse(headX + size * 0.22, headY + size * 0.12, size * 0.38, size * 0.24);
        graphics.fillStyle(mixColor(palette.accent, 0x23170e, 0.16), 1);
        graphics.fillCircle(headX + size * 0.4, headY + size * 0.1, size * 0.06);
        break;
      case "badger":
        graphics.fillStyle(mixColor(palette.shadow, 0x312723, 0.15), 1);
        graphics.fillCircle(headX - size * 0.26, headY - size * 0.26, size * 0.18);
        graphics.fillCircle(headX + size * 0.18, headY - size * 0.26, size * 0.18);
        graphics.fillStyle(furColor, 1);
        graphics.fillEllipse(headX, headY, size * 0.94, size * 0.82);
        graphics.fillStyle(0x1c1c1c, 1);
        graphics.fillRect(headX - size * 0.14, headY - size * 0.44, size * 0.12, size * 0.78);
        graphics.fillRect(headX + size * 0.08, headY - size * 0.4, size * 0.12, size * 0.74);
        graphics.fillStyle(muzzleColor, 0.95);
        graphics.fillEllipse(headX + size * 0.22, headY + size * 0.16, size * 0.44, size * 0.3);
        graphics.fillStyle(mixColor(palette.accent, 0x1e140e, 0.16), 1);
        graphics.fillCircle(headX + size * 0.42, headY + size * 0.14, size * 0.07);
        break;
      default:
        break;
    }

    graphics.fillStyle(0x2b1d13, 1);
    graphics.fillCircle(headX + size * 0.06, headY - size * 0.02, size * 0.045);
    graphics.fillCircle(headX + size * 0.28, headY - size * 0.04, size * 0.045);
  }

  private drawUnitGear(
    graphics: Phaser.GameObjects.Graphics,
    point: TilePoint,
    size: number,
    palette: UnitPalette,
    unit: UnitEntity,
    species: UnitSpecies,
    pose: UnitAnimationState,
  ): void {
    const wood = mixColor(palette.accent, 0x4a301b, 0.36);
    if (UNIT_DEFINITIONS[unit.unitType].tags.includes("ranged")) {
      graphics.lineStyle(2, wood, 0.95);
      graphics.strokeLineShape(new Phaser.Geom.Line(
        point.x + size * 0.46 + pose.lean * 0.6,
        point.y - size * 0.28 - pose.armSwing * 0.25,
        point.x + size * 1.08 + pose.gearSwing * 0.35,
        point.y + size * 0.58,
      ));
      graphics.strokeLineShape(new Phaser.Geom.Line(
        point.x + size * 1.08 + pose.gearSwing * 0.35,
        point.y - size * 0.22 - pose.armSwing * 0.3,
        point.x + size * 1.08 + pose.gearSwing * 0.35,
        point.y + size * 0.58,
      ));
      if (unit.unitType === "otterSkirmisher") {
        graphics.lineStyle(2, palette.metal, 0.95);
        graphics.strokeLineShape(new Phaser.Geom.Line(point.x - size * 0.08, point.y - size * 0.18, point.x + size * 1.12 + pose.gearSwing * 0.3, point.y + size * 0.34));
      }
      return;
    }

    if (unit.unitType === "worker") {
      graphics.fillStyle(wood, 1);
      graphics.fillRect(point.x + size * 0.5 + pose.gearSwing * 0.45, point.y - size * 0.34 - Math.abs(pose.armSwing) * 0.6, 3, size * 1.58);
      graphics.fillStyle(palette.metal, 1);
      graphics.fillRect(point.x + size * 0.32 + pose.gearSwing * 0.45, point.y - size * 0.48 - Math.abs(pose.armSwing) * 0.6, size * 0.62, 4);
      graphics.fillStyle(mixColor(palette.cloth, 0x684a2d, 0.28), 0.95);
      graphics.fillCircle(point.x - size * 0.58 - pose.gearSwing * 0.12, point.y + size * 0.44, size * 0.18);
      return;
    }

    if (unit.unitType === "shieldbearer") {
      graphics.fillStyle(palette.accent, 1);
      graphics.fillCircle(point.x - size * 0.72, point.y + size * 0.38, size * 0.44);
      graphics.fillStyle(mixColor(palette.metal, 0xf3e2b1, 0.12), 1);
      graphics.fillCircle(point.x - size * 0.72, point.y + size * 0.38, size * 0.12);
    }

    graphics.fillStyle(species === "hare" ? palette.accent : palette.metal, 1);
    graphics.fillRect(point.x + size * 0.52 + pose.gearSwing * 0.28, point.y - size * 0.58 - Math.abs(pose.armSwing) * 0.35, 3, size * 1.74);
    if (unit.unitType === "badgerChampion") {
      graphics.fillStyle(palette.metal, 1);
      graphics.fillTriangle(
        point.x + size * 0.48 + pose.gearSwing * 0.2,
        point.y - size * 0.5 - Math.abs(pose.armSwing) * 0.28,
        point.x + size * 1.08 + pose.gearSwing * 0.45,
        point.y - size * 0.2,
        point.x + size * 0.48 + pose.gearSwing * 0.2,
        point.y + size * 0.08,
      );
      return;
    }
    if (unit.unitType === "hareRunner") {
      graphics.lineStyle(2, palette.metal, 0.95);
      graphics.strokeLineShape(new Phaser.Geom.Line(point.x + size * 0.48, point.y + size * 0.16, point.x + size * 1.22 + pose.gearSwing * 0.42, point.y + size * 0.02));
      return;
    }
    graphics.fillStyle(palette.metal, 1);
    graphics.fillTriangle(
      point.x + size * 0.38 + pose.gearSwing * 0.2,
      point.y - size * 0.7 - Math.abs(pose.armSwing) * 0.35,
      point.x + size * 0.66 + pose.gearSwing * 0.35,
      point.y - size * 1.02,
      point.x + size * 0.96 + pose.gearSwing * 0.45,
      point.y - size * 0.64,
    );
  }

  private drawUnitActionEffects(
    graphics: Phaser.GameObjects.Graphics,
    point: TilePoint,
    size: number,
    palette: UnitPalette,
    unit: UnitEntity,
    pose: UnitAnimationState,
    world: WorldState,
  ): void {
    if (pose.activity === "harvest" && unit.order.type === "gather") {
      const target = world.entities[unit.order.targetId];
      const effectColor = target?.kind === "resource"
        ? target.resourceType === "timber"
          ? 0xb78456
          : target.resourceType === "food"
            ? 0x8ebf68
            : target.resourceType === "stone"
              ? 0xc0b9aa
              : 0xcd865d
        : 0xd9ba73;
      graphics.fillStyle(effectColor, 0.24 + pose.pulse * 0.36);
      graphics.fillCircle(point.x + size * 0.9 + pose.gearSwing * 0.15, point.y + size * 0.12 - pose.armSwing * 0.18, 2 + pose.pulse * 1.2);
      graphics.fillCircle(point.x + size * 0.58, point.y - size * 0.12 - pose.pulse * 4, 1.6);
      return;
    }

    if (pose.activity === "build") {
      graphics.fillStyle(0xe0bc6f, 0.28 + pose.pulse * 0.34);
      graphics.fillCircle(point.x + size * 0.76 + pose.gearSwing * 0.2, point.y - size * 0.08 - pose.pulse * 6, 2 + pose.pulse * 1.3);
      graphics.fillCircle(point.x + size * 0.46, point.y + size * 0.18 - pose.pulse * 2.2, 1.5);
      return;
    }

    if (pose.activity === "attack") {
      const slashColor = UNIT_DEFINITIONS[unit.unitType].tags.includes("ranged") ? palette.accent : 0xf3d497;
      graphics.lineStyle(2, slashColor, 0.2 + pose.pulse * 0.45);
      if (UNIT_DEFINITIONS[unit.unitType].tags.includes("ranged")) {
        graphics.strokeLineShape(new Phaser.Geom.Line(
          point.x + size * 0.65,
          point.y - size * 0.18,
          point.x + size * 1.32 + pose.gearSwing * 0.3,
          point.y + size * 0.14,
        ));
      } else {
        graphics.beginPath();
        graphics.arc(point.x + size * 0.72, point.y - size * 0.12, size * 0.52, -0.7, 0.55, false);
        graphics.strokePath();
      }
    }
  }

  private drawWhiskers(graphics: Phaser.GameObjects.Graphics, x: number, y: number, length: number, color: number): void {
    graphics.lineStyle(1, mixColor(color, 0xffffff, 0.12), 0.55);
    graphics.strokeLineShape(new Phaser.Geom.Line(x - length * 0.6, y - 1, x - length * 1.15, y - length * 0.16));
    graphics.strokeLineShape(new Phaser.Geom.Line(x - length * 0.55, y + 1, x - length * 1.14, y + length * 0.14));
    graphics.strokeLineShape(new Phaser.Geom.Line(x + length * 0.22, y - 1, x + length * 0.82, y - length * 0.12));
    graphics.strokeLineShape(new Phaser.Geom.Line(x + length * 0.18, y + 1, x + length * 0.8, y + length * 0.12));
  }

  private drawResource(graphics: Phaser.GameObjects.Graphics, entity: Entity): void {
    if (entity.kind !== "resource") {
      return;
    }
    const point = this.tileToScreen({ x: entity.tile.x + 0.5, y: entity.tile.y + 0.5 });
    graphics.fillStyle(0x14100d, 0.2);
    graphics.fillEllipse(point.x, point.y + 18, 26, 10);

    if (entity.resourceType === "timber") {
      graphics.fillStyle(0x5f3e25, 1);
      graphics.fillRect(point.x - 4, point.y - 4, 8, 26);
      graphics.fillStyle(0x426a43, 1);
      graphics.fillTriangle(point.x - 20, point.y + 8, point.x, point.y - 22, point.x + 20, point.y + 8);
      graphics.fillTriangle(point.x - 16, point.y - 2, point.x, point.y - 32, point.x + 16, point.y - 2);
      return;
    }

    if (entity.resourceType === "food") {
      graphics.fillStyle(0x5b844f, 1);
      graphics.fillCircle(point.x - 8, point.y + 6, 10);
      graphics.fillCircle(point.x + 2, point.y + 2, 12);
      graphics.fillCircle(point.x + 11, point.y + 8, 9);
      graphics.fillStyle(0xd38d56, 1);
      graphics.fillCircle(point.x - 4, point.y + 10, 3);
      graphics.fillCircle(point.x + 6, point.y + 5, 3);
      graphics.fillCircle(point.x + 10, point.y + 13, 3);
      return;
    }

    graphics.fillStyle(entity.resourceType === "stone" ? 0x9b978b : 0x7d685c, 1);
    graphics.fillTriangle(point.x - 16, point.y + 12, point.x - 4, point.y - 8, point.x + 6, point.y + 12);
    graphics.fillTriangle(point.x - 2, point.y + 14, point.x + 10, point.y - 12, point.x + 18, point.y + 14);
    graphics.fillStyle(entity.resourceType === "stone" ? 0xc1bbad : 0xcd8458, 1);
    graphics.fillCircle(point.x + 8, point.y + 4, 4);
  }

  private handleSelection(worldX: number, worldY: number, tile: TilePoint, options?: { append?: boolean; selectAllType?: boolean }): void {
    const clicked = this.findPlayerEntityAtPoint(worldX, worldY, tile);
    if (!clicked) {
      if (!options?.append) {
        this.session.clearSelection();
      }
      this.lastSelectionClick = undefined;
      return;
    }
    const now = performance.now();
    const repeatedClick = this.lastSelectionClick?.entityId === clicked.id
      && now - this.lastSelectionClick.atMs < 360;
    this.lastSelectionClick = {
      entityId: clicked.id,
      atMs: now,
    };
    if (clicked.kind === "unit" && (options?.selectAllType || repeatedClick)) {
      this.session.selectAllUnitsOfType(clicked.unitType);
      return;
    }
    if (options?.append) {
      this.session.addSelection([clicked.id]);
      return;
    }
    this.session.setSelection([clicked.id]);
  }

  private handleContextCommand(worldX: number, worldY: number): void {
    const sessionState = this.session.getSessionState();
    if (sessionState.selectedIds.length === 0) {
      return;
    }
    const tile = this.screenToTile(worldX, worldY);
    const selected = this.session.getSelectedEntities();
    const unitIds = selected.filter((entity) => entity.kind === "unit").map((entity) => entity.id);
    if (sessionState.buildMode && unitIds.length > 0) {
      this.session.issueCommand({
        type: "build",
        unitIds,
        buildingType: sessionState.buildMode,
        tile,
      });
      return;
    }
    if (unitIds.length === 0 && selected[0]?.kind === "building") {
      this.session.issueCommand({
        type: "setRally",
        buildingId: selected[0].id,
        tile,
      });
      this.pings.push({ tile, ttlMs: 1800 });
      return;
    }
    const entity = this.findTargetAtPoint(worldX, worldY, tile);
    if (entity?.kind === "resource") {
      if (this.session.issueCommand({ type: "gather", unitIds, targetId: entity.id })) {
        this.markTargetHighlight(entity.id, "gather");
      }
    } else if ((entity?.kind === "unit" || entity?.kind === "building") && entity.playerId === "ai") {
      if (this.session.issueCommand({ type: "attack", unitIds, targetId: entity.id })) {
        this.markTargetHighlight(entity.id, "attack");
      }
    } else {
      this.session.issueCommand({ type: "move", unitIds, destination: tile });
      this.pings.push({ tile, ttlMs: 1800 });
    }
  }

  private handlePrimaryCommand(tile: TilePoint): void {
    const sessionState = this.session.getSessionState();
    const selected = this.session.getSelectedEntities();
    const unitIds = selected.filter((entity) => entity.kind === "unit").map((entity) => entity.id);
    const pointer = this.input.activePointer;
    const worldPoint = this.getPointerWorldPoint(pointer);
    const target = this.findTargetAtPoint(worldPoint.x, worldPoint.y, tile);

    if (sessionState.buildMode && unitIds.length > 0) {
      this.session.issueCommand({
        type: "build",
        unitIds,
        buildingType: sessionState.buildMode,
        tile,
      });
      this.pings.push({ tile, ttlMs: 1800 });
      return;
    }

    if (sessionState.commandMode === "rally" && selected[0]?.kind === "building") {
      this.session.issueCommand({
        type: "setRally",
        buildingId: selected[0].id,
        tile,
      });
      this.pings.push({ tile, ttlMs: 1800 });
      return;
    }

    if (sessionState.commandMode === "gather" && unitIds.length > 0 && target?.kind === "resource") {
      if (this.session.issueCommand({ type: "gather", unitIds, targetId: target.id })) {
        this.markTargetHighlight(target.id, "gather");
      }
      return;
    }

    if (sessionState.commandMode === "attack" && unitIds.length > 0) {
      if ((target?.kind === "unit" || target?.kind === "building") && target.playerId === "ai") {
        if (this.session.issueCommand({ type: "attack", unitIds, targetId: target.id })) {
          this.markTargetHighlight(target.id, "attack");
        }
      } else {
        this.session.issueCommand({ type: "attackMove", unitIds, destination: tile });
      }
      this.pings.push({ tile, ttlMs: 1800 });
      return;
    }

    if (sessionState.commandMode === "move" && unitIds.length > 0) {
      this.session.issueCommand({ type: "move", unitIds, destination: tile });
      this.pings.push({ tile, ttlMs: 1800 });
    }
  }

  private findTargetAtPoint(worldX: number, worldY: number, tile: TilePoint): Entity | undefined {
    const closestUnit = this.findClosestUnitAtWorldPoint(worldX, worldY, (unit) => unit.playerId === "ai");
    if (closestUnit) {
      return closestUnit;
    }
    return Object.values(this.session.getWorld().entities).find((entity) => {
      if (entity.kind === "unit") {
        return false;
      }
      if (entity.kind === "building") {
        const definition = BUILDING_DEFINITIONS[entity.buildingType];
        return tile.x >= entity.tile.x
          && tile.y >= entity.tile.y
          && tile.x < entity.tile.x + definition.footprint.x
          && tile.y < entity.tile.y + definition.footprint.y;
      }
      return entity.tile.x === tile.x && entity.tile.y === tile.y;
    });
  }

  private findPlayerEntityAtPoint(worldX: number, worldY: number, tile: TilePoint): Entity | undefined {
    const closestUnit = this.findClosestUnitAtWorldPoint(worldX, worldY, (unit) => unit.playerId === "player");
    if (closestUnit) {
      return closestUnit;
    }
    return Object.values(this.session.getWorld().entities).find((entity) => {
      if (!this.isEntityVisibleToPlayer(this.session.getWorld(), entity)) {
        return false;
      }
      if (entity.kind === "unit") {
        return false;
      }
      if (entity.kind === "building") {
        if (entity.playerId !== "player") {
          return false;
        }
        const definition = BUILDING_DEFINITIONS[entity.buildingType];
        return tile.x >= entity.tile.x
          && tile.y >= entity.tile.y
          && tile.x < entity.tile.x + definition.footprint.x
          && tile.y < entity.tile.y + definition.footprint.y;
      }
      return false;
    });
  }

  private findClosestUnitAtWorldPoint(worldX: number, worldY: number, predicate: (unit: UnitEntity) => boolean): UnitEntity | undefined {
    let bestUnit: UnitEntity | undefined;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const entity of Object.values(this.session.getWorld().entities)) {
      if (entity.kind !== "unit" || !predicate(entity) || !this.isEntityVisibleToPlayer(this.session.getWorld(), entity)) {
        continue;
      }
      const size = getUnitRenderSize(entity);
      const point = this.tileToScreen(entity.position);
      const hitCenterX = point.x;
      const hitCenterY = point.y + 2;
      const radiusX = entity.unitType === "ramCart" ? 30 : size * 1.55 + 10;
      const radiusY = entity.unitType === "ramCart" ? 24 : size * 2.15 + 12;
      const normalizedDistance = (((worldX - hitCenterX) ** 2) / (radiusX ** 2)) + (((worldY - hitCenterY) ** 2) / (radiusY ** 2));
      if (normalizedDistance <= 1.2 && normalizedDistance < bestDistance) {
        bestUnit = entity;
        bestDistance = normalizedDistance;
      }
    }

    return bestUnit;
  }

  private selectEntitiesInWorldRect(from: TilePoint, to: TilePoint): void {
    const selectedIds = getBoxSelectionIds(this.session.getWorld(), from, to, (tile) => this.tileToScreen(tile));
    this.session.setSelection(selectedIds);
  }

  private markTargetHighlight(entityId: string, tone: TargetHighlightTone): void {
    this.targetHighlights.set(entityId, {
      tone,
      untilMs: this.time.now + 1800,
    });
  }

  private collectTargetIndicators(world: WorldState, selectedIds: string[]): Array<TargetIndicator & { emphasis: number }> {
    const indicators = new Map<string, TargetIndicator & { emphasis: number }>();
    const now = this.time.now;

    for (const [entityId, highlight] of this.targetHighlights.entries()) {
      if (highlight.untilMs <= now || !world.entities[entityId]) {
        continue;
      }
      indicators.set(entityId, {
        id: entityId,
        tone: highlight.tone,
        source: "issued",
        emphasis: clamp((highlight.untilMs - now) / 1800, 0.55, 1),
      });
    }

    for (const selectedId of selectedIds) {
      const entity = world.entities[selectedId];
      if (!entity || entity.kind !== "unit") {
        continue;
      }
      if (entity.order.type !== "attack" && entity.order.type !== "gather") {
        continue;
      }
      const target = world.entities[entity.order.targetId];
      if (!target) {
        continue;
      }
      const tone: TargetHighlightTone = entity.order.type === "attack" ? "attack" : "gather";
      const existing = indicators.get(target.id);
      indicators.set(target.id, {
        id: target.id,
        tone,
        source: existing?.source ?? "selected",
        emphasis: Math.max(existing?.emphasis ?? 0, 0.78),
      });
    }

    return [...indicators.values()];
  }

  private drawTargetIndicator(
    graphics: Phaser.GameObjects.Graphics,
    entity: Entity,
    tone: TargetHighlightTone,
    emphasis: number,
  ): void {
    const color = tone === "attack" ? 0xdb6c5f : 0x90c46b;
    const pulse = this.settings.reducedMotion ? 0.92 : 0.76 + ((Math.sin(this.time.now / 140) + 1) * 0.5) * 0.24;
    const alpha = clamp(emphasis * pulse, 0.45, 1);

    if (entity.kind === "building") {
      const footprint = BUILDING_DEFINITIONS[entity.buildingType].footprint;
      const corners = [
        this.tileToScreen({ x: entity.tile.x, y: entity.tile.y }),
        this.tileToScreen({ x: entity.tile.x + footprint.x, y: entity.tile.y }),
        this.tileToScreen({ x: entity.tile.x + footprint.x, y: entity.tile.y + footprint.y }),
        this.tileToScreen({ x: entity.tile.x, y: entity.tile.y + footprint.y }),
      ];
      graphics.fillStyle(color, tone === "attack" ? 0.08 : 0.06);
      graphics.lineStyle(3, color, alpha);
      graphics.beginPath();
      graphics.moveTo(corners[0].x, corners[0].y);
      for (const corner of corners.slice(1)) {
        graphics.lineTo(corner.x, corner.y);
      }
      graphics.closePath();
      graphics.fillPath();
      graphics.strokePath();

      const center = this.tileToScreen({
        x: entity.tile.x + footprint.x / 2,
        y: entity.tile.y + footprint.y / 2,
      });
      const radius = 18 + Math.max(footprint.x, footprint.y) * 12 + pulse * 8;
      graphics.lineStyle(2, color, clamp(alpha * 0.85, 0.45, 0.92));
      graphics.strokeCircle(center.x, center.y + 12, radius);
      return;
    }

    const point = entity.kind === "unit"
      ? this.tileToScreen(entity.position)
      : this.tileToScreen({ x: entity.tile.x + 0.5, y: entity.tile.y + 0.5 });
    const radius = entity.kind === "unit" ? 16 + pulse * 7 : 14 + pulse * 5;
    graphics.lineStyle(3, color, alpha);
    graphics.strokeCircle(point.x, point.y + 12, radius);
    graphics.lineStyle(2, color, clamp(alpha * 0.85, 0.45, 0.92));
    graphics.strokeCircle(point.x, point.y + 12, Math.max(8, radius - 7));
  }

  private cleanupTargetHighlights(world: WorldState): void {
    const now = this.time.now;
    for (const [entityId, highlight] of [...this.targetHighlights.entries()]) {
      if (highlight.untilMs <= now || !world.entities[entityId]) {
        this.targetHighlights.delete(entityId);
      }
    }
  }

  private updateDamageFlashes(world: WorldState): void {
    const now = this.time.now;
    const liveIds = new Set<string>();
    for (const entity of Object.values(world.entities)) {
      if (entity.kind === "resource") {
        continue;
      }
      liveIds.add(entity.id);
      const previousHp = this.previousHpByEntity.get(entity.id);
      if (previousHp !== undefined && entity.hp < previousHp) {
        this.hitFlashes.set(entity.id, now + 160);
      }
      this.previousHpByEntity.set(entity.id, entity.hp);
    }

    for (const entityId of [...this.previousHpByEntity.keys()]) {
      if (!liveIds.has(entityId)) {
        this.previousHpByEntity.delete(entityId);
        this.hitFlashes.delete(entityId);
      }
    }

    for (const [entityId, untilMs] of [...this.hitFlashes.entries()]) {
      if (untilMs <= now) {
        this.hitFlashes.delete(entityId);
      }
    }
  }

  private isEntityVisibleToPlayer(world: WorldState, entity: Entity): boolean {
    if (entity.kind === "resource") {
      return world.players.player.explored[tileIndex(world.map, entity.tile)];
    }
    if (entity.playerId === "player") {
      return true;
    }
    const tile = entity.kind === "unit"
      ? { x: Math.round(entity.position.x), y: Math.round(entity.position.y) }
      : entity.tile;
    return world.players.player.visible[tileIndex(world.map, tile)];
  }

  private tileToScreen(tile: { x: number; y: number }): TilePoint {
    return {
      x: this.origin.x + (tile.x - tile.y) * (this.tileWidth / 2),
      y: this.origin.y + (tile.x + tile.y) * (this.tileHeight / 2),
    };
  }

  private getCanvasMetrics(): CanvasMetrics {
    const rect = this.game.canvas.getBoundingClientRect();
    const displayWidth = rect.width || this.scale.displaySize.width;
    const displayHeight = rect.height || this.scale.displaySize.height;
    return {
      displayWidth,
      displayHeight,
      scaleX: displayWidth / this.scale.gameSize.width,
      scaleY: displayHeight / this.scale.gameSize.height,
    };
  }

  private screenToWorld(point: TilePoint): TilePoint {
    const camera = this.cameras.main;
    const metrics = this.getCanvasMetrics();
    return {
      x: point.x / metrics.scaleX / camera.zoom + camera.scrollX,
      y: point.y / metrics.scaleY / camera.zoom + camera.scrollY,
    };
  }

  private getPointerCanvasPoint(pointer: Phaser.Input.Pointer): TilePoint {
    const domEvent = pointer.event as MouseEvent | undefined;
    if (domEvent) {
      const rect = this.game.canvas.getBoundingClientRect();
      return {
        x: domEvent.clientX - rect.left,
        y: domEvent.clientY - rect.top,
      };
    }
    const metrics = this.getCanvasMetrics();
    return {
      x: pointer.x * metrics.scaleX,
      y: pointer.y * metrics.scaleY,
    };
  }

  private isPointerInsideCanvas(pointer: Phaser.Input.Pointer | undefined): boolean {
    if (!pointer) {
      return false;
    }
    const domEvent = pointer.event as MouseEvent | undefined;
    const rect = this.game.canvas.getBoundingClientRect();
    if (domEvent) {
      return domEvent.clientX >= rect.left
        && domEvent.clientX <= rect.right
        && domEvent.clientY >= rect.top
        && domEvent.clientY <= rect.bottom;
    }
    const point = this.getPointerCanvasPoint(pointer);
    return point.x >= 0 && point.y >= 0 && point.x <= rect.width && point.y <= rect.height;
  }

  private getPointerWorldPoint(pointer: Phaser.Input.Pointer): TilePoint {
    return this.screenToWorld(this.getPointerCanvasPoint(pointer));
  }

  private worldToScreenPoint(world: TilePoint): TilePoint {
    const camera = this.cameras.main;
    const metrics = this.getCanvasMetrics();
    return {
      x: (world.x - camera.scrollX) * camera.zoom * metrics.scaleX,
      y: (world.y - camera.scrollY) * camera.zoom * metrics.scaleY,
    };
  }

  private screenToTile(worldX: number, worldY: number): TilePoint {
    const localX = worldX - this.origin.x;
    const localY = worldY - this.origin.y;
    const isoX = localX / (this.tileWidth / 2);
    const isoY = localY / (this.tileHeight / 2);
    return {
      x: clamp(Math.floor((isoX + isoY) / 2), 0, this.session.getWorld().map.width - 1),
      y: clamp(Math.floor((isoY - isoX) / 2), 0, this.session.getWorld().map.height - 1),
    };
  }

  private isSecondaryCommand(pointer: Phaser.Input.Pointer): boolean {
    const domEvent = pointer.event as MouseEvent | undefined;
    return pointer.button === 2 || Boolean(domEvent?.button === 2) || Boolean(domEvent?.ctrlKey) || Boolean(domEvent?.altKey);
  }

  private clearDragSelection(): void {
    this.dragStart = undefined;
    this.dragCurrent = undefined;
  }
}
