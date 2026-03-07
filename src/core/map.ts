import { createRng } from "./random";
import type { MapData, MapPreset, MapTile, ResourceType, TilePoint } from "./types";

type ResourceCluster = { type: ResourceType; tiles: TilePoint[] };
type TerrainPalette = {
  unexplored: number;
  grassVisible: number;
  grassExplored: number;
  mossVisible: number;
  mossExplored: number;
  dirtVisible: number;
  dirtExplored: number;
  shadow: number;
  highlight: number;
  minimapVisible: string;
  minimapExplored: string;
};

type MapPresetDefinition = {
  id: MapPreset;
  label: string;
  description: string;
  terrainSummary: string;
  resourceSummary: string;
  strategicNote: string;
  width: number;
  height: number;
  playerSpawn: TilePoint;
  aiSpawn: TilePoint;
  resourceClusters: ResourceCluster[];
  terrainWeights: {
    moss: number;
      dirt: number;
    };
  elevationRange: number;
  terrainPalette: TerrainPalette;
};

export const MAP_DEFINITIONS: Record<MapPreset, MapPresetDefinition> = {
  mossflowerMeadows: {
    id: "mossflowerMeadows",
    label: "Mossflower Meadows",
    description: "A broad open meadow with balanced lanes, mirrored gathers, and few hard choke points.",
    terrainSummary: "Open grassy lanes with light moss pockets and modest travel friction.",
    resourceSummary: "Balanced outer woodlines with safe early berries and side stone and iron.",
    strategicNote: "Best for standard openings, early scouting, and clean front-to-back battles.",
    width: 24,
    height: 24,
    playerSpawn: { x: 4, y: 4 },
    aiSpawn: { x: 18, y: 18 },
    terrainWeights: {
      moss: 0.18,
      dirt: 0.15,
    },
    elevationRange: 2,
    terrainPalette: {
      unexplored: 0x08100f,
      grassVisible: 0x4e6f48,
      grassExplored: 0x2d402b,
      mossVisible: 0x335a44,
      mossExplored: 0x21362a,
      dirtVisible: 0x705336,
      dirtExplored: 0x4c3827,
      shadow: 0x18231b,
      highlight: 0x6e9d72,
      minimapVisible: "#4c7750",
      minimapExplored: "#23372c",
    },
    resourceClusters: [
      {
        type: "food",
        tiles: [
          { x: 6, y: 4 },
          { x: 7, y: 4 },
          { x: 4, y: 7 },
          { x: 5, y: 7 },
          { x: 18, y: 16 },
          { x: 19, y: 16 },
          { x: 16, y: 19 },
          { x: 17, y: 19 },
        ],
      },
      {
        type: "timber",
        tiles: [
          { x: 2, y: 7 },
          { x: 2, y: 8 },
          { x: 3, y: 8 },
          { x: 20, y: 15 },
          { x: 21, y: 15 },
          { x: 21, y: 16 },
        ],
      },
      {
        type: "stone",
        tiles: [
          { x: 8, y: 2 },
          { x: 9, y: 2 },
          { x: 14, y: 21 },
          { x: 15, y: 21 },
        ],
      },
      {
        type: "iron",
        tiles: [
          { x: 3, y: 11 },
          { x: 4, y: 11 },
          { x: 19, y: 12 },
          { x: 20, y: 12 },
        ],
      },
    ],
  },
  abbeyOrchard: {
    id: "abbeyOrchard",
    label: "Abbey Orchard",
    description: "An orchard battlefield with richer central food, greener cover, and longer lateral routes.",
    terrainSummary: "Dense mossy greens and orchard soil with safe flanks and a food-rich center.",
    resourceSummary: "Extra central food encourages mid-map control while timber stays nearer the edges.",
    strategicNote: "Rewards factions that can rotate quickly and contest the center before the economy snowballs.",
    width: 28,
    height: 22,
    playerSpawn: { x: 5, y: 8 },
    aiSpawn: { x: 21, y: 11 },
    terrainWeights: {
      moss: 0.25,
      dirt: 0.1,
    },
    elevationRange: 2,
    terrainPalette: {
      unexplored: 0x08110d,
      grassVisible: 0x567b4a,
      grassExplored: 0x31492e,
      mossVisible: 0x44704a,
      mossExplored: 0x294233,
      dirtVisible: 0x7b5b37,
      dirtExplored: 0x503a27,
      shadow: 0x1c2a1b,
      highlight: 0x86ad6b,
      minimapVisible: "#5b8450",
      minimapExplored: "#2f4732",
    },
    resourceClusters: [
      {
        type: "food",
        tiles: [
          { x: 6, y: 5 },
          { x: 7, y: 5 },
          { x: 5, y: 6 },
          { x: 6, y: 6 },
          { x: 21, y: 13 },
          { x: 22, y: 13 },
          { x: 21, y: 14 },
          { x: 22, y: 14 },
          { x: 13, y: 9 },
          { x: 14, y: 9 },
        ],
      },
      {
        type: "timber",
        tiles: [
          { x: 3, y: 9 },
          { x: 3, y: 10 },
          { x: 4, y: 10 },
          { x: 24, y: 10 },
          { x: 24, y: 11 },
          { x: 23, y: 11 },
          { x: 14, y: 4 },
          { x: 15, y: 4 },
        ],
      },
      {
        type: "stone",
        tiles: [
          { x: 10, y: 3 },
          { x: 11, y: 3 },
          { x: 17, y: 18 },
          { x: 18, y: 18 },
        ],
      },
      {
        type: "iron",
        tiles: [
          { x: 8, y: 16 },
          { x: 9, y: 16 },
          { x: 19, y: 6 },
          { x: 20, y: 6 },
        ],
      },
    ],
  },
  salamandastronRidge: {
    id: "salamandastronRidge",
    label: "Salamandastron Ridge",
    description: "A harsh ridge map with stone-heavy center ground, longer climbs, and tighter attack lanes.",
    terrainSummary: "Rocky dirt lanes, sparse moss, and harsher elevation around the central ridge line.",
    resourceSummary: "More central stone and exposed iron encourage positional play and fortified pushes.",
    strategicNote: "Rewards tougher armies, deliberate timing windows, and control of narrow ridge approaches.",
    width: 26,
    height: 26,
    playerSpawn: { x: 5, y: 19 },
    aiSpawn: { x: 19, y: 6 },
    terrainWeights: {
      moss: 0.08,
      dirt: 0.26,
    },
    elevationRange: 3,
    terrainPalette: {
      unexplored: 0x0c0d0e,
      grassVisible: 0x536649,
      grassExplored: 0x313d2c,
      mossVisible: 0x3c5443,
      mossExplored: 0x27352c,
      dirtVisible: 0x7e5a3d,
      dirtExplored: 0x57402c,
      shadow: 0x271b17,
      highlight: 0xa7845d,
      minimapVisible: "#6e5b43",
      minimapExplored: "#3d3025",
    },
    resourceClusters: [
      {
        type: "food",
        tiles: [
          { x: 6, y: 20 },
          { x: 7, y: 20 },
          { x: 8, y: 19 },
          { x: 17, y: 6 },
          { x: 18, y: 6 },
          { x: 19, y: 7 },
        ],
      },
      {
        type: "timber",
        tiles: [
          { x: 4, y: 16 },
          { x: 4, y: 17 },
          { x: 5, y: 17 },
          { x: 20, y: 9 },
          { x: 21, y: 9 },
          { x: 21, y: 10 },
        ],
      },
      {
        type: "stone",
        tiles: [
          { x: 10, y: 13 },
          { x: 11, y: 13 },
          { x: 12, y: 13 },
          { x: 14, y: 12 },
          { x: 15, y: 12 },
        ],
      },
      {
        type: "iron",
        tiles: [
          { x: 8, y: 10 },
          { x: 9, y: 10 },
          { x: 17, y: 15 },
          { x: 18, y: 15 },
        ],
      },
    ],
  },
};

