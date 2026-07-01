import type { Enemy, GameState, Player } from "./types.js";
import { isWalkable, tileAt } from "./map.js";

function isOccupiedByPlayer(state: GameState, x: number, y: number): boolean {
  return state.players.some((p) => p.x === x && p.y === y);
}

function isOccupiedByEnemy(state: GameState, x: number, y: number): boolean {
  return state.enemies.some((e) => e.x === x && e.y === y);
}

function isOccupied(state: GameState, x: number, y: number): boolean {
  return isOccupiedByPlayer(state, x, y) || isOccupiedByEnemy(state, x, y);
}

export function findSpawn(state: GameState): { x: number; y: number } | null {
  for (let y = 1; y < state.height - 1; y++) {
    for (let x = 1; x < state.width - 1; x++) {
      const tile = tileAt(state.tiles, x, y);
      if (!isWalkable(tile)) continue;
      if (isOccupied(state, x, y)) continue;
      return { x, y };
    }
  }
  return null;
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

export function validateEnemyMove(
  state: GameState,
  enemyId: string,
  toX: number,
  toY: number
): string | null {
  const enemy = state.enemies.find((e) => e.id === enemyId);
  if (!enemy) return "Unknown enemy";

  if (toX < 0 || toY < 0 || toX >= state.width || toY >= state.height) {
    return "Out of bounds";
  }
  if (!isWalkable(tileAt(state.tiles, toX, toY))) return "Blocked";

  const dx = Math.abs(toX - enemy.x);
  const dy = Math.abs(toY - enemy.y);
  if (dx + dy !== 1) return "Must move to an adjacent tile";

  if (isOccupiedByPlayer(state, toX, toY)) return "Tile occupied";
  if (state.enemies.some((e) => e.id !== enemyId && e.x === toX && e.y === toY)) {
    return "Tile occupied";
  }

  return null;
}

export function applyEnemyMove(
  state: GameState,
  enemyId: string,
  toX: number,
  toY: number
): void {
  const enemy = state.enemies.find((e) => e.id === enemyId);
  if (!enemy) return;
  enemy.x = toX;
  enemy.y = toY;
}

export function validateAddEnemy(
  state: GameState,
  x: number,
  y: number
): string | null {
  if (x < 0 || y < 0 || x >= state.width || y >= state.height) {
    return "Out of bounds";
  }
  if (!isWalkable(tileAt(state.tiles, x, y))) return "Blocked";
  if (isOccupied(state, x, y)) return "Tile occupied";
  return null;
}

export function addEnemy(state: GameState, enemy: Enemy): string | null {
  const err = validateAddEnemy(state, enemy.x, enemy.y);
  if (err) return err;
  state.enemies.push(enemy);
  return null;
}

export function removeEnemy(state: GameState, enemyId: string): boolean {
  const before = state.enemies.length;
  state.enemies = state.enemies.filter((e) => e.id !== enemyId);
  return state.enemies.length < before;
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

export function normalizeGameState(state: GameState): GameState {
  if (!state.enemies) {
    state.enemies = [];
  }
  return state;
}
