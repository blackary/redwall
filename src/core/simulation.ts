import { BUILDING_DEFINITIONS, RESEARCH_DEFINITIONS, UNIT_DEFINITIONS, isAgeUnlocked } from "./content";
import { createMap, getResourceClusterTiles, tileIndex } from "./map";
import { buildOccupancy, findPath } from "./pathfinding";
import type {
  Age,
  BuildingEntity,
  BuildingType,
  Entity,
  GameCommand,
  GameConfig,
  MapData,
  PlayerId,
  ResourceBag,
  ResourceEntity,
  ResourceType,
  ResearchId,
  TilePoint,
  UnitEntity,
  UnitType,
  WorldState,
} from "./types";

export const TICK_MS = 200;
export const SAVE_VERSION = 1;

function cloneWorldState(world: WorldState): WorldState {
  return JSON.parse(JSON.stringify(world)) as WorldState;
}

function createResourceBag(food: number, timber: number, stone: number, iron: number): ResourceBag {
  return { food, timber, stone, iron };
}

function getInitialResources(playerId: PlayerId): ResourceBag {
  return playerId === "player"
    ? createResourceBag(320, 280, 160, 120)
    : createResourceBag(320, 300, 180, 120);
}

function createVisibility(size: number): boolean[] {
  return new Array(size).fill(false);
}

function isAdjacent(source: TilePoint, target: TilePoint): boolean {
  return Math.abs(source.x - target.x) <= 1 && Math.abs(source.y - target.y) <= 1;
}

function bagHasCost(bag: ResourceBag, cost: Partial<ResourceBag>): boolean {
  return (cost.food ?? 0) <= bag.food
    && (cost.timber ?? 0) <= bag.timber
    && (cost.stone ?? 0) <= bag.stone
    && (cost.iron ?? 0) <= bag.iron;
}

function spendCost(bag: ResourceBag, cost: Partial<ResourceBag>): void {
  bag.food -= cost.food ?? 0;
  bag.timber -= cost.timber ?? 0;
  bag.stone -= cost.stone ?? 0;
  bag.iron -= cost.iron ?? 0;
}

function addCost(bag: ResourceBag, type: ResourceType, amount: number): void {
  bag[type] += amount;
}

function getBuildingFootprintTiles(building: BuildingEntity): TilePoint[] {
  const definition = BUILDING_DEFINITIONS[building.buildingType];
  const tiles: TilePoint[] = [];
  for (let offsetX = 0; offsetX < definition.footprint.x; offsetX += 1) {
    for (let offsetY = 0; offsetY < definition.footprint.y; offsetY += 1) {
      tiles.push({ x: building.tile.x + offsetX, y: building.tile.y + offsetY });
    }
  }
  return tiles;
}

function getUnitTile(unit: UnitEntity): TilePoint {
  return { x: Math.round(unit.position.x), y: Math.round(unit.position.y) };
}

function getDistance(source: { x: number; y: number }, target: { x: number; y: number }): number {
  return Math.hypot(source.x - target.x, source.y - target.y);
}

function findNearestDropoff(world: WorldState, playerId: PlayerId, resourceType: ResourceType, from: TilePoint): BuildingEntity | undefined {
  let best: BuildingEntity | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const entity of Object.values(world.entities)) {
    if (entity.kind !== "building" || entity.playerId !== playerId || !entity.completed) {
      continue;
    }
    const definition = BUILDING_DEFINITIONS[entity.buildingType];
    if (!definition.resourceDropoff?.includes(resourceType)) {
      continue;
    }
    const distance = Math.abs(entity.tile.x - from.x) + Math.abs(entity.tile.y - from.y);
    if (distance < bestDistance) {
      best = entity;
      bestDistance = distance;
    }
  }
  return best;
}

function canPlaceBuilding(map: MapData, entities: Record<string, Entity>, buildingType: BuildingType, tile: TilePoint): boolean {
  const definition = BUILDING_DEFINITIONS[buildingType];
  const occupancy = buildOccupancy(map, entities);
  for (let offsetX = 0; offsetX < definition.footprint.x; offsetX += 1) {
    for (let offsetY = 0; offsetY < definition.footprint.y; offsetY += 1) {
      const check = { x: tile.x + offsetX, y: tile.y + offsetY };
      if (check.x < 0 || check.y < 0 || check.x >= map.width || check.y >= map.height) {
        return false;
      }
      if (occupancy[check.y * map.width + check.x]) {
        return false;
      }
      for (const entity of Object.values(entities)) {
        if (entity.kind === "resource" && entity.tile.x === check.x && entity.tile.y === check.y) {
          return false;
        }
      }
    }
  }
  return true;
}

