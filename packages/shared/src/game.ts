import { BOARD_HEIGHT, BOARD_WIDTH } from "./constants.js";
import type { GameState, Player, TileKind } from "./types.js";

function emptyBoard(): TileKind[][] {
  const rows: TileKind[][] = [];
  for (let y = 0; y < BOARD_HEIGHT; y++) {
    const row: TileKind[] = [];
    for (let x = 0; x < BOARD_WIDTH; x++) {
      const border =
        x === 0 || y === 0 || x === BOARD_WIDTH - 1 || y === BOARD_HEIGHT - 1;
      row.push(border ? "wall" : "empty");
    }
    rows.push(row);
  }
  return rows;
}

export function createInitialState(): GameState {
  return {
    width: BOARD_WIDTH,
    height: BOARD_HEIGHT,
    tiles: emptyBoard(),
    players: [],
  };
}

export function findSpawn(state: GameState): { x: number; y: number } | null {
  for (let y = 1; y < state.height - 1; y++) {
    for (let x = 1; x < state.width - 1; x++) {
      if (state.tiles[y][x] !== "empty") continue;
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
  if (state.tiles[toY][toX] === "wall") return "Blocked";

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
