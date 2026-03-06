import type { Entity, MapData, TilePoint } from "./types";
import { BUILDING_DEFINITIONS } from "./content";

interface Node {
  x: number;
  y: number;
  cost: number;
  score: number;
}

function key(x: number, y: number): string {
  return `${x},${y}`;
}

function heuristic(a: TilePoint, b: TilePoint): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function isTileInBounds(map: MapData, tile: TilePoint): boolean {
  return tile.x >= 0 && tile.y >= 0 && tile.x < map.width && tile.y < map.height;
}

export function buildOccupancy(map: MapData, entities: Record<string, Entity>, ignoreEntityId?: string): boolean[] {
  const grid = new Array(map.width * map.height).fill(false);
  for (const entity of Object.values(entities)) {
    if (entity.id === ignoreEntityId || entity.kind !== "building") {
      continue;
    }
    const definition = BUILDING_DEFINITIONS[entity.buildingType];
    if (definition.passable) {
      continue;
    }
    for (let offsetX = 0; offsetX < definition.footprint.x; offsetX += 1) {
      for (let offsetY = 0; offsetY < definition.footprint.y; offsetY += 1) {
        const tileX = entity.tile.x + offsetX;
        const tileY = entity.tile.y + offsetY;
        if (tileX < 0 || tileY < 0 || tileX >= map.width || tileY >= map.height) {
          continue;
        }
        grid[tileY * map.width + tileX] = true;
      }
    }
  }
  return grid;
}

export function isTileBlocked(map: MapData, occupancy: boolean[], tile: TilePoint): boolean {
  return !isTileInBounds(map, tile) || occupancy[tile.y * map.width + tile.x];
}

export function findPath(
  map: MapData,
  occupancy: boolean[],
  start: TilePoint,
  destination: TilePoint,
): TilePoint[] {
  const goal = {
    x: Math.max(0, Math.min(map.width - 1, destination.x)),
    y: Math.max(0, Math.min(map.height - 1, destination.y)),
  };
  if (start.x === goal.x && start.y === goal.y) {
    return [];
  }

  const frontier: Node[] = [
    { x: start.x, y: start.y, cost: 0, score: heuristic(start, goal) },
  ];
  const cameFrom = new Map<string, string>();
  const costSoFar = new Map<string, number>([[key(start.x, start.y), 0]]);
  const neighbors = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
  ];

  while (frontier.length > 0) {
    frontier.sort((left, right) => left.score - right.score);
    const current = frontier.shift();
    if (!current) {
      break;
    }
    if (current.x === goal.x && current.y === goal.y) {
      const path: TilePoint[] = [];
      let cursor = key(goal.x, goal.y);
      while (cursor !== key(start.x, start.y)) {
        const [x, y] = cursor.split(",").map(Number);
        path.unshift({ x, y });
        const previous = cameFrom.get(cursor);
        if (!previous) {
          break;
        }
        cursor = previous;
      }
      return path;
    }

    for (const neighbor of neighbors) {
      const next = { x: current.x + neighbor.x, y: current.y + neighbor.y };
      if (isTileBlocked(map, occupancy, next) && !(next.x === goal.x && next.y === goal.y)) {
        continue;
      }
      const nextCost = current.cost + 1;
      const nextKey = key(next.x, next.y);
      const existing = costSoFar.get(nextKey);
      if (existing !== undefined && existing <= nextCost) {
        continue;
      }
      costSoFar.set(nextKey, nextCost);
      cameFrom.set(nextKey, key(current.x, current.y));
      frontier.push({
        x: next.x,
        y: next.y,
        cost: nextCost,
        score: nextCost + heuristic(next, goal),
      });
    }
  }

  return [];
}