export function tileIndex(map: MapData, tile: TilePoint): number {
  return tile.y * map.width + tile.x;
}

export function getMapDefinition(mapPreset: MapPreset): MapPresetDefinition {
  return MAP_DEFINITIONS[mapPreset];
}

export function getPlayableMaps(): MapPresetDefinition[] {
  return Object.values(MAP_DEFINITIONS);
}

export function createMap(seed: number, mapPreset: MapPreset): MapData {
  const rng = createRng(seed);
  const definition = getMapDefinition(mapPreset);
  const tiles: MapTile[] = [];
  for (let y = 0; y < definition.height; y += 1) {
    for (let x = 0; x < definition.width; x += 1) {
      const noise = rng();
      const terrain = noise < definition.terrainWeights.dirt
        ? "dirt"
        : noise > (1 - definition.terrainWeights.moss)
          ? "moss"
          : "grass";
      tiles.push({
        terrain,
        elevation: Math.floor(rng() * definition.elevationRange),
      });
    }
  }

  return {
    preset: mapPreset,
    width: definition.width,
    height: definition.height,
    tiles,
    playerSpawn: { ...definition.playerSpawn },
    aiSpawn: { ...definition.aiSpawn },
    resourceClusters: definition.resourceClusters.map((cluster) => ({
      type: cluster.type,
      tiles: cluster.tiles.map((tile) => ({ ...tile })),
    })),
  };
}