export class Simulation {
  private world: WorldState;
  private nextEntityId = 1;

  public constructor(config: GameConfig, existingWorld?: WorldState) {
    this.world = existingWorld ?? this.createInitialWorld(config);
  }

  public getWorld(): WorldState {
    return this.world;
  }

  public getSnapshot(): WorldState {
    return cloneWorldState(this.world);
  }

  public advanceTicks(count: number): void {
    for (let index = 0; index < count; index += 1) {
      this.step(TICK_MS);
    }
  }

  public issueCommand(command: GameCommand, actor: PlayerId = "player"): boolean {
    if (this.world.outcome !== "ongoing") {
      return false;
    }
    switch (command.type) {
      case "move":
      case "attackMove":
      case "stop":
      case "attack":
      case "gather":
      case "build":
        return this.issueUnitCommand(command, actor);
      case "train":
        return this.queueTraining(command.buildingId, command.unitType, actor);
      case "research":
        return this.queueResearch(command.buildingId, command.researchId, actor);
      case "ageUp":
        return this.queueAgeUp(command.buildingId, command.nextAge, actor);
      case "setRally":
        return this.setRallyPoint(command.buildingId, command.tile, actor);
      default:
        return false;
    }
  }

  public serialize(): WorldState {
    return this.getSnapshot();
  }

  private createInitialWorld(config: GameConfig): WorldState {
    const map = createMap(config.seed);
    const size = map.width * map.height;
    const world: WorldState = {
      seed: config.seed,
      tick: 0,
      elapsedMs: 0,
      map,
      players: {
        player: {
          id: "player",
          faction: "abbeyAlliance",
          resources: getInitialResources("player"),
          age: "settlement",
          populationUsed: 0,
          populationCap: 8,
          research: {},
          explored: createVisibility(size),
          visible: createVisibility(size),
          defeated: false,
        },
        ai: {
          id: "ai",
          faction: "verminRaiders",
          resources: getInitialResources("ai"),
          age: "settlement",
          populationUsed: 0,
          populationCap: 8,
          research: {},
          explored: createVisibility(size),
          visible: createVisibility(size),
          defeated: false,
        },
      },
      entities: {},
      projectiles: [],
      outcome: "ongoing",
    };

    this.world = world;
    this.spawnStartingBase(world, "player", map.playerSpawn);
    this.spawnStartingBase(world, "ai", map.aiSpawn);
    this.spawnResources(world);
    this.recomputePopulation();
    this.recomputeFog();
    return world;
  }

  private spawnResources(world: WorldState): void {
    for (const cluster of getResourceClusterTiles()) {
      for (const tile of cluster.tiles) {
        const amount = cluster.type === "food" ? 220 : cluster.type === "timber" ? 320 : 260;
        const resource: ResourceEntity = {
          id: this.createEntityId("resource"),
          kind: "resource",
          resourceType: cluster.type,
          tile,
          amount,
          maxAmount: amount,
        };
        world.entities[resource.id] = resource;
      }
    }
  }

  private spawnStartingBase(world: WorldState, playerId: PlayerId, spawn: TilePoint): void {
    const hall: BuildingEntity = {
      id: this.createEntityId("building"),
      kind: "building",
      buildingType: "abbeyHall",
      playerId,
      tile: { x: spawn.x, y: spawn.y },
      hp: BUILDING_DEFINITIONS.abbeyHall.hp,
      maxHp: BUILDING_DEFINITIONS.abbeyHall.hp,
      completed: true,
      buildProgressMs: BUILDING_DEFINITIONS.abbeyHall.buildTimeMs,
      queue: [],
      rallyPoint: { x: spawn.x + 2, y: spawn.y + 2 },
      attackCooldownMs: 0,
    };
    world.entities[hall.id] = hall;
    const workerOffsets = [
      { x: 2.4, y: 0.4 },
      { x: 2.8, y: 1.3 },
      { x: 0.6, y: 2.2 },
      { x: 1.4, y: 2.6 },
    ];
    for (const [index, offset] of workerOffsets.entries()) {
      const unit = this.createUnit("worker", playerId, { x: spawn.x + offset.x, y: spawn.y + offset.y });
      if (index === 0) {
        unit.order = { type: "hold" };
      }
      world.entities[unit.id] = unit;
    }
    const scout = this.createUnit("shrewScout", playerId, { x: spawn.x + 2.4, y: spawn.y + 2.4 });
    world.entities[scout.id] = scout;
  }

