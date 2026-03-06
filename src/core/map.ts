import { createRng } from "./random";
import type { MapData, MapTile, ResourceType, TilePoint } from "./types";

const RESOURCE_CLUSTERS: Array<{ type: ResourceType; tiles: TilePoint[] }> = [
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
];

export function tileIndex(map: MapData, tile: TilePoint): number {
  return tile.y * map.width + tile.x;
}

export function createMap(seed: number): MapData {
  const rng = createRng(seed);
  const width = 24;
  const height = 24;
  const tiles: MapTile[] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const noise = rng();
      const terrain = noise > 0.8 ? "moss" : noise < 0.15 ? "dirt" : "grass";
      tiles.push({
        terrain,
        elevation: Math.floor(rng() * 2),
      });
    }
  }

  return {
    width,
    height,
    tiles,
    playerSpawn: { x: 4, y: 4 },
    aiSpawn: { x: 18, y: 18 },
  };
}

export function getResourceClusterTiles(): Array<{ type: ResourceType; tiles: TilePoint[] }> {
  return RESOURCE_CLUSTERS;
}
