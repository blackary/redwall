import Phaser from "phaser";
import { BUILDING_DEFINITIONS, RESEARCH_DEFINITIONS, UNIT_DEFINITIONS } from "../core/content";
import { tileIndex } from "../core/map";
import type { BuildingEntity, BuildingType, Entity, TilePoint, UnitEntity, WorldState } from "../core/types";
import { GameSession } from "../app/GameSession";
import type { GameSettings } from "../persistence/storage";

type Ping = { tile: TilePoint; ttlMs: number };
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

function getBuildingPalette(building: BuildingEntity): BuildingPalette {
  const playerPalette = building.playerId === "player"
    ? {
        wall: 0xc8ae80,
        roof: 0x9a5f44,
        trim: 0xf1e1b2,
        accent: 0x58725f,
        banner: 0xdcbf73,
        shadow: 0x1b1410,
      }
    : {
        wall: 0x8d5a52,
        roof: 0x5f221c,
        trim: 0xd8a48d,
        accent: 0x6b2d27,
        banner: 0xc96e5c,
        shadow: 0x190f0f,
      };

  switch (building.buildingType) {
    case "granary":
      return { ...playerPalette, roof: building.playerId === "player" ? 0x8b7841 : 0x5c4130, accent: 0xc9944f };
    case "range":
      return { ...playerPalette, roof: building.playerId === "player" ? 0x496d4c : 0x40503d, accent: 0xd8b77d };
    case "blacksmith":
      return { ...playerPalette, roof: building.playerId === "player" ? 0x4b4e55 : 0x423639, accent: 0xe08b4e };
    case "longPatrolLodge":
      return { ...playerPalette, roof: building.playerId === "player" ? 0xa14538 : 0x7d2b26, accent: 0xefc178 };
    case "tower":
    case "wall":
    case "gate":
      return { ...playerPalette, wall: building.playerId === "player" ? 0xa5a196 : 0x77635f, roof: building.playerId === "player" ? 0x7e8687 : 0x5a3d3a };
    case "workshop":
      return { ...playerPalette, roof: building.playerId === "player" ? 0x7a5a34 : 0x603825, accent: 0xc78948 };
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

function getUnitPalette(unit: UnitEntity): UnitPalette {
  const friendly = unit.playerId === "player";
  const base = friendly
    ? { fur: 0xf0d7aa, cloth: 0x4a6456, accent: 0xdbbc73, metal: 0x8e8f95, shadow: 0x1d1712 }
    : { fur: 0xc06d63, cloth: 0x5b2421, accent: 0xcf8f77, metal: 0x76686d, shadow: 0x170f0f };

  switch (unit.unitType) {
    case "worker":
      return { ...base, cloth: friendly ? 0x5c7254 : 0x5d3326 };
    case "shrewScout":
      return { ...base, fur: friendly ? 0xc8b89d : 0xb87368, cloth: friendly ? 0x4f6c81 : 0x6d3640 };
    case "militia":
      return { ...base, fur: friendly ? 0xd9c59f : 0xc97d6b, cloth: friendly ? 0x6a5139 : 0x723830 };
    case "shieldbearer":
      return { ...base, fur: friendly ? 0xe1cfab : 0xca806e, cloth: friendly ? 0x6a4b34 : 0x6f3027 };
    case "slinger":
      return { ...base, fur: friendly ? 0xe2d0ae : 0xc78673, cloth: friendly ? 0x4e6f57 : 0x6a4032 };
    case "archer":
      return { ...base, fur: friendly ? 0xe0cba4 : 0xc97f6d, cloth: friendly ? 0x4f6a5e : 0x6a3330 };
    case "otterSkirmisher":
      return { ...base, fur: friendly ? 0x8f7253 : 0x8d5048, cloth: friendly ? 0x436f73 : 0x5f3232, accent: friendly ? 0xe4cb8c : 0xd99272 };
    case "hareRunner":
      return { ...base, fur: friendly ? 0xe9cf9f : 0xd2856d, cloth: friendly ? 0xa34a3c : 0x7b2d27 };
    case "badgerChampion":
      return { fur: 0xe8e3d7, cloth: friendly ? 0x7a4334 : 0x6a2d28, accent: 0xf0d391, metal: 0xa9aaaf, shadow: 0x161212 };
    case "ramCart":
      return { fur: 0x8d6844, cloth: 0x6a4a2b, accent: friendly ? 0xd7b36f : 0xb96e56, metal: 0x77716c, shadow: 0x18120f };
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
  private dragStart?: TilePoint;
  private dragCurrent?: TilePoint;
  private cameraKeys?: Record<string, Phaser.Input.Keyboard.Key>;
  private pings: Ping[] = [];
  private isPanning = false;
  private lastPanPoint?: { x: number; y: number };
  private lastSelectionClick?: { entityId: string; atMs: number };

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
      if (pointer.button === 1 || Boolean(domEvent?.shiftKey)) {
        this.isPanning = true;
        this.lastPanPoint = { x: pointer.x, y: pointer.y };
        return;
      }
      if (this.isSecondaryCommand(pointer)) {
        return;
      }
      this.dragStart = this.screenToTile(pointer.worldX, pointer.worldY);
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
      this.dragCurrent = this.screenToTile(pointer.worldX, pointer.worldY);
    });

    this.input.on("pointerup", (pointer: Phaser.Input.Pointer) => {
      const domEvent = pointer.event as MouseEvent | undefined;
      if (this.isPanning) {
        this.isPanning = false;
        this.lastPanPoint = undefined;
        this.clearDragSelection();
        return;
      }
      if (this.isSecondaryCommand(pointer)) {
        this.handleContextCommand(pointer.worldX, pointer.worldY);
        this.clearDragSelection();
        return;
      }
      if (!this.dragStart) {
        return;
      }
      const end = this.screenToTile(pointer.worldX, pointer.worldY);
      const sessionState = this.session.getSessionState();
      if (sessionState.buildMode || sessionState.commandMode) {
        this.handlePrimaryCommand(end);
        this.clearDragSelection();
        return;
      }
      const start = this.dragStart;
      const distance = Math.abs(start.x - end.x) + Math.abs(start.y - end.y);
      if (distance > 1) {
        this.session.selectUnitsInBox(start, end);
        this.lastSelectionClick = undefined;
      } else {
        this.handleSelection(pointer.worldX, pointer.worldY, end, {
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
  }

  public getScreenPointForTile(tile: TilePoint): TilePoint {
    const world = this.tileToScreen({ x: tile.x + 0.5, y: tile.y + 0.5 });
    const camera = this.cameras.main;
    const scaleX = this.scale.displaySize.width / this.scale.gameSize.width;
    const scaleY = this.scale.displaySize.height / this.scale.gameSize.height;
    return {
      x: (world.x - camera.scrollX) * camera.zoom * scaleX,
      y: (world.y - camera.scrollY) * camera.zoom * scaleY,
    };
  }

  public getScreenPointForEntity(entityId: string): TilePoint | undefined {
    const entity = this.session.getWorld().entities[entityId];
    if (!entity) {
      return undefined;
    }
    const tile = entity.kind === "unit"
      ? { x: entity.position.x, y: entity.position.y }
      : entity.kind === "building"
        ? { x: entity.tile.x + 0.5, y: entity.tile.y + 0.5 }
        : { x: entity.tile.x + 0.5, y: entity.tile.y + 0.5 };
    return this.getScreenPointForTile(tile);
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
        this.drawBuilding(graphics, entity, selectedIds.includes(entity.id));
        continue;
      }
      this.drawUnit(graphics, entity, selectedIds.includes(entity.id));
    }
    for (const projectile of world.projectiles) {
      const point = this.tileToScreen(projectile.position);
      graphics.fillStyle(projectile.playerId === "player" ? 0xf2dfa8 : 0xc65d5d, 1);
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
    if (this.dragStart && this.dragCurrent) {
      const start = this.tileToScreen(this.dragStart);
      const end = this.tileToScreen(this.dragCurrent);
      graphics.lineStyle(2, 0xf2dfa8, 0.9);
      graphics.fillStyle(0xf2dfa8, 0.08);
      graphics.fillRect(
        Math.min(start.x, end.x),
        Math.min(start.y, end.y),
        Math.abs(end.x - start.x),
        Math.abs(end.y - start.y),
      );
      graphics.strokeRect(
        Math.min(start.x, end.x),
        Math.min(start.y, end.y),
        Math.abs(end.x - start.x),
        Math.abs(end.y - start.y),
      );
    }

    if (buildMode && this.input.activePointer) {
      const tile = this.screenToTile(this.input.activePointer.worldX, this.input.activePointer.worldY);
      const definition = BUILDING_DEFINITIONS[buildMode];
      const top = this.tileToScreen(tile);
      const width = definition.footprint.x * (this.tileWidth / 2);
      const height = definition.footprint.y * (this.tileHeight / 2);
      graphics.lineStyle(2, 0xdab16c, 0.9);
      graphics.strokeRect(top.x - width / 2, top.y, width * 2, height * 2);
    }

    if (!buildMode && commandMode && this.input.activePointer) {
      const tile = this.screenToTile(this.input.activePointer.worldX, this.input.activePointer.worldY);
      const point = this.tileToScreen({ x: tile.x + 0.5, y: tile.y + 0.5 });
      const color = commandMode === "attack" ? 0xd16a6a : commandMode === "gather" ? 0x8fb66a : 0x8fbac3;
      graphics.lineStyle(2, color, 0.9);
      graphics.strokeCircle(point.x, point.y + 12, 18);
    }

    for (const ping of this.pings) {
      const point = this.tileToScreen({ x: ping.tile.x + 0.5, y: ping.tile.y + 0.5 });
      const radius = this.settings.reducedMotion ? 18 : 10 + ((1800 - ping.ttlMs) / 1800) * 22;
      const alpha = this.settings.reducedMotion ? 0.85 : ping.ttlMs / 1800;
      graphics.lineStyle(2, 0xf2dfa8, alpha);
      graphics.strokeCircle(point.x, point.y + 12, radius);
    }

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

  private drawBuilding(graphics: Phaser.GameObjects.Graphics, building: BuildingEntity, selected: boolean): void {
    const definition = BUILDING_DEFINITIONS[building.buildingType];
    const palette = getBuildingPalette(building);
    const point = this.tileToScreen({
      x: building.tile.x + definition.footprint.x / 2,
      y: building.tile.y + definition.footprint.y / 2,
    });
    const width = definition.footprint.x * 38;
    const height = definition.footprint.y * 24 + 30;
    const topY = point.y - 18;
    const bodyHeight = height - 10;

    graphics.fillStyle(palette.shadow, 0.26);
    graphics.fillEllipse(point.x, point.y + height * 0.45, width * 1.1, 18 + definition.footprint.y * 7);

    graphics.lineStyle(selected ? 3 : 2, selected ? 0xf2dfa8 : 0x241710, 1);
    graphics.fillStyle(palette.wall, building.completed ? 0.98 : 0.58);
    graphics.fillRoundedRect(point.x - width / 2, topY + 18, width, bodyHeight - 18, 12);
    graphics.strokeRoundedRect(point.x - width / 2, topY + 18, width, bodyHeight - 18, 12);

    this.drawBuildingRoof(graphics, building, point.x, topY, width, height, palette);
    this.drawBuildingDetails(graphics, building, point.x, topY, width, height, palette);
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
  ): void {
    const bodyTop = topY + 22;

    graphics.fillStyle(0x2b1d12, 0.75);
    graphics.fillRect(centerX - 8, topY + height - 14, 16, 22);
    graphics.fillStyle(palette.trim, 0.85);
    graphics.fillRect(centerX - 4, topY + height - 10, 8, 18);

    if (building.buildingType !== "wall" && building.buildingType !== "gate") {
      graphics.fillStyle(palette.banner, building.completed ? 0.95 : 0.6);
      graphics.fillRect(centerX + width * 0.22, bodyTop + 4, 8, 18);
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

  private drawUnit(graphics: Phaser.GameObjects.Graphics, unit: UnitEntity, selected: boolean): void {
    const point = this.tileToScreen(unit.position);
    const palette = getUnitPalette(unit);
    const species = getUnitSpecies(unit);
    const size = species === "badger"
      ? 16
      : species === "machine"
        ? 17
        : species === "hare"
          ? 13
          : species === "otter"
            ? 12
            : species === "shrew"
              ? 10
              : 11;
    if (selected) {
      graphics.lineStyle(2, 0xf2dfa8, 1);
      graphics.strokeEllipse(point.x, point.y + 15, species === "machine" ? 40 : 36, species === "machine" ? 18 : 16);
    }
    graphics.fillStyle(palette.shadow, 0.25);
    graphics.fillEllipse(point.x, point.y + 16, species === "machine" ? size * 2.6 : size * 2.2, species === "machine" ? 12 : 10);

    if (species === "machine") {
      this.drawRamCart(graphics, point, palette);
    } else {
      const belly = mixColor(palette.fur, 0xf8f2e4, species === "badger" ? 0.45 : 0.3);
      const cloak = mixColor(palette.cloth, 0x1a130d, 0.18);
      this.drawSpeciesTail(graphics, point, size, palette, species);
      this.drawSpeciesLegs(graphics, point, size, palette, species);
      graphics.fillStyle(cloak, 0.95);
      graphics.fillTriangle(point.x - size * 0.9, point.y + 4, point.x + size * 0.8, point.y + 4, point.x - size * 0.08, point.y + size * 1.5);
      graphics.fillStyle(palette.cloth, 1);
      graphics.fillRoundedRect(point.x - size * 0.62, point.y - 2, size * 1.2, size * 1.38, 6);
      graphics.fillStyle(mixColor(palette.accent, 0xffffff, 0.18), 0.95);
      graphics.fillRect(point.x - size * 0.42, point.y + size * 0.34, size * 0.84, 3);
      graphics.fillStyle(belly, 0.9);
      graphics.fillEllipse(point.x + size * 0.04, point.y + size * 0.2, size * 0.8, size * 0.98);
      this.drawSpeciesHead(graphics, point, size, palette, species);
      this.drawUnitGear(graphics, point, size, palette, unit, species);
      graphics.fillStyle(palette.accent, 0.92);
      graphics.fillRect(point.x - 4, point.y - 1, 8, 10);
    }
    graphics.fillStyle(0x20160f, 1);
    graphics.fillRect(point.x - 16, point.y - 24, 32, 5);
    graphics.fillStyle(0x79bb72, 1);
    graphics.fillRect(point.x - 16, point.y - 24, 32 * Math.max(0, unit.hp) / unit.maxHp, 5);
  }

  private drawRamCart(graphics: Phaser.GameObjects.Graphics, point: TilePoint, palette: UnitPalette): void {
    const wood = mixColor(palette.fur, 0x4f321d, 0.36);
    const hide = mixColor(palette.cloth, 0xd2bf8d, 0.16);
    graphics.fillStyle(wood, 1);
    graphics.fillRoundedRect(point.x - 18, point.y + 1, 28, 13, 4);
    graphics.fillStyle(mixColor(wood, 0xf3e1b6, 0.18), 0.95);
    graphics.fillRect(point.x - 17, point.y + 4, 22, 3);
    graphics.fillStyle(palette.metal, 1);
    graphics.fillRect(point.x - 5, point.y + 3, 24, 4);
    graphics.fillTriangle(point.x + 16, point.y + 2, point.x + 28, point.y + 8, point.x + 16, point.y + 14);
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
  ): void {
    const tailColor = mixColor(palette.fur, palette.shadow, 0.2);
    switch (species) {
      case "mouse":
        graphics.lineStyle(2, mixColor(palette.fur, 0xe8b8a7, 0.35), 0.95);
        graphics.strokeLineShape(new Phaser.Geom.Line(point.x - size * 0.35, point.y + size * 0.9, point.x - size * 1.45, point.y + size * 1.1));
        graphics.strokeLineShape(new Phaser.Geom.Line(point.x - size * 1.45, point.y + size * 1.1, point.x - size * 1.82, point.y + size * 0.4));
        break;
      case "shrew":
        graphics.lineStyle(2, mixColor(palette.fur, 0xe4b9a4, 0.26), 0.95);
        graphics.strokeLineShape(new Phaser.Geom.Line(point.x - size * 0.48, point.y + size * 0.82, point.x - size * 1.55, point.y + size * 0.95));
        graphics.strokeLineShape(new Phaser.Geom.Line(point.x - size * 1.55, point.y + size * 0.95, point.x - size * 2.2, point.y + size * 0.18));
        break;
      case "otter":
        graphics.fillStyle(tailColor, 0.95);
        graphics.fillEllipse(point.x - size * 0.95, point.y + size * 0.84, size * 1.15, size * 0.4);
        break;
      case "hare":
        graphics.fillStyle(mixColor(palette.fur, 0xf4eee2, 0.32), 1);
        graphics.fillCircle(point.x - size * 0.7, point.y + size * 0.76, size * 0.16);
        break;
      case "badger":
        graphics.fillStyle(tailColor, 1);
        graphics.fillRoundedRect(point.x - size * 0.8, point.y + size * 0.75, size * 0.42, size * 0.2, 3);
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
  ): void {
    const footColor = mixColor(palette.fur, palette.shadow, 0.16);
    const footY = point.y + size * 1.26;
    if (species === "hare") {
      graphics.fillStyle(footColor, 1);
      graphics.fillEllipse(point.x - size * 0.26, footY, size * 0.44, size * 0.18);
      graphics.fillEllipse(point.x + size * 0.24, footY - 1, size * 0.5, size * 0.18);
      return;
    }
    graphics.fillStyle(footColor, 1);
    graphics.fillEllipse(point.x - size * 0.2, footY, size * 0.3, size * 0.16);
    graphics.fillEllipse(point.x + size * 0.2, footY, size * 0.3, size * 0.16);
  }

  private drawSpeciesHead(
    graphics: Phaser.GameObjects.Graphics,
    point: TilePoint,
    size: number,
    palette: UnitPalette,
    species: UnitSpecies,
  ): void {
    const headX = point.x + size * 0.06;
    const headY = point.y - size * 0.76;
    const earColor = mixColor(palette.fur, 0xe7bca3, 0.24);
    const muzzleColor = mixColor(palette.fur, 0xf8f1e3, 0.38);

    switch (species) {
      case "mouse":
        graphics.fillStyle(earColor, 1);
        graphics.fillCircle(headX - size * 0.33, headY - size * 0.22, size * 0.24);
        graphics.fillCircle(headX + size * 0.18, headY - size * 0.26, size * 0.24);
        graphics.fillStyle(palette.fur, 1);
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
        graphics.fillStyle(palette.fur, 1);
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
        graphics.fillStyle(palette.fur, 1);
        graphics.fillEllipse(headX, headY, size * 0.98, size * 0.62);
        graphics.fillStyle(muzzleColor, 0.95);
        graphics.fillEllipse(headX + size * 0.18, headY + size * 0.05, size * 0.52, size * 0.26);
        graphics.fillStyle(mixColor(palette.accent, 0x23170e, 0.16), 1);
        graphics.fillCircle(headX + size * 0.42, headY + size * 0.04, size * 0.06);
        this.drawWhiskers(graphics, headX + size * 0.18, headY + size * 0.06, size * 0.36, palette.shadow);
        break;
      case "hare":
        graphics.fillStyle(palette.fur, 1);
        graphics.fillTriangle(headX - size * 0.18, headY - size * 0.1, headX + size * 0.02, headY - size * 1.34, headX + size * 0.18, headY - size * 0.1);
        graphics.fillTriangle(headX + size * 0.12, headY - size * 0.08, headX + size * 0.36, headY - size * 1.26, headX + size * 0.5, headY - size * 0.06);
        graphics.fillStyle(earColor, 1);
        graphics.fillTriangle(headX - size * 0.04, headY - size * 0.18, headX + size * 0.05, headY - size * 1.02, headX + size * 0.12, headY - size * 0.12);
        graphics.fillTriangle(headX + size * 0.2, headY - size * 0.16, headX + size * 0.29, headY - size * 0.94, headX + size * 0.36, headY - size * 0.1);
        graphics.fillStyle(palette.fur, 1);
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
        graphics.fillStyle(palette.fur, 1);
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
  ): void {
    const wood = mixColor(palette.accent, 0x4a301b, 0.36);
    if (UNIT_DEFINITIONS[unit.unitType].tags.includes("ranged")) {
      graphics.lineStyle(2, wood, 0.95);
      graphics.strokeLineShape(new Phaser.Geom.Line(point.x + size * 0.46, point.y - size * 0.28, point.x + size * 1.08, point.y + size * 0.58));
      graphics.strokeLineShape(new Phaser.Geom.Line(point.x + size * 1.08, point.y - size * 0.22, point.x + size * 1.08, point.y + size * 0.58));
      if (unit.unitType === "otterSkirmisher") {
        graphics.lineStyle(2, palette.metal, 0.95);
        graphics.strokeLineShape(new Phaser.Geom.Line(point.x - size * 0.08, point.y - size * 0.18, point.x + size * 1.12, point.y + size * 0.34));
      }
      return;
    }

    if (unit.unitType === "worker") {
      graphics.fillStyle(wood, 1);
      graphics.fillRect(point.x + size * 0.5, point.y - size * 0.34, 3, size * 1.58);
      graphics.fillStyle(palette.metal, 1);
      graphics.fillRect(point.x + size * 0.32, point.y - size * 0.48, size * 0.62, 4);
      graphics.fillStyle(mixColor(palette.cloth, 0x684a2d, 0.28), 0.95);
      graphics.fillCircle(point.x - size * 0.58, point.y + size * 0.44, size * 0.18);
      return;
    }

    if (unit.unitType === "shieldbearer") {
      graphics.fillStyle(palette.accent, 1);
      graphics.fillCircle(point.x - size * 0.72, point.y + size * 0.38, size * 0.44);
      graphics.fillStyle(mixColor(palette.metal, 0xf3e2b1, 0.12), 1);
      graphics.fillCircle(point.x - size * 0.72, point.y + size * 0.38, size * 0.12);
    }

    graphics.fillStyle(species === "hare" ? palette.accent : palette.metal, 1);
    graphics.fillRect(point.x + size * 0.52, point.y - size * 0.58, 3, size * 1.74);
    if (unit.unitType === "badgerChampion") {
      graphics.fillStyle(palette.metal, 1);
      graphics.fillTriangle(point.x + size * 0.48, point.y - size * 0.5, point.x + size * 1.08, point.y - size * 0.2, point.x + size * 0.48, point.y + size * 0.08);
      return;
    }
    if (unit.unitType === "hareRunner") {
      graphics.lineStyle(2, palette.metal, 0.95);
      graphics.strokeLineShape(new Phaser.Geom.Line(point.x + size * 0.48, point.y + size * 0.16, point.x + size * 1.22, point.y + size * 0.02));
      return;
    }
    graphics.fillStyle(palette.metal, 1);
    graphics.fillTriangle(point.x + size * 0.38, point.y - size * 0.7, point.x + size * 0.66, point.y - size * 1.02, point.x + size * 0.96, point.y - size * 0.64);
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
      this.session.issueCommand({ type: "gather", unitIds, targetId: entity.id });
    } else if ((entity?.kind === "unit" || entity?.kind === "building") && entity.playerId === "ai") {
      this.session.issueCommand({ type: "attack", unitIds, targetId: entity.id });
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
    const target = this.findTargetAtPoint(pointer.worldX, pointer.worldY, tile);

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
      this.session.issueCommand({ type: "gather", unitIds, targetId: target.id });
      return;
    }

    if (sessionState.commandMode === "attack" && unitIds.length > 0) {
      if ((target?.kind === "unit" || target?.kind === "building") && target.playerId === "ai") {
        this.session.issueCommand({ type: "attack", unitIds, targetId: target.id });
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
      const point = this.tileToScreen(entity.position);
      const distance = Phaser.Math.Distance.Between(point.x, point.y + 6, worldX, worldY);
      if (distance <= 34 && distance < bestDistance) {
        bestUnit = entity;
        bestDistance = distance;
      }
    }

    return bestUnit;
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
