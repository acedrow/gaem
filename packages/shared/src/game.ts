import type { Enemy, GameState, GaemRole, PhaseAction, Player, TurnHolder } from "./types.js";
import { playerLabel } from "./console.js";
import { getEnemyMaxHpByName } from "./enemy-data.js";
import { getClassMaxHp } from "./player-data.js";
import { isWalkable, tileAt } from "./map.js";

export function createInitialRoundState(): Pick<
  GameState,
  "round" | "roundPhase" | "turn" | "actedPlayerIds" | "turnLog"
> {
  return {
    round: 1,
    roundPhase: "deployment",
    turn: { role: "gm" },
    actedPlayerIds: [],
    turnLog: [],
  };
}

function recordTurn(state: GameState, holder: GameState["turn"] & object): void {
  if (!holder) return;
  let roundEntry = state.turnLog.find((e) => e.round === state.round);
  if (!roundEntry) {
    roundEntry = { round: state.round, turns: [] };
    state.turnLog.push(roundEntry);
  }
  roundEntry.turns.push(holder);
}

function clearCurrentRoundTurnLog(state: GameState): void {
  state.turnLog = state.turnLog.filter((e) => e.round !== state.round);
}

function resetToRoundStart(state: GameState): void {
  state.roundPhase = state.round === 1 ? "deployment" : "startRoundEffects";
  state.turn = { role: "gm" };
  state.actedPlayerIds = [];
}

function resetToCombatStart(state: GameState): void {
  state.round = 1;
  state.roundPhase = "deployment";
  state.turn = { role: "gm" };
  state.actedPlayerIds = [];
  state.turnLog = [];
}

export function remainingPlayerIds(state: GameState): string[] {
  return state.players
    .filter((p) => !state.actedPlayerIds.includes(p.id))
    .map((p) => p.id);
}

export function canPlayerMove(state: GameState, playerId: string): boolean {
  if (state.roundPhase === "deployment") {
    return state.round === 1 && state.players.some((p) => p.id === playerId);
  }
  return (
    state.roundPhase === "playerTurn" &&
    state.turn?.role === "player" &&
    state.turn.playerId === playerId
  );
}

export function canGmMoveEnemies(state: GameState): boolean {
  return state.roundPhase === "gmTurn" && state.turn?.role === "gm";
}

export function enterPlayersChoice(state: GameState): string {
  const remaining = remainingPlayerIds(state);
  if (remaining.length === 0) {
    state.roundPhase = "gmTurn";
    state.turn = { role: "gm" };
    return "No players left to act — GM turn";
  }
  if (remaining.length === 1) {
    const playerId = remaining[0]!;
    state.roundPhase = "playerTurn";
    state.turn = { role: "player", playerId };
    recordTurn(state, { role: "player", playerId });
    const player = state.players.find((p) => p.id === playerId);
    return `${playerLabel(player!)} took their turn`;
  }
  state.roundPhase = "playersChoice";
  state.turn = null;
  return "Advanced to players' choice";
}

export type PhaseActionContext = {
  role: GaemRole;
  playerId: string | null;
};

export function validatePhaseAction(
  state: GameState,
  action: PhaseAction,
  ctx: PhaseActionContext
): string | null {
  switch (action) {
    case "doEffects":
      if (ctx.role !== "gm") return "Only the game master can do that";
      if (state.roundPhase !== "startRoundEffects") return "Wrong phase";
      return null;
    case "takeTurn":
      if (ctx.role !== "player" || !ctx.playerId) return "Only players can take a turn";
      if (state.roundPhase !== "playersChoice") return "Wrong phase";
      if (state.actedPlayerIds.includes(ctx.playerId)) return "Already acted this round";
      if (!state.players.some((p) => p.id === ctx.playerId)) return "Unknown player";
      return null;
    case "endPlayerTurn":
      if (ctx.role !== "player" || !ctx.playerId) return "Only players can end their turn";
      if (state.roundPhase !== "playerTurn") return "Wrong phase";
      if (state.turn?.role !== "player" || state.turn.playerId !== ctx.playerId) {
        return "Not your turn";
      }
      return null;
    case "endGmTurn":
      if (ctx.role !== "gm") return "Only the game master can do that";
      if (state.roundPhase !== "gmTurn") return "Wrong phase";
      if (remainingPlayerIds(state).length === 0) return "All players have acted";
      return null;
    case "countdownTags":
      if (ctx.role !== "gm") return "Only the game master can do that";
      if (state.roundPhase !== "gmTurn") return "Wrong phase";
      if (remainingPlayerIds(state).length > 0) return "Players still need to act";
      return null;
    case "endRound":
      if (ctx.role !== "gm") return "Only the game master can do that";
      if (state.roundPhase !== "countdownTags") return "Wrong phase";
      return null;
    case "resetRound":
    case "gmEndRound":
    case "gmEndTurn":
    case "resetCombat":
      if (ctx.role !== "gm") return "Only the game master can do that";
      return null;
    case "endDeployment":
      if (ctx.role !== "gm") return "Only the game master can do that";
      if (state.roundPhase !== "deployment") return "Wrong phase";
      if (state.round !== 1) return "Deployment only happens at the start of round 1";
      return null;
  }
}