  private createUnit(unitType: UnitType, playerId: PlayerId, position: { x: number; y: number }): UnitEntity {
    const definition = UNIT_DEFINITIONS[unitType];
    return {
      id: this.createEntityId("unit"),
      kind: "unit",
      unitType,
      playerId,
      position,
      hp: definition.hp,
      maxHp: definition.hp,
      order: { type: "idle" },
      attackCooldownMs: 0,
      carry: undefined,
    };
  }

  private createEntityId(prefix: "unit" | "building" | "resource" | "projectile"): string {
    const id = `${prefix}-${this.nextEntityId}`;
    this.nextEntityId += 1;
    return id;
  }

  private issueUnitCommand(
    command:
      | Extract<GameCommand, { type: "move" }>
      | Extract<GameCommand, { type: "attackMove" }>
      | Extract<GameCommand, { type: "stop" }>
      | Extract<GameCommand, { type: "attack" }>
      | Extract<GameCommand, { type: "gather" }>
      | Extract<GameCommand, { type: "build" }>,
    actor: PlayerId,
  ): boolean {
    const occupancy = buildOccupancy(this.world.map, this.world.entities);
    const unitIds = command.type === "build" ? command.unitIds : command.unitIds;
    let handled = false;
    for (const unitId of unitIds) {
      const entity = this.world.entities[unitId];
      if (!entity || entity.kind !== "unit" || entity.playerId !== actor) {
        continue;
      }
      if (command.type === "stop") {
        entity.order = { type: "idle" };
        handled = true;
        continue;
      }
      if (command.type === "attack") {
        entity.order = { type: "attack", targetId: command.targetId };
        handled = true;
        continue;
      }
      if (command.type === "gather") {
        entity.order = { type: "gather", targetId: command.targetId, phase: "toResource" };
        handled = true;
        continue;
      }
      if (command.type === "build") {
        if (!canPlaceBuilding(this.world.map, this.world.entities, command.buildingType, command.tile)) {
          continue;
        }
        const definition = BUILDING_DEFINITIONS[command.buildingType];
        const player = this.world.players[actor];
        if (!isAgeUnlocked(player.age, definition.age) || !bagHasCost(player.resources, definition.cost)) {
          continue;
        }
        spendCost(player.resources, definition.cost);
        const building: BuildingEntity = {
          id: this.createEntityId("building"),
          kind: "building",
          buildingType: command.buildingType,
          playerId: actor,
          tile: { ...command.tile },
          hp: Math.max(1, Math.floor(definition.hp * 0.25)),
          maxHp: definition.hp,
          completed: false,
          buildProgressMs: 0,
          queue: [],
          rallyPoint: { x: command.tile.x + definition.footprint.x + 1, y: command.tile.y + definition.footprint.y },
          attackCooldownMs: 0,
        };
        this.world.entities[building.id] = building;
        entity.order = { type: "build", targetId: building.id };
        handled = true;
        continue;
      }

      const destination = command.destination;
      const start = getUnitTile(entity);
      const path = findPath(this.world.map, occupancy, start, destination);
      entity.order =
        command.type === "move"
          ? { type: "move", destination, path }
          : { type: "attackMove", destination, path };
      handled = true;
    }
    return handled;
  }

  private queueTraining(buildingId: string, unitType: UnitType, actor: PlayerId): boolean {
    const entity = this.world.entities[buildingId];
    if (!entity || entity.kind !== "building" || entity.playerId !== actor || !entity.completed) {
      return false;
    }
    const definition = UNIT_DEFINITIONS[unitType];
    const player = this.world.players[actor];
    if (entity.buildingType !== definition.producedAt || !isAgeUnlocked(player.age, definition.age)) {
      return false;
    }
    if (!bagHasCost(player.resources, definition.cost)) {
      return false;
    }
    if (player.populationUsed + this.getQueuedPopulation(actor) + 1 > player.populationCap) {
      return false;
    }
    spendCost(player.resources, definition.cost);
    entity.queue.push({ kind: "unit", id: unitType, remainingMs: definition.trainTimeMs });
    return true;
  }

