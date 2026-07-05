import type { GameState } from "../types.js";
import { tileAt } from "../map.js";

const LOS_BLOCKING = new Set(["impassable", "obstacle", "cover"]);

function blocksLos(tile: ReturnType<typeof tileAt>): boolean {
  if (!tile) return true;
  return tile.terrain.some((t) => LOS_BLOCKING.has(t));
}

export function hasLineOfSight(
  state: GameState,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): boolean {
  if (fromX === toX && fromY === toY) return true;

  let x = fromX;
  let y = fromY;
  const dx = Math.sign(toX - fromX);
  const dy = Math.sign(toY - fromY);

  if (dx !== 0 && dy !== 0) return false;

  while (x !== toX || y !== toY) {
    x += dx;
    y += dy;
    if (blocksLos(tileAt(state.tiles, x, y))) return false;
  }
  return true;
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
