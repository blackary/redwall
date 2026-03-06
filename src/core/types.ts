export const RESOURCE_TYPES = ["food", "timber", "stone", "iron"] as const;
export const PLAYER_IDS = ["player", "ai"] as const;
export const AGES = ["settlement", "abbey", "warhost"] as const;

export type ResourceType = (typeof RESOURCE_TYPES)[number];
export type PlayerId = (typeof PLAYER_IDS)[number];
export type Age = (typeof AGES)[number];
export type Difficulty = "easy" | "normal" | "hard";

export type UnitType =
  | "worker"
  | "shrewScout"
  | "militia"
  | "shieldbearer"
  | "slinger"
  | "archer"
  | "otterSkirmisher"
  | "hareRunner"
  | "badgerChampion"
  | "ramCart";

export type BuildingType =
  | "abbeyHall"
  | "dormitory"
  | "storehouse"
  | "granary"
  | "barracks"
  | "range"
  | "blacksmith"
  | "longPatrolLodge"
  | "tower"
  | "wall"
  | "gate"
  | "workshop";

export type ResearchId =
  | "abbeyAge"
  | "warhostAge"
  | "woodcraft"
  | "stoneMasonry"
  | "ironforging"
  | "leatherwork"
  | "towerGuard"
  | "hareDrills";

export type TerrainType = "grass" | "moss" | "dirt";
export type Outcome = "ongoing" | "playerVictory" | "playerDefeat";

export interface TilePoint {
  x: number;
  y: number;
}

export interface ResourceBag {
  food: number;
  timber: number;
  stone: number;
  iron: number;
}

export interface GameConfig {
  seed: number;
  mapPreset: "mossflowerMeadows";
  difficulty: Difficulty;
  e2e: boolean;
}

export interface TechTreeNode {
  id: ResearchId;
  label: string;
  age: Age;
  buildingType: BuildingType;
  cost: Partial<ResourceBag>;
  researchTimeMs: number;
  grants: string[];
}

export interface UnitDefinition {
  id: UnitType;
  label: string;
  producedAt: BuildingType;
  age: Age;
  cost: Partial<ResourceBag>;
  trainTimeMs: number;
  hp: number;
  speed: number;
  sight: number;
  attackDamage: number;
  attackRange: number;
  attackCooldownMs: number;
  gatherRate?: Partial<Record<ResourceType, number>>;
  carryCapacity?: number;
  armor?: number;
  tags: Array<"worker" | "infantry" | "ranged" | "siege" | "scout" | "heroic">;
}

export interface BuildingDefinition {
  id: BuildingType;
  label: string;
  age: Age;
  cost: Partial<ResourceBag>;
  buildTimeMs: number;
  hp: number;
  footprint: TilePoint;
  sight: number;
  production?: Array<UnitType | ResearchId | Age>;
  resourceDropoff?: ResourceType[];
  populationCap?: number;
  attackDamage?: number;
  attackRange?: number;
  attackCooldownMs?: number;
  passable?: boolean;
}

export type UnitOrder =
  | { type: "idle" }
  | { type: "move"; destination: TilePoint }
  | { type: "attackMove"; destination: TilePoint }
  | { type: "gather"; targetId: string; phase: "toResource" | "harvest" | "toDropoff"; dropoffId?: string }
  | { type: "build"; targetId: string }
  | { type: "attack"; targetId: string }
  | { type: "hold" };

export interface UnitEntity {
  id: string;
  kind: "unit";
  unitType: UnitType;
  playerId: PlayerId;
  position: { x: number; y: number };
  hp: number;
  maxHp: number;
  order: UnitOrder;
  path: TilePoint[];
  moveTarget?: TilePoint;
  attackCooldownMs: number;
  carry?: { type: ResourceType; amount: number };
}

export interface ProductionItem {
  kind: "unit" | "research" | "age";
  id: UnitType | ResearchId | Age;
  remainingMs: number;
}

export interface BuildingEntity {
  id: string;
  kind: "building";
  buildingType: BuildingType;
  playerId: PlayerId;
  tile: TilePoint;
  hp: number;
  maxHp: number;
  completed: boolean;
  buildProgressMs: number;
  queue: ProductionItem[];
  rallyPoint: TilePoint;
  attackCooldownMs: number;
}

export interface ResourceEntity {
  id: string;
  kind: "resource";
  resourceType: ResourceType;
  tile: TilePoint;
  amount: number;
  maxAmount: number;
}

export interface Projectile {
  id: string;
  playerId: PlayerId;
  targetId: string;
  position: { x: number; y: number };
  speed: number;
  damage: number;
}

export type Entity = UnitEntity | BuildingEntity | ResourceEntity;

export interface PlayerState {
  id: PlayerId;
  faction: "abbeyAlliance" | "verminRaiders";
  resources: ResourceBag;
  age: Age;
  populationUsed: number;
  populationCap: number;
  research: Partial<Record<ResearchId, boolean>>;
  explored: boolean[];
  visible: boolean[];
  defeated: boolean;
}

export interface MapTile {
  terrain: TerrainType;
  elevation: number;
}

export interface MapData {
  width: number;
  height: number;
  tiles: MapTile[];
  playerSpawn: TilePoint;
  aiSpawn: TilePoint;
}

export interface WorldState {
  seed: number;
  tick: number;
  elapsedMs: number;
  map: MapData;
  players: Record<PlayerId, PlayerState>;
  entities: Record<string, Entity>;
  projectiles: Projectile[];
  outcome: Outcome;
}

export interface SaveGameSnapshot {
  version: number;
  timestamp: number;
  seed: number;
  difficulty: Difficulty;
  elapsedMs: number;
  world: WorldState;
}

export type GameCommand =
  | { type: "move"; unitIds: string[]; destination: TilePoint }
  | { type: "attackMove"; unitIds: string[]; destination: TilePoint }
  | { type: "gather"; unitIds: string[]; targetId: string }
  | { type: "build"; unitIds: string[]; buildingType: BuildingType; tile: TilePoint }
  | { type: "train"; buildingId: string; unitType: UnitType }
  | { type: "research"; buildingId: string; researchId: ResearchId }
  | { type: "ageUp"; buildingId: string; nextAge: Age }
  | { type: "setRally"; buildingId: string; tile: TilePoint }
  | { type: "attack"; unitIds: string[]; targetId: string }
  | { type: "stop"; unitIds: string[] };

export interface SessionState {
  selectedIds: string[];
  buildMode?: BuildingType;
  paused: boolean;
}