  private queueResearch(buildingId: string, researchId: ResearchId, actor: PlayerId): boolean {
    const entity = this.world.entities[buildingId];
    if (!entity || entity.kind !== "building" || entity.playerId !== actor || !entity.completed) {
      return false;
    }
    const research = RESEARCH_DEFINITIONS[researchId];
    const player = this.world.players[actor];
    if (player.research[researchId] || entity.queue.some((item) => item.id === researchId)) {
      return false;
    }
    if (entity.buildingType !== research.buildingType || !isAgeUnlocked(player.age, research.age)) {
      return false;
    }
    if (!bagHasCost(player.resources, research.cost)) {
      return false;
    }
    spendCost(player.resources, research.cost);
    entity.queue.push({ kind: "research", id: researchId, remainingMs: research.researchTimeMs });
    return true;
  }

  private queueAgeUp(buildingId: string, nextAge: Age, actor: PlayerId): boolean {
    const entity = this.world.entities[buildingId];
    if (!entity || entity.kind !== "building" || entity.playerId !== actor || entity.buildingType !== "abbeyHall") {
      return false;
    }
    const researchId = nextAge === "abbey" ? "abbeyAge" : "warhostAge";
    const player = this.world.players[actor];
    if (!this.canAdvanceAge(player.id, nextAge)) {
      return false;
    }
    const research = RESEARCH_DEFINITIONS[researchId];
    if (!bagHasCost(player.resources, research.cost)) {
      return false;
    }
    spendCost(player.resources, research.cost);
    entity.queue.push({ kind: "age", id: nextAge, remainingMs: research.researchTimeMs });
    return true;
  }

  private setRallyPoint(buildingId: string, tile: TilePoint, actor: PlayerId): boolean {
    const entity = this.world.entities[buildingId];
    if (!entity || entity.kind !== "building" || entity.playerId !== actor) {
      return false;
    }
    entity.rallyPoint = tile;
    return true;
  }

  private canAdvanceAge(playerId: PlayerId, nextAge: Age): boolean {
    const player = this.world.players[playerId];
    if (nextAge === "abbey") {
      return player.age === "settlement" && this.countBuildings(playerId, ["dormitory", "storehouse", "granary"]) >= 3;
    }
    if (nextAge === "warhost") {
      return player.age === "abbey" && this.countBuildings(playerId, ["barracks", "range", "blacksmith"]) >= 3;
    }
    return false;
  }

  private countBuildings(playerId: PlayerId, types: BuildingType[]): number {
    let count = 0;
    for (const entity of Object.values(this.world.entities)) {
      if (entity.kind === "building" && entity.playerId === playerId && entity.completed && types.includes(entity.buildingType)) {
        count += 1;
      }
    }
    return count;
  }

  private getQueuedPopulation(playerId: PlayerId): number {
    let queued = 0;
    for (const entity of Object.values(this.world.entities)) {
      if (entity.kind !== "building" || entity.playerId !== playerId) {
        continue;
      }
      queued += entity.queue.filter((item) => item.kind === "unit").length;
    }
    return queued;
  }

  private step(deltaMs: number): void {
    this.world.tick += 1;
    this.world.elapsedMs += deltaMs;
    this.updateBuildings(deltaMs);
    this.updateUnits(deltaMs);
    this.updateProjectiles(deltaMs);
    this.updateTowers(deltaMs);
    this.recomputePopulation();
    this.recomputeFog();
    this.checkOutcome();
  }

  private updateBuildings(deltaMs: number): void {
    for (const entity of Object.values(this.world.entities)) {
      if (entity.kind !== "building") {
        continue;
      }

      if (!entity.completed) {
        continue;
      }

      if (entity.queue.length > 0) {
        entity.queue[0].remainingMs -= deltaMs;
        if (entity.queue[0].remainingMs <= 0) {
          this.completeQueueItem(entity, entity.queue.shift());
        }
      }

      if (entity.attackCooldownMs > 0) {
        entity.attackCooldownMs = Math.max(0, entity.attackCooldownMs - deltaMs);
      }
    }
  }

