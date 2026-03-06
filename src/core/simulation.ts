import { getFactionAdjustedUnitDefinition, getFactionPopulationBonus, getFactionStartingResources } from "./factions";
import { BUILDING_DEFINITIONS, RESEARCH_DEFINITIONS, UNIT_DEFINITIONS, isAgeUnlocked } from "./content";
import { createMap, tileIndex } from "./map";
import { buildOccupancy, findPath } from "./pathfinding";
import type {
  Age,
  BuildingEntity,
  BuildingType,
  Entity,
  FactionId,
  GameCommand,
  GameConfig,
  MapData,
  Outcome,
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
export const SAVE_VERSION = 2;

function cloneWorldState(world: WorldState): WorldState {
  return JSON.parse(JSON.stringify(world)) as WorldState;
}

function createResourceBag(food: number, timber: number, stone: number, iron: number): ResourceBag {
  return { food, timber, stone, iron };
}

function getInitialResources(playerId: PlayerId, factionId: FactionId, scenario: GameConfig["scenario"]): ResourceBag {
  const base = playerId === "player"
    ? createResourceBag(320, 360, 160, 120)
    : createResourceBag(320, 360, 180, 120);
  const bonus = getFactionStartingResources(factionId);
  base.food += bonus.food ?? 0;
  base.timber += bonus.timber ?? 0;
  base.stone += bonus.stone ?? 0;
  base.iron += bonus.iron ?? 0;
  if (scenario === "tutorial" && playerId === "player") {
    base.food += 60;
    base.timber += 80;
  }
  return base;
}

const AI_BUILD_LAYOUT: Partial<Record<BuildingType, TilePoint[]>> = {
  dormitory: [{ x: -2, y: 3 }, { x: 3, y: -2 }, { x: 4, y: 2 }],
  storehouse: [{ x: 4, y: -3 }, { x: -4, y: 1 }],
  granary: [{ x: -3, y: -4 }, { x: -1, y: -5 }],
  barracks: [{ x: 4, y: 3 }, { x: 6, y: 2 }],
  range: [{ x: -5, y: 3 }, { x: -6, y: 2 }],
  blacksmith: [{ x: -5, y: -2 }, { x: -4, y: -4 }],
  tower: [{ x: 2, y: -5 }, { x: -5, y: 5 }],
  longPatrolLodge: [{ x: 6, y: 5 }, { x: 5, y: 6 }],
  workshop: [{ x: -7, y: -2 }, { x: -6, y: -4 }],
};

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
  private readonly config: GameConfig;

  public constructor(config: GameConfig, existingWorld?: WorldState) {
    this.config = config;
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

  public forceOutcome(outcome: Outcome): void {
    this.world.outcome = outcome;
    this.world.players.player.defeated = outcome === "playerDefeat";
    this.world.players.ai.defeated = outcome === "playerVictory";
  }

  private createInitialWorld(config: GameConfig): WorldState {
    const map = createMap(config.seed, config.mapPreset);
    const size = map.width * map.height;
    const world: WorldState = {
      seed: config.seed,
      tick: 0,
      elapsedMs: 0,
      scenario: config.scenario,
      map,
      players: {
        player: {
          id: "player",
          faction: config.playerFaction,
          resources: getInitialResources("player", config.playerFaction, config.scenario),
          age: "settlement",
          populationUsed: 0,
          populationCap: 8,
          research: {},
          explored: createVisibility(size),
          visible: createVisibility(size),
          defeated: false,
          aiState: {
            lastAttackTick: 0,
          },
        },
        ai: {
          id: "ai",
          faction: config.aiFaction,
          resources: getInitialResources("ai", config.aiFaction, config.scenario),
          age: "settlement",
          populationUsed: 0,
          populationCap: 8,
          research: {},
          explored: createVisibility(size),
          visible: createVisibility(size),
          defeated: false,
          aiState: {
            lastAttackTick: 0,
          },
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
    for (const cluster of world.map.resourceClusters) {
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
    const definition = this.getModifiedUnitDefinition(playerId, unitType);
    return {
      id: this.createEntityId("unit"),
      kind: "unit",
      unitType,
      playerId,
      position,
      hp: definition.hp,
      maxHp: definition.hp,
      order: { type: "idle" },
      path: [],
      moveTarget: undefined,
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
        entity.path = [];
        entity.moveTarget = undefined;
        handled = true;
        continue;
      }
      if (command.type === "attack") {
        entity.order = { type: "attack", targetId: command.targetId };
        entity.path = [];
        entity.moveTarget = undefined;
        handled = true;
        continue;
      }
      if (command.type === "gather") {
        entity.order = { type: "gather", targetId: command.targetId, phase: "toResource" };
        entity.path = [];
        entity.moveTarget = undefined;
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
        entity.path = [];
        entity.moveTarget = undefined;
        handled = true;
        continue;
      }

      const destination = command.destination;
      entity.order =
        command.type === "move"
          ? { type: "move", destination }
          : { type: "attackMove", destination };
      entity.moveTarget = destination;
      entity.path = findPath(this.world.map, occupancy, getUnitTile(entity), destination);
      handled = true;
    }
    return handled;
  }

  private queueTraining(buildingId: string, unitType: UnitType, actor: PlayerId): boolean {
    const entity = this.world.entities[buildingId];
    if (!entity || entity.kind !== "building" || entity.playerId !== actor || !entity.completed) {
      return false;
    }
    const definition = this.getModifiedUnitDefinition(actor, unitType);
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
    this.updateAi();
    this.recomputePopulation();
    this.recomputeFog();
    this.checkOutcome();
  }

  private updateAi(): void {
    if (this.world.scenario === "tutorial" || this.world.tick % 10 !== 0 || this.world.outcome !== "ongoing") {
      return;
    }
    const aiHall = this.getPrimaryHall("ai");
    if (!aiHall) {
      return;
    }
    this.assignAiWorkers();
    this.trainAiWorkers(aiHall);
    if (this.tryBuildForAi("dormitory", () => this.getPopulationHeadroom("ai") <= 1)) {
      return;
    }
    if (this.tryBuildForAi("storehouse", () => this.countPlayerBuildings("ai", "storehouse", true) < 1)) {
      return;
    }
    if (this.tryBuildForAi("granary", () => this.countPlayerBuildings("ai", "granary", true) < 1)) {
      return;
    }
    if (this.world.players.ai.age === "settlement" && this.canAdvanceAge("ai", "abbey")) {
      this.queueAgeUp(aiHall.id, "abbey", "ai");
      return;
    }
    if (this.tryBuildForAi("barracks", () => this.countPlayerBuildings("ai", "barracks", true) < 1)) {
      return;
    }
    if (this.tryBuildForAi("range", () => this.world.players.ai.age !== "settlement" && this.countPlayerBuildings("ai", "range", true) < 1)) {
      return;
    }
    if (this.tryBuildForAi("blacksmith", () => this.world.players.ai.age !== "settlement" && this.countPlayerBuildings("ai", "blacksmith", true) < 1)) {
      return;
    }
    if (this.world.players.ai.age === "abbey" && this.canAdvanceAge("ai", "warhost")) {
      this.queueAgeUp(aiHall.id, "warhost", "ai");
      return;
    }
    if (this.tryBuildForAi("tower", () => this.world.players.ai.age !== "settlement" && this.countPlayerBuildings("ai", "tower", true) < 1)) {
      return;
    }
    if (this.tryBuildForAi("longPatrolLodge", () => this.world.players.ai.age === "warhost" && this.countPlayerBuildings("ai", "longPatrolLodge", true) < 1)) {
      return;
    }
    if (this.tryBuildForAi("workshop", () => this.world.players.ai.age === "warhost" && this.countPlayerBuildings("ai", "workshop", true) < 1)) {
      return;
    }
    this.trainAiMilitary();
    this.launchAiAttack();
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
      unit.order = { type: "move", destination: building.rallyPoint };
      unit.moveTarget = building.rallyPoint;
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
    const arrived = this.moveUnitAlongPath(unit, unit.order.destination, deltaMs, occupancy);
    if (arrived) {
      unit.order = { type: "idle" };
      unit.path = [];
      unit.moveTarget = undefined;
    }
  }

  private moveUnitAlongPath(unit: UnitEntity, destination: TilePoint, deltaMs: number, occupancy: boolean[]): boolean {
    const targetTile = destination;
    if (unit.path.length === 0) {
      if (Math.abs(unit.position.x - (targetTile.x + 0.5)) < 0.3 && Math.abs(unit.position.y - (targetTile.y + 0.5)) < 0.3) {
        unit.position.x = targetTile.x + 0.5;
        unit.position.y = targetTile.y + 0.5;
        return true;
      }
      unit.path = findPath(this.world.map, occupancy, getUnitTile(unit), targetTile);
      if (unit.path.length === 0) {
        return false;
      }
    }
    const nextTile = unit.path[0];
    const target = { x: nextTile.x + 0.5, y: nextTile.y + 0.5 };
    const distance = getDistance(unit.position, target);
    const definition = UNIT_DEFINITIONS[unit.unitType];
    const distancePerTick = (definition.speed * deltaMs) / 1000;
    if (distance <= distancePerTick) {
      unit.position.x = target.x;
      unit.position.y = target.y;
      unit.path.shift();
    } else {
      unit.position.x += ((target.x - unit.position.x) / distance) * distancePerTick;
      unit.position.y += ((target.y - unit.position.y) / distance) * distancePerTick;
    }
    return false;
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
        this.moveUnitAlongPath(unit, resourceEntity.tile, deltaMs, occupancy);
        return;
      }
      unit.order.phase = "harvest";
      unit.path = [];
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
        unit.path = [];
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
        this.moveUnitAlongPath(unit, dropoff.tile, deltaMs, occupancy);
        return;
      }
      if (unit.carry) {
        addCost(this.world.players[unit.playerId].resources, unit.carry.type, unit.carry.amount);
        unit.carry.amount = 0;
      }
      unit.path = [];
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
      this.moveUnitAlongPath(unit, nearest, deltaMs, occupancy);
      return;
    }
    unit.path = [];
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
      this.moveUnitAlongPath(unit, { x: Math.round(targetPosition.x), y: Math.round(targetPosition.y) }, _deltaMs, occupancy);
      return;
    }
    unit.path = [];
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
    const player = this.world.players[playerId];
    const definition = getFactionAdjustedUnitDefinition(player.faction, UNIT_DEFINITIONS[unitType]);
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
      player.populationCap = (cap || 8) + getFactionPopulationBonus(player.faction);
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

  private countPlayerBuildings(playerId: PlayerId, buildingType: BuildingType, includeIncomplete: boolean): number {
    return Object.values(this.world.entities).filter((entity) => {
      return entity.kind === "building"
        && entity.playerId === playerId
        && entity.buildingType === buildingType
        && (includeIncomplete || entity.completed);
    }).length;
  }

  private getPrimaryHall(playerId: PlayerId): BuildingEntity | undefined {
    return Object.values(this.world.entities).find((entity) => {
      return entity.kind === "building" && entity.playerId === playerId && entity.buildingType === "abbeyHall";
    }) as BuildingEntity | undefined;
  }

  private getPopulationHeadroom(playerId: PlayerId): number {
    const player = this.world.players[playerId];
    return player.populationCap - player.populationUsed - this.getQueuedPopulation(playerId);
  }

  private assignAiWorkers(): void {
    const workers = Object.values(this.world.entities).filter((entity) => entity.kind === "unit" && entity.playerId === "ai" && entity.unitType === "worker") as UnitEntity[];
    workers.forEach((worker, index) => {
      if (worker.order.type !== "idle" && worker.order.type !== "hold") {
        return;
      }
      const desiredTypes: ResourceType[] = ["timber", "food", "stone", "iron"];
      if (this.world.players.ai.age === "settlement") {
        desiredTypes[2] = "food";
      }
      const preferred = desiredTypes[index % desiredTypes.length];
      const target = this.findNearestResource({ x: Math.round(worker.position.x), y: Math.round(worker.position.y) }, preferred)
        ?? this.findNearestResource({ x: Math.round(worker.position.x), y: Math.round(worker.position.y) }, "food");
      if (target) {
        this.issueCommand({ type: "gather", unitIds: [worker.id], targetId: target.id }, "ai");
      }
    });
  }

  private trainAiWorkers(hall: BuildingEntity): void {
    const workerCount = Object.values(this.world.entities).filter((entity) => entity.kind === "unit" && entity.playerId === "ai" && entity.unitType === "worker").length;
    if (workerCount < 7 && hall.queue.length === 0) {
      this.queueTraining(hall.id, "worker", "ai");
    }
  }

  private trainAiMilitary(): void {
    const productionBuildings = Object.values(this.world.entities).filter((entity) => entity.kind === "building" && entity.playerId === "ai" && entity.completed) as BuildingEntity[];
    for (const building of productionBuildings) {
      if (building.queue.length > 0) {
        continue;
      }
      if (building.buildingType === "barracks") {
        this.queueTraining(building.id, this.world.players.ai.age === "settlement" ? "militia" : "shieldbearer", "ai");
      }
      if (building.buildingType === "range") {
        this.queueTraining(building.id, this.world.players.ai.age === "abbey" ? "archer" : "otterSkirmisher", "ai");
      }
      if (building.buildingType === "longPatrolLodge") {
        this.queueTraining(building.id, "hareRunner", "ai");
      }
      if (building.buildingType === "workshop") {
        this.queueTraining(building.id, "ramCart", "ai");
      }
    }
  }

  private launchAiAttack(): void {
    const aiState = this.world.players.ai.aiState;
    if (!aiState) {
      return;
    }
    const interval = this.config.difficulty === "hard" ? 60 : this.config.difficulty === "easy" ? 120 : 90;
    if (this.world.tick - aiState.lastAttackTick < interval) {
      return;
    }
    const army = Object.values(this.world.entities).filter((entity) => {
      return entity.kind === "unit"
        && entity.playerId === "ai"
        && entity.unitType !== "worker"
        && entity.order.type !== "build";
    }) as UnitEntity[];
    if (army.length < 3) {
      return;
    }
    const target = this.getPrimaryHall("player");
    const destination = target ? { x: target.tile.x, y: target.tile.y } : { x: this.world.map.playerSpawn.x, y: this.world.map.playerSpawn.y };
    this.issueCommand({ type: "attackMove", unitIds: army.map((unit) => unit.id), destination }, "ai");
    aiState.lastAttackTick = this.world.tick;
  }

  private tryBuildForAi(buildingType: BuildingType, predicate: () => boolean): boolean {
    if (!predicate()) {
      return false;
    }
    const player = this.world.players.ai;
    const definition = BUILDING_DEFINITIONS[buildingType];
    if (!isAgeUnlocked(player.age, definition.age) || !bagHasCost(player.resources, definition.cost)) {
      return false;
    }
    const worker = Object.values(this.world.entities).find((entity) => {
      return entity.kind === "unit"
        && entity.playerId === "ai"
        && entity.unitType === "worker"
        && entity.order.type !== "build";
    }) as UnitEntity | undefined;
    const hall = this.getPrimaryHall("ai");
    if (!worker || !hall) {
      return false;
    }
    const tile = this.findBuildTileForAi(buildingType, hall.tile);
    if (!tile) {
      return false;
    }
    return this.issueCommand({ type: "build", unitIds: [worker.id], buildingType, tile }, "ai");
  }

  private findBuildTileForAi(buildingType: BuildingType, hallTile: TilePoint): TilePoint | undefined {
    const preferred = AI_BUILD_LAYOUT[buildingType] ?? [];
    for (const offset of preferred) {
      const tile = { x: hallTile.x + offset.x, y: hallTile.y + offset.y };
      if (canPlaceBuilding(this.world.map, this.world.entities, buildingType, tile)) {
        return tile;
      }
    }
    for (let radius = 2; radius < 8; radius += 1) {
      for (let x = hallTile.x - radius; x <= hallTile.x + radius; x += 1) {
        for (let y = hallTile.y - radius; y <= hallTile.y + radius; y += 1) {
          const tile = { x, y };
          if (canPlaceBuilding(this.world.map, this.world.entities, buildingType, tile)) {
            return tile;
          }
        }
      }
    }
    return undefined;
  }

  private findNearestResource(origin: TilePoint, resourceType: ResourceType): ResourceEntity | undefined {
    let best: ResourceEntity | undefined;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const entity of Object.values(this.world.entities)) {
      if (entity.kind !== "resource" || entity.resourceType !== resourceType || entity.amount <= 0) {
        continue;
      }
      const distance = Math.abs(entity.tile.x - origin.x) + Math.abs(entity.tile.y - origin.y);
      if (distance < bestDistance) {
        best = entity;
        bestDistance = distance;
      }
    }
    return best;
  }
}
