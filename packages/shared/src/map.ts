import type { Enemy, GameMap, GameState, MapTile, TerrainType } from "./types.js";
import { TERRAIN_TYPES } from "./types.js";
import { getEnemyMaxHpByName } from "./enemy-data.js";

const BLOCKING_TERRAIN = new Set<TerrainType>(["impassable", "obstacle", "void"]);
const TERRAIN_SET = new Set<string>(TERRAIN_TYPES);

function tileKey(x: number, y: number): string {
  return `${x},${y}`;
}

export function buildTileIndex(tiles: MapTile[]): Map<string, MapTile> {
  const index = new Map<string, MapTile>();
  for (const tile of tiles) {
    index.set(tileKey(tile.x, tile.y), tile);
  }
  return index;
}

export function tileAt(
  tiles: MapTile[] | Map<string, MapTile>,
  x: number,
  y: number
): MapTile | undefined {
  if (tiles instanceof Map) return tiles.get(tileKey(x, y));
  return buildTileIndex(tiles).get(tileKey(x, y));
}

export function isWalkable(tile: MapTile | undefined): boolean {
  if (!tile) return false;
  return !tile.terrain.some((t) => BLOCKING_TERRAIN.has(t));
}

export function parseGameMap(raw: unknown): GameMap {
  if (!raw || typeof raw !== "object") {
    throw new Error("Map must be an object");
  }
  const obj = raw as Record<string, unknown>;

  const id = obj.id;
  if (typeof id !== "string" || !id.trim()) {
    throw new Error("Map id must be a non-empty string");
  }

  const width = obj.width;
  const height = obj.height;
  if (!Number.isInteger(width) || (width as number) <= 0) {
    throw new Error("Map width must be a positive integer");
  }
  if (!Number.isInteger(height) || (height as number) <= 0) {
    throw new Error("Map height must be a positive integer");
  }

  if (!Array.isArray(obj.tiles)) {
    throw new Error("Map tiles must be an array");
  }

  const w = width as number;
  const h = height as number;
  const expected = w * h;
  if (obj.tiles.length !== expected) {
    throw new Error(`Map must have ${expected} tiles, got ${obj.tiles.length}`);
  }

  const seen = new Set<string>();
  const tiles: MapTile[] = [];

  for (const entry of obj.tiles) {
    if (!entry || typeof entry !== "object") {
      throw new Error("Each tile must be an object");
    }
    const t = entry as Record<string, unknown>;

    const x = t.x;
    const y = t.y;
    if (!Number.isInteger(x) || !Number.isInteger(y)) {
      throw new Error("Tile x and y must be integers");
    }
    if ((x as number) < 0 || (x as number) >= w || (y as number) < 0 || (y as number) >= h) {
      throw new Error(`Tile (${x}, ${y}) is out of bounds`);
    }

    const key = tileKey(x as number, y as number);
    if (seen.has(key)) {
      throw new Error(`Duplicate tile at (${x}, ${y})`);
    }
    seen.add(key);

    if (!Array.isArray(t.terrain) || t.terrain.length === 0) {
      throw new Error(`Tile (${x}, ${y}) must have at least one terrain type`);
    }

    const terrain: TerrainType[] = [];
    const terrainSeen = new Set<string>();
    for (const value of t.terrain) {
      if (typeof value !== "string" || !TERRAIN_SET.has(value)) {
        throw new Error(`Tile (${x}, ${y}) has invalid terrain type: ${value}`);
      }
      if (terrainSeen.has(value)) {
        throw new Error(`Tile (${x}, ${y}) has duplicate terrain type: ${value}`);
      }
      terrainSeen.add(value);
      terrain.push(value as TerrainType);
    }

    const elevation = t.elevation;
    if (!Number.isInteger(elevation) || (elevation as number) < -3 || (elevation as number) > 3) {
      throw new Error(`Tile (${x}, ${y}) elevation must be an integer from -3 to 3`);
    }

    tiles.push({
      x: x as number,
      y: y as number,
      terrain,
      elevation: elevation as number,
    });
  }

  const enemies = parseMapEnemies(obj.enemies, w, h);

  return { id: id.trim(), width: w, height: h, tiles, enemies };
}

function parseMapEnemies(raw: unknown, width: number, height: number): Enemy[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) {
    throw new Error("Map enemies must be an array");
  }

  const seenIds = new Set<string>();
  const seenPositions = new Set<string>();
  const enemies: Enemy[] = [];

  for (const entry of raw) {
    if (!entry || typeof entry !== "object") {
      throw new Error("Each enemy must be an object");
    }
    const e = entry as Record<string, unknown>;

    const id = e.id;
    if (typeof id !== "string" || !id.trim()) {
      throw new Error("Enemy id must be a non-empty string");
    }
    if (seenIds.has(id)) {
      throw new Error(`Duplicate enemy id: ${id}`);
    }
    seenIds.add(id);

    const x = e.x;
    const y = e.y;
    if (!Number.isInteger(x) || !Number.isInteger(y)) {
      throw new Error(`Enemy ${id} x and y must be integers`);
    }
    if ((x as number) < 0 || (x as number) >= width || (y as number) < 0 || (y as number) >= height) {
      throw new Error(`Enemy ${id} at (${x}, ${y}) is out of bounds`);
    }

    const posKey = tileKey(x as number, y as number);
    if (seenPositions.has(posKey)) {
      throw new Error(`Multiple enemies at (${x}, ${y})`);
    }
    seenPositions.add(posKey);

    const name = e.name;
    if (name !== undefined && typeof name !== "string") {
      throw new Error(`Enemy ${id} name must be a string`);
    }

    enemies.push({
      id: id.trim(),
      x: x as number,
      y: y as number,
      ...(name !== undefined ? { name: name as string } : {}),
    });
  }

  return enemies;
}

export function createInitialStateFromMap(map: GameMap): GameState {
  return {
    mapId: map.id,
    width: map.width,
    height: map.height,
    tiles: map.tiles,
    players: [],
    enemies: (map.enemies ?? []).map((e) => ({
      ...e,
      hp: getEnemyMaxHpByName(e.name),
    })),
  };
}