  private completeQueueItem(building: BuildingEntity, item: BuildingEntity["queue"][number] | undefined): void {
    if (!item) {
      return;
    }
    const player = this.world.players[building.playerId];
    if (item.kind === "unit") {
      const spawn = this.findSpawnTile(building, building.rallyPoint);
      const unit = this.createUnit(item.id as UnitType, building.playerId, { x: spawn.x + 0.25, y: spawn.y + 0.25 });
      unit.order = { type: "move", destination: building.rallyPoint, path: [] };
      this.world.entities[unit.id] = unit;
      return;
    }
    if (item.kind === "research") {
      const researchId = item.id as ResearchId;
      player.research[researchId] = true;
      if (researchId === "stoneMasonry") {
        for (const entity of Object.values(this.world.entities)) {
          if (entity.kind === "building" && entity.playerId === building.playerId) {
            entity.maxHp = Math.round(entity.maxHp * 1.2);
            entity.hp = Math.min(entity.maxHp, Math.round(entity.hp * 1.2));
          }
        }
      }
      return;
    }
    player.age = item.id as Age;
  }

  private findSpawnTile(building: BuildingEntity, requested: TilePoint): TilePoint {
    const occupancy = buildOccupancy(this.world.map, this.world.entities, building.id);
    const candidates = [
      requested,
      { x: building.tile.x + BUILDING_DEFINITIONS[building.buildingType].footprint.x, y: building.tile.y },
      { x: building.tile.x, y: building.tile.y + BUILDING_DEFINITIONS[building.buildingType].footprint.y },
      { x: building.tile.x + 1, y: building.tile.y + BUILDING_DEFINITIONS[building.buildingType].footprint.y + 1 },
    ];
    for (const candidate of candidates) {
      const path = findPath(this.world.map, occupancy, candidate, requested);
      if (candidate.x >= 0 && candidate.y >= 0 && candidate.x < this.world.map.width && candidate.y < this.world.map.height && !occupancy[candidate.y * this.world.map.width + candidate.x]) {
        return path[0] ?? candidate;
      }
    }
    return { x: building.tile.x + 1, y: building.tile.y + 1 };
  }

  private updateUnits(deltaMs: number): void {
    const occupancy = buildOccupancy(this.world.map, this.world.entities);
    for (const entity of Object.values(this.world.entities)) {
      if (entity.kind !== "unit") {
        continue;
      }
      if (entity.attackCooldownMs > 0) {
        entity.attackCooldownMs = Math.max(0, entity.attackCooldownMs - deltaMs);
      }

      switch (entity.order.type) {
        case "move":
        case "attackMove":
          this.updateUnitMovement(entity, deltaMs, occupancy);
          if (entity.order.type === "attackMove") {
            this.acquireTarget(entity);
          }
          break;
        case "gather":
          this.updateGathering(entity, deltaMs, occupancy);
          break;
        case "build":
          this.updateBuildingConstruction(entity, deltaMs, occupancy);
          break;
        case "attack":
          this.updateAttack(entity, deltaMs, occupancy);
          break;
        case "hold":
          this.acquireTarget(entity);
          break;
        case "idle":
        default:
          break;
      }
    }
  }

  private updateUnitMovement(unit: UnitEntity, deltaMs: number, occupancy: boolean[]): void {
    if (unit.order.type !== "move" && unit.order.type !== "attackMove") {
      return;
    }
    if (unit.order.path.length === 0) {
      const targetTile = unit.order.destination;
      if (Math.abs(unit.position.x - targetTile.x) < 0.2 && Math.abs(unit.position.y - targetTile.y) < 0.2) {
        unit.position.x = targetTile.x;
        unit.position.y = targetTile.y;
        unit.order = { type: "idle" };
        return;
      }
      const start = getUnitTile(unit);
      unit.order.path = findPath(this.world.map, occupancy, start, targetTile);
      if (unit.order.path.length === 0) {
        unit.order = { type: "idle" };
        return;
      }
    }
    const nextTile = unit.order.path[0];
    const target = { x: nextTile.x + 0.5, y: nextTile.y + 0.5 };
    const distance = getDistance(unit.position, target);
    const definition = UNIT_DEFINITIONS[unit.unitType];
    const distancePerTick = (definition.speed * deltaMs) / 1000;
    if (distance <= distancePerTick) {
      unit.position.x = target.x;
      unit.position.y = target.y;
      unit.order.path.shift();
    } else {
      unit.position.x += ((target.x - unit.position.x) / distance) * distancePerTick;
      unit.position.y += ((target.y - unit.position.y) / distance) * distancePerTick;
    }
  }

