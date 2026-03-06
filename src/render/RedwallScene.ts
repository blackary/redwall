import Phaser from "phaser";
import { BUILDING_DEFINITIONS, UNIT_DEFINITIONS } from "../core/content";
import { tileIndex } from "../core/map";
import type { BuildingEntity, BuildingType, Entity, TilePoint, UnitEntity, WorldState } from "../core/types";
import { GameSession } from "../app/GameSession";

type Ping = { tile: TilePoint; ttlMs: number };

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export class RedwallScene extends Phaser.Scene {
  private readonly session: GameSession;
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

  public constructor(session: GameSession) {
    super("battlefield");
    this.session = session;
  }

  public create(): void {
    this.terrainGraphics = this.add.graphics();
    this.entityGraphics = this.add.graphics();
    this.overlayGraphics = this.add.graphics();
    this.cameras.main.setBackgroundColor("#0f1715");
    this.cameras.main.setZoom(0.82);
    this.cameras.main.setScroll(-200, -120);

    this.input.mouse?.disableContextMenu();
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
      if (pointer.button === 1) {
        return;
      }
      this.dragStart = this.screenToTile(pointer.worldX, pointer.worldY);
      this.dragCurrent = this.dragStart;
    });

    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (!this.dragStart) {
        return;
      }
      this.dragCurrent = this.screenToTile(pointer.worldX, pointer.worldY);
    });

    this.input.on("pointerup", (pointer: Phaser.Input.Pointer) => {
      if (pointer.button === 2) {
        this.handleRightClick(pointer.worldX, pointer.worldY);
        return;
      }
      if (!this.dragStart) {
        return;
      }
      const end = this.screenToTile(pointer.worldX, pointer.worldY);
      const start = this.dragStart;
      const distance = Math.abs(start.x - end.x) + Math.abs(start.y - end.y);
      if (distance > 1) {
        this.session.selectUnitsInBox(start, end);
      } else {
        this.handleSelection(end);
      }
      this.dragStart = undefined;
      this.dragCurrent = undefined;
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
    return {
      scrollX: this.cameras.main.scrollX,
      scrollY: this.cameras.main.scrollY,
      zoom: this.cameras.main.zoom,
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
    this.drawOverlay(overlayGraphics, world, session.buildMode, session.selectedIds);
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
        graphics.fillStyle(fillColor, 1);
        graphics.lineStyle(1, visible ? 0x182220 : 0x0d1412, 0.65);
        graphics.beginPath();
        graphics.moveTo(point.x, point.y);
        graphics.lineTo(point.x + this.tileWidth / 2, point.y + this.tileHeight / 2);
        graphics.lineTo(point.x, point.y + this.tileHeight);
        graphics.lineTo(point.x - this.tileWidth / 2, point.y + this.tileHeight / 2);
        graphics.closePath();
        graphics.fillPath();
        graphics.strokePath();
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

  private drawOverlay(graphics: Phaser.GameObjects.Graphics, world: WorldState, buildMode: BuildingType | undefined, selectedIds: string[]): void {
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

    for (const ping of this.pings) {
      const point = this.tileToScreen({ x: ping.tile.x + 0.5, y: ping.tile.y + 0.5 });
      const radius = 10 + ((1800 - ping.ttlMs) / 1800) * 22;
      graphics.lineStyle(2, 0xf2dfa8, ping.ttlMs / 1800);
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
    const point = this.tileToScreen({
      x: building.tile.x + definition.footprint.x / 2,
      y: building.tile.y + definition.footprint.y / 2,
    });
    const width = definition.footprint.x * 38;
    const height = definition.footprint.y * 24 + 30;
    const fillColor = building.playerId === "player" ? 0xc6a15c : 0x8d403e;
    graphics.fillStyle(fillColor, building.completed ? 0.95 : 0.55);
    graphics.lineStyle(selected ? 3 : 2, selected ? 0xf2dfa8 : 0x22180f, 1);
    graphics.fillRoundedRect(point.x - width / 2, point.y - 20, width, height, 10);
    graphics.strokeRoundedRect(point.x - width / 2, point.y - 20, width, height, 10);

    graphics.fillStyle(0x20160f, 1);
    graphics.fillRect(point.x - width / 2, point.y - 28, width, 6);
    graphics.fillStyle(0x78b66f, 1);
    graphics.fillRect(point.x - width / 2, point.y - 28, width * Math.max(0, building.hp) / building.maxHp, 6);
  }

  private drawUnit(graphics: Phaser.GameObjects.Graphics, unit: UnitEntity, selected: boolean): void {
    const point = this.tileToScreen(unit.position);
    const fillColor = unit.playerId === "player" ? 0xf4d28f : 0xc45454;
    if (selected) {
      graphics.lineStyle(2, 0xf2dfa8, 1);
      graphics.strokeEllipse(point.x, point.y + 14, 36, 16);
    }
    graphics.fillStyle(fillColor, 1);
    graphics.fillCircle(point.x, point.y + 4, unit.unitType === "badgerChampion" ? 16 : unit.unitType === "ramCart" ? 15 : 11);
    graphics.fillStyle(unit.playerId === "player" ? 0x405a48 : 0x5a2020, 1);
    if (UNIT_DEFINITIONS[unit.unitType].tags.includes("ranged")) {
      graphics.fillRect(point.x - 10, point.y - 10, 20, 6);
    } else {
      graphics.fillRect(point.x - 6, point.y - 14, 12, 18);
    }
    graphics.fillStyle(0x20160f, 1);
    graphics.fillRect(point.x - 16, point.y - 24, 32, 5);
    graphics.fillStyle(0x79bb72, 1);
    graphics.fillRect(point.x - 16, point.y - 24, 32 * Math.max(0, unit.hp) / unit.maxHp, 5);
  }

  private drawResource(graphics: Phaser.GameObjects.Graphics, entity: Entity): void {
    if (entity.kind !== "resource") {
      return;
    }
    const point = this.tileToScreen({ x: entity.tile.x + 0.5, y: entity.tile.y + 0.5 });
    const fillColor =
      entity.resourceType === "food"
        ? 0xd5965c
        : entity.resourceType === "timber"
          ? 0x47754f
          : entity.resourceType === "stone"
            ? 0x8f8a7c
            : 0xa97b58;
    graphics.fillStyle(fillColor, 1);
    if (entity.resourceType === "timber") {
      graphics.fillTriangle(point.x - 14, point.y + 6, point.x, point.y - 18, point.x + 14, point.y + 6);
      graphics.fillTriangle(point.x - 12, point.y - 2, point.x, point.y - 24, point.x + 12, point.y - 2);
    } else {
      graphics.fillCircle(point.x, point.y + 6, 13);
    }
  }

  private handleSelection(tile: TilePoint): void {
    const clicked = this.findPlayerEntityAtTile(tile);
    if (!clicked) {
      this.session.clearSelection();
      return;
    }
    this.session.setSelection([clicked.id]);
  }

  private handleRightClick(worldX: number, worldY: number): void {
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
      return;
    }
    const entity = this.findTargetAtTile(tile);
    if (entity?.kind === "resource") {
      this.session.issueCommand({ type: "gather", unitIds, targetId: entity.id });
    } else if ((entity?.kind === "unit" || entity?.kind === "building") && entity.playerId === "ai") {
      this.session.issueCommand({ type: "attack", unitIds, targetId: entity.id });
    } else {
      this.session.issueCommand({ type: "move", unitIds, destination: tile });
      this.pings.push({ tile, ttlMs: 1800 });
    }
  }

  private findTargetAtTile(tile: TilePoint): Entity | undefined {
    return Object.values(this.session.getWorld().entities).find((entity) => {
      if (entity.kind === "unit") {
        return Math.abs(entity.position.x - (tile.x + 0.5)) < 0.9 && Math.abs(entity.position.y - (tile.y + 0.5)) < 0.9;
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

  private findPlayerEntityAtTile(tile: TilePoint): Entity | undefined {
    return Object.values(this.session.getWorld().entities).find((entity) => {
      if (!this.isEntityVisibleToPlayer(this.session.getWorld(), entity)) {
        return false;
      }
      if (entity.kind === "unit") {
        return entity.playerId === "player"
          && Math.abs(entity.position.x - (tile.x + 0.5)) < 0.9
          && Math.abs(entity.position.y - (tile.y + 0.5)) < 0.9;
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
}
