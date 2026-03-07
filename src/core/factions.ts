import type {
  FactionId,
  MapPreset,
  PlayerId,
  ResourceBag,
  ResourceType,
  UnitDefinition,
  UnitSpecies,
  UnitType,
} from "./types";

export type FactionDefinition = {
  id: FactionId;
  label: string;
  description: string;
  shortBonus: string;
  doctrine: string;
  playable: boolean;
  unlockLevel: number;
  tutorialUnlock?: boolean;
  themeColor: string;
  themeAccent: string;
  resourceBonus?: Partial<ResourceBag>;
  workerGatherMultiplier?: Partial<Record<ResourceType, number>>;
  unitCostMultiplier?: Partial<Record<UnitType, number>>;
  unitHpMultiplier?: Partial<Record<"infantry" | "ranged" | "worker" | "scout" | "siege", number>>;
  unitSpeedMultiplier?: Partial<Record<"infantry" | "ranged" | "worker" | "scout" | "siege", number>>;
  unitAttackBonus?: Partial<Record<"infantry" | "ranged" | "worker" | "scout" | "siege", number>>;
  populationBonus?: number;
  favoredMaps?: MapPreset[];
  unitOverrides?: Partial<Record<UnitType, Partial<Pick<UnitDefinition, "label" | "description" | "weaponLabel" | "species">>>>;
};

const TAG_KEYS = ["infantry", "ranged", "worker", "scout", "siege"] as const;

function resourceBag(food = 0, timber = 0, stone = 0, iron = 0): Partial<ResourceBag> {
  return { food, timber, stone, iron };
}

function unitOverride(
  label: string,
  description: string,
  weaponLabel: string,
  species?: UnitSpecies,
): Partial<Pick<UnitDefinition, "label" | "description" | "weaponLabel" | "species">> {
  return { label, description, weaponLabel, species };
}