  private updateGathering(unit: UnitEntity, deltaMs: number, occupancy: boolean[]): void {
    if (unit.order.type !== "gather") {
      return;
    }
    const resourceEntity = this.world.entities[unit.order.targetId];
    if (!resourceEntity || resourceEntity.kind !== "resource" || resourceEntity.amount <= 0) {
      unit.order = { type: "idle" };
      return;
    }
    const unitDefinition = UNIT_DEFINITIONS[unit.unitType];
    if (!unitDefinition.gatherRate || !unitDefinition.carryCapacity) {
      unit.order = { type: "idle" };
      return;
    }

    const unitTile = getUnitTile(unit);
    if (unit.order.phase === "toResource") {
      if (!isAdjacent(unitTile, resourceEntity.tile)) {
        unit.order = {
          type: "move",
          destination: resourceEntity.tile,
          path: findPath(this.world.map, occupancy, unitTile, resourceEntity.tile),
        };
        return;
      }
      unit.order.phase = "harvest";
    }

    if (unit.order.phase === "harvest") {
      const gatherAmount = Math.max(1, Math.round((unitDefinition.gatherRate[resourceEntity.resourceType] ?? 5) * (deltaMs / 1000)));
      const currentCarry = unit.carry?.amount ?? 0;
      const gathered = Math.min(resourceEntity.amount, unitDefinition.carryCapacity - currentCarry, gatherAmount);
      resourceEntity.amount -= gathered;
      unit.carry = {
        type: resourceEntity.resourceType,
        amount: currentCarry + gathered,
      };
      if (resourceEntity.amount <= 0) {
        delete this.world.entities[resourceEntity.id];
      }
      if ((unit.carry.amount ?? 0) >= unitDefinition.carryCapacity) {
        const dropoff = findNearestDropoff(this.world, unit.playerId, resourceEntity.resourceType, unitTile);
        if (!dropoff) {
          unit.order = { type: "idle" };
          return;
        }
        unit.order.phase = "toDropoff";
        unit.order.dropoffId = dropoff.id;
        unit.order = {
          type: "move",
          destination: dropoff.tile,
          path: findPath(this.world.map, occupancy, unitTile, dropoff.tile),
        };
      }
      return;
    }

    if (unit.order.phase === "toDropoff") {
      const dropoff = unit.order.dropoffId ? this.world.entities[unit.order.dropoffId] : undefined;
      if (!dropoff || dropoff.kind !== "building") {
        unit.order = { type: "idle" };
        return;
      }
      if (!isAdjacent(unitTile, dropoff.tile)) {
        unit.order = {
          type: "move",
          destination: dropoff.tile,
          path: findPath(this.world.map, occupancy, unitTile, dropoff.tile),
        };
        return;
      }
      if (unit.carry) {
        addCost(this.world.players[unit.playerId].resources, unit.carry.type, unit.carry.amount);
        unit.carry.amount = 0;
      }
      unit.order = { type: "gather", targetId: resourceEntity.id, phase: "toResource" };
    }
  }

  private updateBuildingConstruction(unit: UnitEntity, deltaMs: number, occupancy: boolean[]): void {
    if (unit.order.type !== "build") {
      return;
    }
    const target = this.world.entities[unit.order.targetId];
    if (!target || target.kind !== "building" || target.completed) {
      unit.order = { type: "idle" };
      return;
    }
    const footprintTiles = getBuildingFootprintTiles(target);
    const unitTile = getUnitTile(unit);
    const adjacent = footprintTiles.some((tile) => isAdjacent(unitTile, tile));
    if (!adjacent) {
      const nearest = footprintTiles[0];
      unit.order = {
        type: "move",
        destination: nearest,
        path: findPath(this.world.map, occupancy, unitTile, nearest),
      };
      return;
    }
    target.buildProgressMs += deltaMs;
    target.hp = Math.min(target.maxHp, target.hp + Math.round(target.maxHp * 0.05));
    if (target.buildProgressMs >= BUILDING_DEFINITIONS[target.buildingType].buildTimeMs) {
      target.completed = true;
      target.hp = target.maxHp;
      unit.order = { type: "idle" };
    }
  }

