import type { GameState, Player } from "./types.js";
import { isWalkable, tileAt } from "./map.js";

export function findSpawn(state: GameState): { x: number; y: number } | null {
  for (let y = 1; y < state.height - 1; y++) {
    for (let x = 1; x < state.width - 1; x++) {
      const tile = tileAt(state.tiles, x, y);
      if (!isWalkable(tile)) continue;
      if (state.players.some((p) => p.x === x && p.y === y)) continue;
      return { x, y };
    }
  }
  return null;
}

function isOccupied(state: GameState, x: number, y: number): boolean {
  return state.players.some((p) => p.x === x && p.y === y);
}

export function validateMove(
  state: GameState,
  playerId: string,
  toX: number,
  toY: number
): string | null {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return "Unknown player";

  if (toX < 0 || toY < 0 || toX >= state.width || toY >= state.height) {
    return "Out of bounds";
  }
  if (!isWalkable(tileAt(state.tiles, toX, toY))) return "Blocked";

  const dx = Math.abs(toX - player.x);
  const dy = Math.abs(toY - player.y);
  if (dx + dy !== 1) return "Must move to an adjacent tile";

  if (isOccupied(state, toX, toY)) return "Tile occupied";

  return null;
}

export function applyMove(
  state: GameState,
  playerId: string,
  toX: number,
  toY: number
): void {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return;
  player.x = toX;
  player.y = toY;
}

export function addPlayer(state: GameState, player: Player): boolean {
  const spawn = findSpawn(state);
  if (!spawn) return false;
  state.players.push({ ...player, x: spawn.x, y: spawn.y });
  return true;
}

export function removePlayer(state: GameState, playerId: string): void {
  state.players = state.players.filter((p) => p.id !== playerId);
}