export const FACTION_DEFINITIONS: Record<FactionId, FactionDefinition> = {
  abbeyAlliance: {
    id: "abbeyAlliance",
    label: "Abbey Alliance",
    description: "Balanced woodland defenders with a stable opening and resilient economy.",
    shortBonus: "Balanced economy and steady population growth.",
    doctrine: "Orderly abbey levies with dependable shields, longbows, and steady population growth.",
    playable: true,
    unlockLevel: 1,
    themeColor: "#e8d7ae",
    themeAccent: "#5f7f67",
    populationBonus: 4,
    resourceBonus: resourceBag(20, 20, 0, 0),
    favoredMaps: ["mossflowerMeadows", "abbeyOrchard"],
    unitOverrides: {
      worker: unitOverride("Abbey Worker", "Mouse laborers who build the abbey frontier and keep the economy steady.", "Mallet & Hatchet", "mouse"),
      militia: unitOverride("Abbey Militia", "Staff-and-buckler mice who hold the first line while the abbey grows.", "Oak Staff", "mouse"),
      shieldbearer: unitOverride("Gate Shieldbearer", "Disciplined abbey infantry that brace the line with heavy shields.", "Boar-spear & Shield", "mouse"),
      archer: unitOverride("Abbey Bowman", "Measured long-range support for punishing raids and holding walls.", "Yew Longbow", "mouse"),
    },
  },
  riverfolkCollective: {
    id: "riverfolkCollective",
    label: "Riverfolk Collective",
    description: "Otter-led river traders with faster gathering and nimble ranged lines.",
    shortBonus: "Workers gather food and timber faster; ranged troops move quicker.",
    doctrine: "Fast river trade and mobile skirmishers leaning on otter crews, quick gathers, and fluid ranged pressure.",
    playable: true,
    unlockLevel: 2,
    tutorialUnlock: true,
    themeColor: "#a8d8d8",
    themeAccent: "#3a7f88",
    resourceBonus: resourceBag(30, 15, 0, 0),
    workerGatherMultiplier: { food: 1.18, timber: 1.14 },
    unitSpeedMultiplier: { ranged: 1.08, scout: 1.05 },
    unitCostMultiplier: { otterSkirmisher: 0.88, archer: 0.94 },
    favoredMaps: ["abbeyOrchard", "mossflowerMeadows"],
    unitOverrides: {
      worker: unitOverride("Riverhand", "Otter laborers who work berry lines, timber banks, and riverside storehouses at speed.", "Boat Hook & Hatchet", "otter"),
      shrewScout: unitOverride("Reedrunner", "Quick river-path scouts that read flanks and raid routes early.", "Scout Pike", "otter"),
      militia: unitOverride("Dock Militia", "Riverfront fighters who trade raw armor for quick spear thrusts.", "River Pike", "otter"),
      slinger: unitOverride("Pebble Hurler", "Cheap ranged support trained to fight from banks and reed lines.", "Braided River Sling", "otter"),
      archer: unitOverride("Marsh Bowman", "Fast moving bow-crews for kiting and cross-map responses.", "Recurve River Bow", "otter"),
      otterSkirmisher: unitOverride("Stream Skirmisher", "Elite otter javelin fighters who stay mobile under pressure.", "Driftwood Javelins", "otter"),
    },
  },
  mountainClans: {
    id: "mountainClans",
    label: "Mountain Clans",
    description: "Hardy badger and mountain mouse hosts with tougher infantry and more stone on hand.",
    shortBonus: "Infantry are sturdier and hit harder; starts with extra stone.",
    doctrine: "Stone-rich mountain clans that field brutal shield walls, heavier weapons, and ridge-favoring late pushes.",
    playable: true,
    unlockLevel: 3,
    themeColor: "#d6d0c0",
    themeAccent: "#7e5842",
    resourceBonus: resourceBag(0, 0, 40, 20),
    unitHpMultiplier: { infantry: 1.12 },
    unitAttackBonus: { infantry: 2 },
    unitSpeedMultiplier: { worker: 0.96 },
    favoredMaps: ["salamandastronRidge"],
    unitOverrides: {
      worker: unitOverride("Clan Tender", "Mountain mice who quarry and raise stout frontier halls from rough ground.", "Stone Hatchet", "mouse"),
      shrewScout: unitOverride("Crag Runner", "Hill scouts who read passes and high-ground approaches quickly.", "Cliff Spear", "mouse"),
      militia: unitOverride("Stonepaw Raider", "Hard-hitting clan infantry carrying rough axes and heavier packs.", "Stone Axe", "mouse"),
      shieldbearer: unitOverride("Mountain Shieldbearer", "Heavy line infantry trained for pass fighting and grinding melee.", "Iron Hammer & Tower Shield", "badger"),
      slinger: unitOverride("Crag Slinger", "Ridge skirmishers who throw from elevation and cover narrow lanes.", "Cliff Sling", "mouse"),
      badgerChampion: unitOverride("Hall Champion", "A massive clan veteran built to smash fortified positions.", "Forge Mattock", "badger"),
      ramCart: unitOverride("Gatebreaker Ram", "A reinforced siege cart plated for grinding through defensive lines.", "Ironbound Ridge Ram", "machine"),
    },
  },
  verminRaiders: {
    id: "verminRaiders",
    label: "Vermin Raiders",
    description: "Aggressive raiding hosts that press early and keep pressure on the frontier.",
    shortBonus: "Faster military pressure and cheaper early troops.",
    doctrine: "Raiding vermin that flood the map with cheaper troops and constant attack waves.",
    playable: false,
    unlockLevel: 0,
    themeColor: "#cf8a78",
    themeAccent: "#7a2f29",
    resourceBonus: resourceBag(0, 20, 20, 0),
    unitCostMultiplier: { militia: 0.92, shieldbearer: 0.95, slinger: 0.92 },
    unitSpeedMultiplier: { infantry: 1.04, scout: 1.08 },
    unitAttackBonus: { infantry: 1, scout: 1 },
    favoredMaps: ["mossflowerMeadows", "salamandastronRidge"],
    unitOverrides: {
      worker: unitOverride("Raid Camp Laborer", "Vermin camp followers who build quickly and keep raid camps supplied.", "Rusty Hatchet", "mouse"),
      militia: unitOverride("Raider", "Cheap vermin shock troops that excel at early pressure.", "Hooked Blade", "mouse"),
      shieldbearer: unitOverride("Bruteblade", "Harder vermin infantry that shove forward under heavy shields.", "Cleaver & Shield", "badger"),
      slinger: unitOverride("Gutter Sling", "Fast harassment ranged troops with crude but effective volleys.", "Lead Sling", "shrew"),
    },
  },
};