  private updateAttack(unit: UnitEntity, _deltaMs: number, occupancy: boolean[]): void {
    if (unit.order.type !== "attack") {
      return;
    }
    const target = this.world.entities[unit.order.targetId];
    if (!target || (target.kind !== "unit" && target.kind !== "building")) {
      unit.order = { type: "idle" };
      return;
    }
    const targetPosition = target.kind === "unit"
      ? target.position
      : { x: target.tile.x + 0.5, y: target.tile.y + 0.5 };
    const unitPosition = unit.position;
    const definition = this.getModifiedUnitDefinition(unit.playerId, unit.unitType);
    const distance = getDistance(unitPosition, targetPosition);
    if (distance > definition.attackRange) {
      unit.order = {
        type: "move",
        destination: { x: Math.round(targetPosition.x), y: Math.round(targetPosition.y) },
        path: findPath(this.world.map, occupancy, getUnitTile(unit), {
          x: Math.round(targetPosition.x),
          y: Math.round(targetPosition.y),
        }),
      };
      return;
    }
    if (unit.attackCooldownMs > 0) {
      return;
    }
    unit.attackCooldownMs = definition.attackCooldownMs;
    if (definition.attackRange > 1.5) {
      this.world.projectiles.push({
        id: this.createEntityId("projectile"),
        playerId: unit.playerId,
        targetId: target.id,
        position: { x: unit.position.x, y: unit.position.y },
        speed: 6.5,
        damage: definition.attackDamage,
      });
    } else {
      this.applyDamage(target.id, definition.attackDamage, unit.playerId);
    }
  }

  private updateProjectiles(deltaMs: number): void {
    const remaining = [];
    for (const projectile of this.world.projectiles) {
      const target = this.world.entities[projectile.targetId];
      if (!target || (target.kind !== "unit" && target.kind !== "building")) {
        continue;
      }
      const targetPosition = target.kind === "unit" ? target.position : { x: target.tile.x + 0.5, y: target.tile.y + 0.5 };
      const distance = getDistance(projectile.position, targetPosition);
      const travel = (projectile.speed * deltaMs) / 1000;
      if (distance <= travel) {
        this.applyDamage(target.id, projectile.damage, projectile.playerId);
        continue;
      }
      projectile.position.x += ((targetPosition.x - projectile.position.x) / distance) * travel;
      projectile.position.y += ((targetPosition.y - projectile.position.y) / distance) * travel;
      remaining.push(projectile);
    }
    this.world.projectiles = remaining;
  }

  private updateTowers(deltaMs: number): void {
    for (const entity of Object.values(this.world.entities)) {
      if (entity.kind !== "building" || !entity.completed) {
        continue;
      }
      const definition = BUILDING_DEFINITIONS[entity.buildingType];
      if (!definition.attackDamage || !definition.attackRange || !definition.attackCooldownMs) {
        continue;
      }
      entity.attackCooldownMs = Math.max(0, entity.attackCooldownMs - deltaMs);
      if (entity.attackCooldownMs > 0) {
        continue;
      }
      const target = this.findNearestEnemy(entity.playerId, { x: entity.tile.x + 0.5, y: entity.tile.y + 0.5 }, definition.attackRange);
      if (!target) {
        continue;
      }
      const damage = definition.attackDamage + (this.world.players[entity.playerId].research.towerGuard ? 5 : 0);
      entity.attackCooldownMs = definition.attackCooldownMs;
      this.world.projectiles.push({
        id: this.createEntityId("projectile"),
        playerId: entity.playerId,
        targetId: target.id,
        position: { x: entity.tile.x + 0.5, y: entity.tile.y + 0.5 },
        speed: 7,
        damage,
      });
    }
  }

  private findNearestEnemy(playerId: PlayerId, position: { x: number; y: number }, range: number): UnitEntity | BuildingEntity | undefined {
    let best: UnitEntity | BuildingEntity | undefined;
    let bestDistance = range;
    for (const entity of Object.values(this.world.entities)) {
      if ((entity.kind !== "unit" && entity.kind !== "building") || entity.playerId === playerId) {
        continue;
      }
      const targetPosition = entity.kind === "unit" ? entity.position : { x: entity.tile.x + 0.5, y: entity.tile.y + 0.5 };
      const distance = getDistance(position, targetPosition);
      if (distance <= bestDistance) {
        bestDistance = distance;
        best = entity;
      }
    }
    return best;
  }

  private acquireTarget(unit: UnitEntity): void {
    const definition = this.getModifiedUnitDefinition(unit.playerId, unit.unitType);
    const target = this.findNearestEnemy(unit.playerId, unit.position, definition.sight);
    if (target) {
      unit.order = { type: "attack", targetId: target.id };
    }
  }