export function applyPhaseAction(
  state: GameState,
  action: PhaseAction,
  ctx: PhaseActionContext
): string {
  switch (action) {
    case "doEffects": {
      recordTurn(state, { role: "gm", gmPhase: "startRoundEffects" });
      const msg = enterPlayersChoice(state);
      return `Round ${state.round} — start-of-round effects resolved. ${msg}`;
    }
    case "takeTurn": {
      const playerId = ctx.playerId!;
      state.roundPhase = "playerTurn";
      state.turn = { role: "player", playerId };
      recordTurn(state, { role: "player", playerId });
      const player = state.players.find((p) => p.id === playerId);
      return `${playerLabel(player!)} took their turn`;
    }
    case "endPlayerTurn": {
      const playerId = ctx.playerId!;
      if (!state.actedPlayerIds.includes(playerId)) {
        state.actedPlayerIds.push(playerId);
      }
      state.roundPhase = "gmTurn";
      state.turn = { role: "gm" };
      const player = state.players.find((p) => p.id === playerId);
      return `${playerLabel(player!)} ended their turn`;
    }
    case "endGmTurn": {
      recordTurn(state, { role: "gm" });
      const msg = enterPlayersChoice(state);
      return `GM ended turn — ${msg}`;
    }
    case "countdownTags": {
      recordTurn(state, { role: "gm", gmPhase: "countdownTags" });
      state.roundPhase = "countdownTags";
      state.turn = { role: "gm" };
      return "GM started tag countdown";
    }
    case "endRound": {
      const endedRound = state.round;
      state.round += 1;
      resetToRoundStart(state);
      return `Round ${endedRound} ended — starting round ${state.round}`;
    }
    case "resetRound": {
      clearCurrentRoundTurnLog(state);
      resetToRoundStart(state);
      return `Round ${state.round} reset`;
    }
    case "gmEndRound": {
      const endedRound = state.round;
      state.round += 1;
      resetToRoundStart(state);
      return `Round ${endedRound} ended — starting round ${state.round}`;
    }
    case "gmEndTurn": {
      switch (state.roundPhase) {
        case "deployment":
          return "Deployment in progress";
        case "startRoundEffects": {
          recordTurn(state, { role: "gm", gmPhase: "startRoundEffects" });
          const msg = enterPlayersChoice(state);
          return `GM ended turn — ${msg}`;
        }
        case "playersChoice": {
          state.roundPhase = "gmTurn";
          state.turn = { role: "gm" };
          recordTurn(state, { role: "gm" });
          return "GM ended turn — GM turn";
        }
        case "playerTurn": {
          if (state.turn?.role !== "player") return "No player turn in progress";
          const playerId = state.turn.playerId;
          if (!state.actedPlayerIds.includes(playerId)) {
            state.actedPlayerIds.push(playerId);
          }
          state.roundPhase = "gmTurn";
          state.turn = { role: "gm" };
          const player = state.players.find((p) => p.id === playerId);
          return `${playerLabel(player!)} turn ended (GM)`;
        }
        case "gmTurn": {
          if (remainingPlayerIds(state).length > 0) {
            recordTurn(state, { role: "gm" });
            const msg = enterPlayersChoice(state);
            return `GM ended turn — ${msg}`;
          }
          recordTurn(state, { role: "gm", gmPhase: "countdownTags" });
          state.roundPhase = "countdownTags";
          state.turn = { role: "gm" };
          return "GM ended turn — countdown tags";
        }
        case "countdownTags":
          return "Countdown tags in progress";
      }
    }
    case "endDeployment": {
      state.roundPhase = "startRoundEffects";
      state.turn = { role: "gm" };
      return "Deployment ended — start round effects";
    }
    case "resetCombat": {
      resetToCombatStart(state);
      return "Combat reset — deployment";
    }
  }
}

export function turnHolderLabel(state: GameState): string {
  const turn = state.turn;
  if (!turn) return "—";
  return formatTurnHolder(state, turn);
}

export function formatTurnHolder(state: GameState, holder: TurnHolder): string {
  if (holder.role === "gm") {
    if (holder.gmPhase) return roundPhaseLabel(holder.gmPhase);
    return "GM";
  }
  const player = state.players.find((p) => p.id === holder.playerId);
  return player ? playerLabel(player) : "Player";
}

export function roundPhaseLabel(phase: GameState["roundPhase"]): string {
  switch (phase) {
    case "deployment":
      return "Deployment";
    case "startRoundEffects":
      return "Start round effects";
    case "playersChoice":
      return "Players' choice";
    case "playerTurn":
      return "Player turn";
    case "gmTurn":
      return "GM turn";
    case "countdownTags":
      return "Countdown tags";
  }
}

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

  if (!canPlayerMove(state, playerId)) return "Not your turn";

  if (toX < 0 || toY < 0 || toX >= state.width || toY >= state.height) {
    return "Out of bounds";
  }
  if (!isWalkable(tileAt(state.tiles, toX, toY))) return "Blocked";

  if (state.roundPhase !== "deployment") {
    const dx = Math.abs(toX - player.x);
    const dy = Math.abs(toY - player.y);
    if (dx + dy !== 1) return "Must move to an adjacent tile";
  }

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

  if (!canGmMoveEnemies(state)) return "Not GM turn";

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
    state.actedPlayerIds.push(newId);
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
  if (!state.mapName) {
    state.mapName = state.mapId;
  }
  if (!state.enemies) {
    state.enemies = [];
  }
  if (state.round === undefined) {
    state.round = 1;
  }
  if (!state.roundPhase) {
    state.roundPhase = state.round === 1 ? "deployment" : "startRoundEffects";
  }
  if (state.turn === undefined) {
    state.turn = { role: "gm" };
  }
  if (!state.actedPlayerIds) {
    state.actedPlayerIds = [];
  }
  if (!state.turnLog) {
    state.turnLog = [];
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
