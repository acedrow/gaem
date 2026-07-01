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

function playerMatchesProfile(
  player: Player,
  playerKey: string,
  nickname?: string
): boolean {
  if (player.playerKey === playerKey) return true;
  return nickname !== undefined && !player.playerKey && player.nickname === nickname;
}

export function resolvePlayerForJoin(
  state: GameState,
  opts: {
    playerKey: string;
    nickname?: string;
    preferredId?: string | null;
    newId: string;
  }
): { playerId: string } | { error: "board_full" } {
  const { playerKey, nickname, preferredId, newId } = opts;
  const isMatch = (p: Player) => playerMatchesProfile(p, playerKey, nickname);
  const matches = state.players.filter(isMatch);

  let playerId: string | null = null;
  if (preferredId && state.players.some((p) => p.id === preferredId)) {
    playerId = preferredId;
  } else if (matches.length > 0) {
    playerId = matches[0]!.id;
  }

  if (!playerId) {
    const joined = addPlayer(state, {
      id: newId,
      x: 0,
      y: 0,
      playerKey,
      nickname,
    });
    if (!joined) return { error: "board_full" };
    return { playerId: newId };
  }

  for (const dup of state.players.filter((p) => p.id !== playerId && isMatch(p))) {
    removePlayer(state, dup.id);
  }

  const player = state.players.find((p) => p.id === playerId);
  if (player) {
    player.playerKey = playerKey;
    if (nickname !== undefined) player.nickname = nickname;
  }

  return { playerId };
}