  private applyDamage(targetId: string, rawDamage: number, sourcePlayerId: PlayerId): void {
    const target = this.world.entities[targetId];
    if (!target || (target.kind !== "unit" && target.kind !== "building")) {
      return;
    }
    const armor = target.kind === "unit" ? (this.getModifiedUnitDefinition(target.playerId, target.unitType).armor ?? 0) : 0;
    const damage = Math.max(1, rawDamage - armor);
    target.hp -= damage;
    if (target.hp > 0) {
      if (target.kind === "unit" && target.order.type !== "attack") {
        const attacker = this.findNearestEnemy(target.playerId, target.position, 6);
        if (attacker && attacker.playerId === sourcePlayerId) {
          target.order = { type: "attack", targetId: attacker.id };
        }
      }
      return;
    }
    delete this.world.entities[targetId];
  }

  private getModifiedUnitDefinition(playerId: PlayerId, unitType: UnitType) {
    const definition = UNIT_DEFINITIONS[unitType];
    const player = this.world.players[playerId];
    const attackBonus = player.research.ironforging ? 2 : 0;
    const armorBonus = player.research.leatherwork && definition.tags.some((tag) => tag === "infantry" || tag === "ranged") ? 1 : 0;
    const hareBonus = player.research.hareDrills && unitType === "hareRunner";
    return {
      ...definition,
      attackDamage: definition.attackDamage + attackBonus,
      armor: (definition.armor ?? 0) + armorBonus,
      speed: hareBonus ? definition.speed * 1.12 : definition.speed,
      attackCooldownMs: hareBonus ? Math.round(definition.attackCooldownMs * 0.88) : definition.attackCooldownMs,
      gatherRate: player.research.woodcraft
        ? Object.fromEntries(
            Object.entries(definition.gatherRate ?? {}).map(([key, value]) => [key, Math.round(value * 1.15)]),
          ) as typeof definition.gatherRate
        : definition.gatherRate,
    };
  }

  private recomputePopulation(): void {
    for (const player of Object.values(this.world.players)) {
      let used = 0;
      let cap = 0;
      for (const entity of Object.values(this.world.entities)) {
        if (entity.kind === "unit" && entity.playerId === player.id) {
          used += 1;
        }
        if (entity.kind === "building" && entity.playerId === player.id) {
          cap += BUILDING_DEFINITIONS[entity.buildingType].populationCap ?? 0;
        }
      }
      player.populationUsed = used;
      player.populationCap = cap || 8;
    }
  }

  private recomputeFog(): void {
    const size = this.world.map.width * this.world.map.height;
    for (const player of Object.values(this.world.players)) {
      player.visible = createVisibility(size);
      for (const entity of Object.values(this.world.entities)) {
        if ((entity.kind !== "unit" && entity.kind !== "building") || entity.playerId !== player.id) {
          continue;
        }
        const sight = entity.kind === "unit"
          ? this.getModifiedUnitDefinition(entity.playerId, entity.unitType).sight
          : BUILDING_DEFINITIONS[entity.buildingType].sight;
        const center = entity.kind === "unit" ? getUnitTile(entity) : entity.tile;
        for (let offsetX = -sight; offsetX <= sight; offsetX += 1) {
          for (let offsetY = -sight; offsetY <= sight; offsetY += 1) {
            const tile = { x: center.x + offsetX, y: center.y + offsetY };
            if (tile.x < 0 || tile.y < 0 || tile.x >= this.world.map.width || tile.y >= this.world.map.height) {
              continue;
            }
            if (Math.hypot(offsetX, offsetY) > sight + 0.25) {
              continue;
            }
            const index = tileIndex(this.world.map, tile);
            player.visible[index] = true;
            player.explored[index] = true;
          }
        }
      }
    }
  }

  private checkOutcome(): void {
    const playerHasAssets = this.hasLivingAssets("player");
    const aiHasAssets = this.hasLivingAssets("ai");
    this.world.players.player.defeated = !playerHasAssets;
    this.world.players.ai.defeated = !aiHasAssets;
    if (!playerHasAssets) {
      this.world.outcome = "playerDefeat";
    } else if (!aiHasAssets) {
      this.world.outcome = "playerVictory";
    }
  }

  private hasLivingAssets(playerId: PlayerId): boolean {
    return Object.values(this.world.entities).some((entity) => {
      if (entity.kind === "resource") {
        return false;
      }
      return entity.playerId === playerId;
    });
  }
}
