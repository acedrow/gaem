import type { Enemy, GameState, Player } from "./types.js";
import { getEnemyMaxHpByName } from "./enemy-data.js";
import { getClassMaxHp } from "./player-data.js";
import { isWalkable, tileAt } from "./map.js";

export function clampHp(hp: number, maxHp: number): number {
  return Math.max(0, Math.min(hp, maxHp));
}

export function getPlayerMaxHp(player: Player): number {
  return getClassMaxHp(player.class);
}

export function getEnemyMaxHp(enemy: Enemy): number {
  return getEnemyMaxHpByName(enemy.name);
}

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
  const maxHp = getEnemyMaxHp(enemy);
  state.enemies.push({
    ...enemy,
    hp: clampHp(enemy.hp ?? maxHp, maxHp),
  });
  return null;
}

export function removeEnemy(state: GameState, enemyId: string): boolean {
  const before = state.enemies.length;
  state.enemies = state.enemies.filter((e) => e.id !== enemyId);
  return state.enemies.length < before;
}

export function addPlayer(
  state: GameState,
  player: Player,
  opts?: { className?: string }
): boolean {
  const spawn = findSpawn(state);
  if (!spawn) return false;
  const className = opts?.className ?? player.class;
  const maxHp = getClassMaxHp(className);
  state.players.push({
    ...player,
    x: spawn.x,
    y: spawn.y,
    ...(className !== undefined ? { class: className } : {}),
    hp: clampHp(player.hp ?? maxHp, maxHp),
  });
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

export function setPlayerHp(
  state: GameState,
  playerId: string,
  hp: number
): string | null {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return "Unknown player";
  player.hp = clampHp(hp, getPlayerMaxHp(player));
  return null;
}

export function syncPlayerSheet(
  state: GameState,
  characterSheetId: string,
  className: string
): string | null {
  const player = state.players.find((p) => p.characterSheetId === characterSheetId);
  if (!player) return "Player not on board";
  player.class = className;
  player.hp = clampHp(player.hp ?? getClassMaxHp(className), getClassMaxHp(className));
  return null;
}

export function resolvePlayerForJoin(
  state: GameState,
  opts: {
    playerKey: string;
    nickname?: string;
    preferredId?: string | null;
    newId: string;
    className?: string;
    characterSheetId?: string;
  }
): { playerId: string } | { error: "board_full" } {
  const { playerKey, nickname, preferredId, newId, className, characterSheetId } = opts;
  const isMatch = (p: Player) => playerMatchesProfile(p, playerKey, nickname);
  const matches = state.players.filter(isMatch);

  let playerId: string | null = null;
  if (preferredId && state.players.some((p) => p.id === preferredId)) {
    playerId = preferredId;
  } else if (matches.length > 0) {
    playerId = matches[0]!.id;
  }

  if (!playerId) {
    const joined = addPlayer(
      state,
      {
        id: newId,
        x: 0,
        y: 0,
        playerKey,
        nickname,
        characterSheetId,
        hp: getClassMaxHp(className),
      },
      { className }
    );
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
    if (characterSheetId !== undefined) player.characterSheetId = characterSheetId;
    if (className !== undefined) {
      const maxHp = getClassMaxHp(className);
      player.class = className;
      if (player.hp === undefined) {
        player.hp = maxHp;
      } else {
        player.hp = clampHp(player.hp, maxHp);
      }
    }
  }

  return { playerId };
}

export function normalizeGameState(state: GameState): GameState {
  if (!state.enemies) {
    state.enemies = [];
  }
  for (const player of state.players) {
    const maxHp = getPlayerMaxHp(player);
    if (player.hp === undefined) {
      player.hp = maxHp;
    } else {
      player.hp = clampHp(player.hp, maxHp);
    }
  }
  for (const enemy of state.enemies) {
    const maxHp = getEnemyMaxHp(enemy);
    if (enemy.hp === undefined) {
      enemy.hp = maxHp;
    } else {
      enemy.hp = clampHp(enemy.hp, maxHp);
    }
  }
  return state;
}
