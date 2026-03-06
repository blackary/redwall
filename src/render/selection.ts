import { BUILDING_DEFINITIONS } from "../core/content";
import type { BuildingEntity, TilePoint, UnitEntity, WorldState } from "../core/types";

export type ScreenBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

function normalizeBounds(from: TilePoint, to: TilePoint): ScreenBounds {
  return {
    minX: Math.min(from.x, to.x),
    minY: Math.min(from.y, to.y),
    maxX: Math.max(from.x, to.x),
    maxY: Math.max(from.y, to.y),
  };
}

function isPointWithinBounds(point: TilePoint, bounds: ScreenBounds): boolean {
  return point.x >= bounds.minX
    && point.x <= bounds.maxX
    && point.y >= bounds.minY
    && point.y <= bounds.maxY;
}

function isBuildingWithinBounds(
  building: BuildingEntity,
  bounds: ScreenBounds,
  project: (tile: TilePoint) => TilePoint,
): boolean {
  const footprint = BUILDING_DEFINITIONS[building.buildingType].footprint;
  const corners = [
    project({ x: building.tile.x, y: building.tile.y }),
    project({ x: building.tile.x + footprint.x, y: building.tile.y }),
    project({ x: building.tile.x, y: building.tile.y + footprint.y }),
    project({ x: building.tile.x + footprint.x, y: building.tile.y + footprint.y }),
  ];

  const entityBounds = corners.reduce<ScreenBounds>(
    (result, point) => ({
      minX: Math.min(result.minX, point.x),
      minY: Math.min(result.minY, point.y),
      maxX: Math.max(result.maxX, point.x),
      maxY: Math.max(result.maxY, point.y),
    }),
    {
      minX: Number.POSITIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY,
    },
  );

  return entityBounds.maxX >= bounds.minX
    && entityBounds.minX <= bounds.maxX
    && entityBounds.maxY >= bounds.minY
    && entityBounds.minY <= bounds.maxY;
}

export function getBoxSelectionIds(
  world: WorldState,
  from: TilePoint,
  to: TilePoint,
  project: (tile: TilePoint) => TilePoint,
): string[] {
  const bounds = normalizeBounds(from, to);

  const unitIds = Object.values(world.entities)
    .filter((entity): entity is UnitEntity => entity.kind === "unit" && entity.playerId === "player")
    .filter((entity) => isPointWithinBounds(project(entity.position), bounds))
    .map((entity) => entity.id);

  if (unitIds.length > 0) {
    return unitIds;
  }

  return Object.values(world.entities)
    .filter((entity): entity is BuildingEntity => entity.kind === "building" && entity.playerId === "player")
    .filter((entity) => isBuildingWithinBounds(entity, bounds, project))
    .map((entity) => entity.id);
}