export function getFactionDefinition(factionId: FactionId): FactionDefinition {
  return FACTION_DEFINITIONS[factionId];
}

export function getPlayableFactions(): FactionDefinition[] {
  return Object.values(FACTION_DEFINITIONS).filter((faction) => faction.playable);
}

function hasTag(definition: UnitDefinition, tag: (typeof TAG_KEYS)[number]): boolean {
  return definition.tags.includes(tag);
}

function getTaggedMultiplier(
  multipliers: Partial<Record<(typeof TAG_KEYS)[number], number>> | undefined,
  definition: UnitDefinition,
): number {
  if (!multipliers) {
    return 1;
  }
  return TAG_KEYS.reduce((multiplier, tag) => {
    return hasTag(definition, tag) ? multiplier * (multipliers[tag] ?? 1) : multiplier;
  }, 1);
}

function getTaggedBonus(
  bonuses: Partial<Record<(typeof TAG_KEYS)[number], number>> | undefined,
  definition: UnitDefinition,
): number {
  if (!bonuses) {
    return 0;
  }
  return TAG_KEYS.reduce((total, tag) => total + (hasTag(definition, tag) ? (bonuses[tag] ?? 0) : 0), 0);
}

export function getFactionAdjustedUnitDefinition(factionId: FactionId, definition: UnitDefinition): UnitDefinition {
  const faction = getFactionDefinition(factionId);
  const gatherRate = definition.gatherRate
    ? Object.fromEntries(
        Object.entries(definition.gatherRate).map(([resourceType, value]) => {
          const multiplier = faction.workerGatherMultiplier?.[resourceType as ResourceType] ?? 1;
          return [resourceType, Math.round(value * multiplier)];
        }),
      ) as typeof definition.gatherRate
    : definition.gatherRate;
  const costMultiplier = faction.unitCostMultiplier?.[definition.id] ?? 1;
  const speedMultiplier = getTaggedMultiplier(faction.unitSpeedMultiplier, definition);
  const hpMultiplier = getTaggedMultiplier(faction.unitHpMultiplier, definition);
  const attackBonus = getTaggedBonus(faction.unitAttackBonus, definition);
  const override = faction.unitOverrides?.[definition.id];
  return {
    ...definition,
    ...override,
    cost: {
      food: Math.round((definition.cost.food ?? 0) * costMultiplier),
      timber: Math.round((definition.cost.timber ?? 0) * costMultiplier),
      stone: Math.round((definition.cost.stone ?? 0) * costMultiplier),
      iron: Math.round((definition.cost.iron ?? 0) * costMultiplier),
    },
    hp: Math.round(definition.hp * hpMultiplier),
    speed: Number((definition.speed * speedMultiplier).toFixed(3)),
    attackDamage: definition.attackDamage + attackBonus,
    gatherRate,
  };
}

export function getFactionStartingResources(factionId: FactionId): Partial<ResourceBag> {
  return getFactionDefinition(factionId).resourceBonus ?? {};
}

export function getFactionPopulationBonus(factionId: FactionId): number {
  return getFactionDefinition(factionId).populationBonus ?? 0;
}

export function getFactionPalette(factionId: FactionId, playerId: PlayerId): { main: number; accent: number } {
  const faction = getFactionDefinition(factionId);
  const baseMain = Number.parseInt(faction.themeColor.slice(1), 16);
  const baseAccent = Number.parseInt(faction.themeAccent.slice(1), 16);
  if (playerId === "player") {
    return { main: baseMain, accent: baseAccent };
  }
  return {
    main: Math.max(0, baseMain - 0x222222),
    accent: Math.max(0, baseAccent - 0x111111),
  };
}
