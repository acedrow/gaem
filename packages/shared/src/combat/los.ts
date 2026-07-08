import type { GameState } from "../types.js";
import { tileAt } from "../map.js";

function tileElevation(state: GameState, x: number, y: number): number {
  return tileAt(state.tiles, x, y)?.elevation ?? 0;
}

function terrainBlocksLos(tile: ReturnType<typeof tileAt>): boolean {
  if (!tile) return true;
  return tile.terrain.includes("obstacle");
}

function elevationBlocksLos(
  blockerElev: number,
  viewerElev: number,
  targetElev: number,
): boolean {
  return blockerElev > viewerElev && blockerElev > targetElev;
}

export function tilesOnLine(
  a: { x: number; y: number },
  b: { x: number; y: number },
): { x: number; y: number }[] {
  const tiles: { x: number; y: number }[] = [];
  let x0 = a.x;
  let y0 = a.y;
  const x1 = b.x;
  const y1 = b.y;
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;

  while (true) {
    tiles.push({ x: x0, y: y0 });
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x0 += sx;
    }
    if (e2 < dx) {
      err += dx;
      y0 += sy;
    }
  }
  return tiles;
}

export function tilesOnSegment(
  a: { x: number; y: number },
  b: { x: number; y: number },
): { x: number; y: number }[] {
  return tilesOnLine(a, b);
}

export function tilesBetween(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): { x: number; y: number }[] {
  const line = tilesOnLine({ x: fromX, y: fromY }, { x: toX, y: toY });
  if (line.length <= 2) return [];
  return line.slice(1, -1);
}

export function hasLineOfSight(
  state: GameState,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): boolean {
  if (fromX === toX && fromY === toY) return true;

  const viewerElev = tileElevation(state, fromX, fromY);
  const targetElev = tileElevation(state, toX, toY);

  for (const tile of tilesBetween(fromX, fromY, toX, toY)) {
    if (terrainBlocksLos(tileAt(state.tiles, tile.x, tile.y))) return false;
    const elev = tileElevation(state, tile.x, tile.y);
    if (elevationBlocksLos(elev, viewerElev, targetElev)) return false;
  }
  return true;
}

export function tilesInManhattanRange(
  ox: number,
  oy: number,
  range: number,
  width: number,
  height: number,
): { x: number; y: number }[] {
  const tiles: { x: number; y: number }[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (Math.abs(x - ox) + Math.abs(y - oy) <= range) {
        tiles.push({ x, y });
      }
    }
  }
  return tiles;
}

export function visibleTileKeys(
  state: GameState,
  ox: number,
  oy: number,
  opts?: { maxRange?: number },
): Set<string> {
  const keys = new Set<string>();
  const candidates =
    opts?.maxRange != null
      ? tilesInManhattanRange(ox, oy, opts.maxRange, state.width, state.height)
      : state.tiles.map((t) => ({ x: t.x, y: t.y }));

  for (const tile of candidates) {
    if (tile.x === ox && tile.y === oy) continue;
    if (hasLineOfSight(state, ox, oy, tile.x, tile.y)) {
      keys.add(`${tile.x},${tile.y}`);
    }
  }
  return keys;
}

export function visibleEnemyIds(
  state: GameState,
  playerId: string,
  opts?: { maxRange?: number },
): string[] {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return [];
  const visible = visibleTileKeys(state, player.x, player.y, opts);
  return state.enemies
    .filter((e) => visible.has(`${e.x},${e.y}`))
    .map((e) => e.id);
}

export function outOfLineOfSightTileKeys(
  state: GameState,
  ox: number,
  oy: number,
): Set<string> {
  const visible = visibleTileKeys(state, ox, oy);
  const keys = new Set<string>();
  for (const tile of state.tiles) {
    if (tile.x === ox && tile.y === oy) continue;
    const key = `${tile.x},${tile.y}`;
    if (!visible.has(key)) keys.add(key);
  }
  return keys;
}

export function tilesOnCardinalLine(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): { x: number; y: number }[] {
  const tiles: { x: number; y: number }[] = [];
  const dx = Math.sign(toX - fromX);
  const dy = Math.sign(toY - fromY);
  if (dx === 0 && dy === 0) return tiles;
  if (dx !== 0 && dy !== 0) return tiles;

  let x = fromX + dx;
  let y = fromY + dy;
  while (x !== toX || y !== toY) {
    tiles.push({ x, y });
    x += dx;
    y += dy;
  }
  tiles.push({ x: toX, y: toY });
  return tiles;
}
