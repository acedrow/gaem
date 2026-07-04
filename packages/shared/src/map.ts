import type { Enemy, GameMap, GameState, MapTile, TerrainType } from "./types.js";
import { TERRAIN_TYPES } from "./types.js";
import { getEnemyMaxHpByName, getEnemyScale, getEnemyScaleByName, enemyFootprintTiles, refreshEnemyMovement } from "./enemy-data.js";

const BLOCKING_TERRAIN = new Set<TerrainType>(["impassable", "obstacle", "void"]);
const TERRAIN_SET = new Set<string>(TERRAIN_TYPES);

export function coordKey(x: number, y: number): string {
  return `${x},${y}`;
}

export function boardCellKey(x: number, y: number): string {
  return `${x}-${y}`;
}

export function isInBounds(x: number, y: number, width: number, height: number): boolean {
  return x >= 0 && y >= 0 && x < width && y < height;
}

export function isFootprintInBounds(
  x: number,
  y: number,
  scale: number,
  width: number,
  height: number,
): boolean {
  return x >= 0 && y >= 0 && x + scale <= width && y + scale <= height;
}

export function buildTileIndex(tiles: MapTile[]): Map<string, MapTile> {
  const index = new Map<string, MapTile>();
  for (const tile of tiles) {
    index.set(coordKey(tile.x, tile.y), tile);
  }
  return index;
}

let cachedTiles: MapTile[] | null = null;
let cachedIndex: Map<string, MapTile> | null = null;

function getTileIndex(tiles: MapTile[]): Map<string, MapTile> {
  if (cachedTiles === tiles && cachedIndex) return cachedIndex;
  cachedIndex = buildTileIndex(tiles);
  cachedTiles = tiles;
  return cachedIndex;
}

export function tileAt(
  tiles: MapTile[] | Map<string, MapTile>,
  x: number,
  y: number,
): MapTile | undefined {
  if (tiles instanceof Map) return tiles.get(coordKey(x, y));
  return getTileIndex(tiles).get(coordKey(x, y));
}

export function computeWalkable(tile: MapTile): boolean {
  return !tile.terrain.some((t) => BLOCKING_TERRAIN.has(t));
}

export function isWalkable(tile: MapTile | undefined): boolean {
  if (!tile) return false;
  if (tile.walkable !== undefined) return tile.walkable;
  return computeWalkable(tile);
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
    if (!isInBounds(x as number, y as number, w, h)) {
      throw new Error(`Tile (${x}, ${y}) is out of bounds`);
    }

    const key = coordKey(x as number, y as number);
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

    const tile: MapTile = {
      x: x as number,
      y: y as number,
      terrain,
      elevation: elevation as number,
    };
    tile.walkable = computeWalkable(tile);
    tiles.push(tile);
  }

  const enemies = parseMapEnemies(obj.enemies, w, h);

  const name = obj.name;
  if (name !== undefined && (typeof name !== "string" || !name.trim())) {
    throw new Error("Map name must be a non-empty string");
  }

  return {
    id: id.trim(),
    name: typeof name === "string" ? name.trim() : undefined,
    width: w,
    height: h,
    tiles,
    enemies,
  };
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

    const name = e.name;
    if (name !== undefined && typeof name !== "string") {
      throw new Error(`Enemy ${id} name must be a string`);
    }

    const rawScale = e.scale;
    if (rawScale !== undefined && (!Number.isInteger(rawScale) || (rawScale as number) < 1)) {
      throw new Error(`Enemy ${id} scale must be a positive integer`);
    }
    const scale =
      rawScale !== undefined
        ? (rawScale as number)
        : getEnemyScaleByName(name as string | undefined);

    for (const tile of enemyFootprintTiles(x as number, y as number, scale)) {
      if (!isInBounds(tile.x, tile.y, width, height)) {
        throw new Error(`Enemy ${id} footprint at (${x}, ${y}) is out of bounds`);
      }
      const posKey = coordKey(tile.x, tile.y);
      if (seenPositions.has(posKey)) {
        throw new Error(`Enemy footprints overlap at (${tile.x}, ${tile.y})`);
      }
      seenPositions.add(posKey);
    }

    enemies.push({
      id: id.trim(),
      x: x as number,
      y: y as number,
      scale,
      ...(name !== undefined ? { name: name as string } : {}),
    });
  }

  return enemies;
}

export function createInitialStateFromMap(map: GameMap): GameState {
  const enemies = (map.enemies ?? []).map((e) => {
    const enemy = {
      ...e,
      scale: getEnemyScale(e),
      hp: getEnemyMaxHpByName(e.name),
    };
    refreshEnemyMovement(enemy);
    return enemy;
  });

  return {
    mapId: map.id,
    mapName: map.name ?? map.id,
    width: map.width,
    height: map.height,
    tiles: map.tiles,
    players: [],
    enemies,
    round: 1,
    roundPhase: "deployment",
    turn: { role: "gm" },
    actedPlayerIds: [],
    turnLog: [],
    enforceTurns: true,
    enforceActionLimits: true,
    partyResources: { hellsteel: 0, soulfire: 0, brimstone: 0 },
    constructedBaseUpgrades: [],
  };
}
