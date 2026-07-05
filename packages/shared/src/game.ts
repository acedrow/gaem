import type { Enemy, GameMap, GameState, GaemRole, PhaseAction, Player, TerrainObject, TurnHolder } from "./types.js";
import { playerLabel } from "./console.js";
import { createDefaultActionBudget, createDefaultCombatState } from "./combat/types.js";
import { initSabaothCharges } from "./combat/attack.js";
import { tickRoundCountdowns, tickUnitEndOfTurn } from "./combat/effects.js";
import { resetEnemyExhaustion } from "./combat/enemy.js";
import { getEnemyMaxHpByName, getEnemyScale, getEnemyScaleByName, enemyFootprintTiles, ensureEnemyMovement, refreshEnemyMovement, spendEnemyMovement } from "./enemy-data.js";
import { applyLoadoutToPlayer, getClassMaxHp, getArmorSpeed } from "./player-data.js";
import { coordKey, isFootprintInBounds, isInBounds, isWalkable, tileAt } from "./map.js";
import { isOrthogonallyAdjacent } from "./patterns.js";
import { kataptyNeedsTargetPick, resolveYadathanEndOfTurn } from "./combat/yadathan.js";
import {
  reconcileSwarmHp,
  swarmGroupForEnemy,
  validateSwarmMove,
  applySwarmMove,
  getEffectiveEnemyMaxHp,
} from "./combat/swarm.js";

export type BoardOccupancy = {
  playerByKey: Map<string, Player>;
  enemyByKey: Map<string, Enemy>;
  enemyAnchorByKey: Map<string, Enemy>;
  terrainObjectsByKey: Map<string, TerrainObject[]>;
};

export function buildBoardOccupancy(state: GameState): BoardOccupancy {
  const playerByKey = new Map<string, Player>();
  for (const player of state.players) {
    playerByKey.set(coordKey(player.x, player.y), player);
  }

  const enemyByKey = new Map<string, Enemy>();
  const enemyAnchorByKey = new Map<string, Enemy>();
  for (const enemy of state.enemies) {
    enemyAnchorByKey.set(coordKey(enemy.x, enemy.y), enemy);
    const scale = getEnemyScale(enemy);
    for (const tile of enemyFootprintTiles(enemy.x, enemy.y, scale)) {
      enemyByKey.set(coordKey(tile.x, tile.y), enemy);
    }
  }

  const terrainObjectsByKey = new Map<string, TerrainObject[]>();
  for (const object of state.terrainObjects ?? []) {
    const key = coordKey(object.x, object.y);
    const list = terrainObjectsByKey.get(key);
    if (list) list.push(object);
    else terrainObjectsByKey.set(key, [object]);
  }

  return { playerByKey, enemyByKey, enemyAnchorByKey, terrainObjectsByKey };
}

export function isTileOccupied(
  state: GameState,
  x: number,
  y: number,
  occupancy?: BoardOccupancy,
): boolean {
  const occ = occupancy ?? buildBoardOccupancy(state);
  const key = coordKey(x, y);
  return occ.playerByKey.has(key) || occ.enemyByKey.has(key);
}

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

function lastRoundTurn(state: GameState): TurnHolder | null {
  const turns = state.turnLog.find((e) => e.round === state.round)?.turns;
  if (!turns?.length) return null;
  return turns[turns.length - 1]!;
}

function popLastRoundTurn(state: GameState): TurnHolder | null {
  const entry = state.turnLog.find((e) => e.round === state.round);
  if (!entry?.turns.length) return null;
  return entry.turns.pop() ?? null;
}

function resetPlayerTurnActions(state: GameState, playerId: string): void {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return;
  const speed = player.speed ?? getArmorSpeed(player.armor);
  if (speed) player.actionBudget = createDefaultActionBudget(speed);
  player.turnStartX = player.x;
  player.turnStartY = player.y;
  if (state.combat) {
    state.combat.pendingActions = state.combat.pendingActions.filter(
      (p) => p.actorPlayerId !== playerId,
    );
    if (state.combat.pendingReaction?.playerId === playerId) {
      state.combat.pendingReaction = null;
    }
  }
}

function rewindToPlayerTurn(state: GameState, playerId: string): string {
  const idx = state.actedPlayerIds.lastIndexOf(playerId);
  if (idx >= 0) state.actedPlayerIds.splice(idx, 1);
  state.roundPhase = "playerTurn";
  state.turn = { role: "player", playerId };
  resetPlayerTurnActions(state, playerId);
  const player = state.players.find((p) => p.id === playerId);
  return `Stepped back to ${playerLabel(player!)}'s turn — actions reset`;
}

export function canRewindPhase(state: GameState): boolean {
  if (state.round === 1 && state.roundPhase === "deployment") return false;
  if (state.round > 1 && state.roundPhase === "startRoundEffects") return false;
  return true;
}

export function canResetPhase(state: GameState): boolean {
  return state.roundPhase === "playerTurn" && state.turn?.role === "player";
}

function resetToRoundStart(state: GameState): void {
  state.roundPhase = state.round === 1 ? "deployment" : "startRoundEffects";
  state.turn = { role: "gm" };
  state.actedPlayerIds = [];
}

function resetToCombatStart(state: GameState): void {
  state.round = 1;
  resetToRoundStart(state);
  state.turnLog = [];
}

export function remainingPlayerIds(state: GameState): string[] {
  const acted = new Set(state.actedPlayerIds);
  return state.players
    .filter((p) => !acted.has(p.id) && !isPlayerDowned(p))
    .map((p) => p.id);
}

export function isPlayerDowned(player: Player): boolean {
  return (player.hp ?? 0) <= 0;
}

export function canPlayerMove(state: GameState, playerId: string): boolean {
  const player = state.players.find((p) => p.id === playerId);
  if (player && isPlayerDowned(player)) return false;
  if (state.enforceTurns === false) {
    return state.players.some((p) => p.id === playerId);
  }
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
  if (state.enforceTurns === false) return true;
  return state.roundPhase === "gmTurn" && state.turn?.role === "gm";
}

export function areActionLimitsEnforced(state: GameState): boolean {
  return state.enforceActionLimits !== false;
}

function beginPlayerTurn(state: GameState, playerId: string): string {
  state.roundPhase = "playerTurn";
  state.turn = { role: "player", playerId };
  recordTurn(state, { role: "player", playerId });
  const player = state.players.find((p) => p.id === playerId);
  if (player) {
    const speed = player.speed ?? getArmorSpeed(player.armor);
    player.actionBudget = createDefaultActionBudget(speed);
    player.turnStartX = player.x;
    player.turnStartY = player.y;
    delete player.hasteActionTier;
    if (player.counters?.kataptyResolved != null) {
      delete player.counters.kataptyResolved;
      if (Object.keys(player.counters).length === 0) delete player.counters;
    }
  }
  return `${playerLabel(player!)} took their turn`;
}

function tickWarhookBlazingImmunity(player: Player): void {
  const remaining = player.counters?.warhookBlazingImmuneTurns;
  if (remaining === undefined) return;
  const next = remaining - 1;
  if (!player.counters) return;
  if (next <= 0) delete player.counters.warhookBlazingImmuneTurns;
  else player.counters.warhookBlazingImmuneTurns = next;
  if (Object.keys(player.counters).length === 0) delete player.counters;
}

function finishPlayerTurn(state: GameState, playerId: string, suffix = "ended their turn"): string {
  if (!state.actedPlayerIds.includes(playerId)) {
    state.actedPlayerIds.push(playerId);
  }
  const player = state.players.find((p) => p.id === playerId);
  const ticks = player ? tickUnitEndOfTurn(player) : [];
  if (player) {
    delete player.hasteActionTier;
    tickWarhookBlazingImmunity(player);
  }
  const yadathanMsgs = player ? resolveYadathanEndOfTurn(state, player) : [];
  state.roundPhase = "gmTurn";
  state.turn = { role: "gm" };
  let msg = `${playerLabel(player!)} ${suffix}`;
  if (ticks.length) msg += `. ${ticks.join("; ")}`;
  if (yadathanMsgs.length) msg += `. ${yadathanMsgs.join("; ")}`;
  return msg;
}

function advanceRound(state: GameState): string {
  const endedRound = state.round;
  tickRoundCountdowns(state);
  resetEnemyExhaustion(state);
  if (state.combat) {
    state.combat.pendingReaction = null;
    state.combat.activeEnemyId = null;
  }
  state.round += 1;
  resetToRoundStart(state);
  return `Round ${endedRound} ended — starting round ${state.round}`;
}

export function enterPlayersChoice(state: GameState): string {
  const remaining = remainingPlayerIds(state);
  if (remaining.length === 0) {
    state.roundPhase = "gmTurn";
    state.turn = { role: "gm" };
    return "No players left to act — GM turn";
  }
  if (remaining.length === 1) {
    return beginPlayerTurn(state, remaining[0]!);
  }
  state.roundPhase = "playersChoice";
  state.turn = null;
  return "Advanced to players' choice";
}

export function finishGmTurnIfPlayersRemain(state: GameState): string | null {
  if (state.enforceTurns === false) return null;
  if (state.roundPhase !== "gmTurn" || state.turn?.role !== "gm") return null;
  if (remainingPlayerIds(state).length === 0) return null;
  recordTurn(state, { role: "gm" });
  return enterPlayersChoice(state);
}

export type PhaseActionContext = {
  role: GaemRole;
  playerId: string | null;
};

export function validatePhaseAction(
  state: GameState,
  action: PhaseAction,
  ctx: PhaseActionContext,
): string | null {
  switch (action) {
    case "doEffects":
      if (ctx.role !== "gm") return "Only the game master can do that";
      if (state.roundPhase !== "startRoundEffects") return "Wrong phase";
      return null;
    case "takeTurn": {
      if (ctx.role !== "player" || !ctx.playerId) return "Only players can take a turn";
      if (state.roundPhase !== "playersChoice") return "Wrong phase";
      if (state.actedPlayerIds.includes(ctx.playerId)) return "Already acted this round";
      const player = state.players.find((p) => p.id === ctx.playerId);
      if (!player) return "Unknown player";
      if (isPlayerDowned(player)) return "You are down";
      return null;
    }
    case "endPlayerTurn":
      if (ctx.role !== "player" || !ctx.playerId) return "Only players can end their turn";
      if (state.roundPhase !== "playerTurn") return "Wrong phase";
      if (state.turn?.role !== "player" || state.turn.playerId !== ctx.playerId) {
        return "Not your turn";
      }
      if (kataptyNeedsTargetPick(state, ctx.playerId)) {
        const player = state.players.find((p) => p.id === ctx.playerId);
        if (!player?.counters?.kataptyResolved) {
          return "Select Katapty targets before ending turn";
        }
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
    case "rewindPhase":
      if (ctx.role !== "gm") return "Only the game master can do that";
      if (!canRewindPhase(state)) return "Already at the first phase of the round";
      return null;
    case "resetPhase":
      if (ctx.role !== "gm") return "Only the game master can do that";
      if (!canResetPhase(state)) return "No player turn in progress";
      return null;
  }
}

export function applyPhaseAction(
  state: GameState,
  action: PhaseAction,
  ctx: PhaseActionContext,
): string {
  switch (action) {
    case "doEffects": {
      recordTurn(state, { role: "gm", gmPhase: "startRoundEffects" });
      const msg = enterPlayersChoice(state);
      return `Round ${state.round} — start-of-round effects resolved. ${msg}`;
    }
    case "takeTurn":
      return beginPlayerTurn(state, ctx.playerId!);
    case "endPlayerTurn":
      return finishPlayerTurn(state, ctx.playerId!);
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
    case "endRound":
    case "gmEndRound":
      return advanceRound(state);
    case "resetRound": {
      clearCurrentRoundTurnLog(state);
      resetToRoundStart(state);
      return `Round ${state.round} reset`;
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
          return finishPlayerTurn(state, state.turn.playerId, "turn ended (GM)");
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
      if (!state.combat) {
        state.combat = createDefaultCombatState(state.players.length);
      }
      for (const player of state.players) {
        if (player.speed == null) player.speed = getArmorSpeed(player.armor);
        if (player.equipmentUses === undefined) player.equipmentUses = 1;
        initSabaothCharges(player);
      }
      return "Deployment ended — start round effects";
    }
    case "resetCombat": {
      resetToCombatStart(state);
      return "Combat reset — deployment";
    }
    case "rewindPhase": {
      switch (state.roundPhase) {
        case "countdownTags": {
          popLastRoundTurn(state);
          state.roundPhase = "gmTurn";
          state.turn = { role: "gm" };
          return "Stepped back to GM turn";
        }
        case "gmTurn": {
          if (remainingPlayerIds(state).length === 0) {
            const lastActed = state.actedPlayerIds[state.actedPlayerIds.length - 1];
            if (!lastActed) return "Nothing to rewind";
            return rewindToPlayerTurn(state, lastActed);
          }
          const last = lastRoundTurn(state);
          if (last?.role === "player" && state.actedPlayerIds.includes(last.playerId)) {
            return rewindToPlayerTurn(state, last.playerId);
          }
          if (last?.role === "gm" && !last.gmPhase) {
            popLastRoundTurn(state);
            state.roundPhase = "playersChoice";
            state.turn = null;
            return "Stepped back to players' choice";
          }
          return "Cannot step back from here";
        }
        case "playerTurn": {
          if (state.turn?.role !== "player") return "No player turn in progress";
          const playerId = state.turn.playerId;
          popLastRoundTurn(state);
          resetPlayerTurnActions(state, playerId);
          const prev = lastRoundTurn(state);
          if (prev?.role === "gm" && prev.gmPhase === "startRoundEffects") {
            state.roundPhase = "startRoundEffects";
            state.turn = { role: "gm" };
            return "Stepped back to start round effects — actions reset";
          }
          if (prev?.role === "gm") {
            state.roundPhase = "gmTurn";
            state.turn = { role: "gm" };
            return "Stepped back to GM turn — actions reset";
          }
          state.roundPhase = "playersChoice";
          state.turn = null;
          return "Stepped back to players' choice — actions reset";
        }
        case "playersChoice": {
          const last = lastRoundTurn(state);
          if (last?.role === "gm" && last.gmPhase === "startRoundEffects") {
            state.roundPhase = "startRoundEffects";
            state.turn = { role: "gm" };
            return "Stepped back to start round effects";
          }
          if (last?.role === "gm" && !last.gmPhase) {
            popLastRoundTurn(state);
            state.roundPhase = "gmTurn";
            state.turn = { role: "gm" };
            return "Stepped back to GM turn";
          }
          return "Cannot step back from here";
        }
        case "startRoundEffects": {
          state.roundPhase = "deployment";
          state.turn = { role: "gm" };
          return "Stepped back to deployment";
        }
        case "deployment":
          return "Already at the first phase of the round";
      }
    }
    case "resetPhase": {
      const playerId = state.turn?.role === "player" ? state.turn.playerId : null;
      if (!playerId) return "No player turn in progress";
      resetPlayerTurnActions(state, playerId);
      const player = state.players.find((p) => p.id === playerId);
      return `Reset ${playerLabel(player!)}'s actions`;
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

export function normalizeHp(hp: number | undefined, maxHp: number): number {
  return clampHp(hp ?? maxHp, maxHp);
}

export function getPlayerMaxHp(player: Player): number {
  return getClassMaxHp(player.class);
}

export function getEnemyMaxHp(enemy: Enemy): number {
  return getEnemyMaxHpByName(enemy.name);
}

export { getEffectiveEnemyMaxHp };

function normalizeEnemies(enemies: Enemy[]): void {
  for (const enemy of enemies) {
    if (enemy.scale == null) {
      enemy.scale = getEnemyScaleByName(enemy.name);
    }
    enemy.hp = normalizeHp(enemy.hp, getEnemyMaxHp(enemy));
  }
}

function normalizePlayers(players: Player[]): void {
  for (const player of players) {
    player.hp = normalizeHp(player.hp, getPlayerMaxHp(player));
  }
}

function isOccupiedByPlayer(state: GameState, x: number, y: number, occupancy?: BoardOccupancy): boolean {
  const occ = occupancy ?? buildBoardOccupancy(state);
  return occ.playerByKey.has(coordKey(x, y));
}

function isOccupiedByEnemy(state: GameState, x: number, y: number, occupancy?: BoardOccupancy): boolean {
  const occ = occupancy ?? buildBoardOccupancy(state);
  return occ.enemyByKey.has(coordKey(x, y));
}

export function validateEnemyFootprint(
  state: GameState,
  x: number,
  y: number,
  scale: number,
  excludeEnemyId?: string,
  occupancy?: BoardOccupancy,
): string | null {
  if (scale < 1) return "Invalid scale";
  if (!isFootprintInBounds(x, y, scale, state.width, state.height)) {
    return "Out of bounds";
  }
  const occ = occupancy ?? buildBoardOccupancy(state);
  for (const tile of enemyFootprintTiles(x, y, scale)) {
    if (!isWalkable(tileAt(state.tiles, tile.x, tile.y))) return "Blocked";
    const key = coordKey(tile.x, tile.y);
    if (occ.playerByKey.has(key)) return "Tile occupied";
    const enemy = occ.enemyByKey.get(key);
    if (enemy && enemy.id !== excludeEnemyId) return "Tile occupied";
  }
  return null;
}

function isOccupied(state: GameState, x: number, y: number, occupancy?: BoardOccupancy): boolean {
  return isOccupiedByPlayer(state, x, y, occupancy) || isOccupiedByEnemy(state, x, y, occupancy);
}

export function findSpawn(state: GameState): { x: number; y: number } | null {
  const occupancy = buildBoardOccupancy(state);
  for (let y = 1; y < state.height - 1; y++) {
    for (let x = 1; x < state.width - 1; x++) {
      const tile = tileAt(state.tiles, x, y);
      if (!isWalkable(tile)) continue;
      if (isOccupied(state, x, y, occupancy)) continue;
      return { x, y };
    }
  }
  return null;
}

export function validateMove(
  state: GameState,
  playerId: string,
  toX: number,
  toY: number,
): string | null {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return "Unknown player";

  if (!canPlayerMove(state, playerId)) return "Not your turn";

  if (!isInBounds(toX, toY, state.width, state.height)) {
    return "Out of bounds";
  }
  if (!isWalkable(tileAt(state.tiles, toX, toY))) return "Blocked";

  if (state.roundPhase !== "deployment") {
    if (!isOrthogonallyAdjacent({ x: player.x, y: player.y }, { x: toX, y: toY })) {
      return "Must move to an adjacent tile";
    }
  }

  if (isTileOccupied(state, toX, toY)) return "Tile occupied";

  return null;
}

export function applyMove(
  state: GameState,
  playerId: string,
  toX: number,
  toY: number,
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
  toY: number,
): string | null {
  const enemy = state.enemies.find((e) => e.id === enemyId);
  if (!enemy) return "Unknown enemy";

  if (swarmGroupForEnemy(state, enemyId)) {
    return validateSwarmMove(state, enemyId, toX, toY);
  }

  if (!canGmMoveEnemies(state)) return "Not GM turn";
  if (enemy.exhausted) return "Enemy has ended turn";

  if (!isOrthogonallyAdjacent({ x: enemy.x, y: enemy.y }, { x: toX, y: toY })) {
    return "Must move to an adjacent tile";
  }

  if (state.enforceTurns !== false) {
    ensureEnemyMovement(enemy);
    if ((enemy.movementRemaining ?? 0) < 1) return "Not enough movement";
  }

  return validateEnemyFootprint(state, toX, toY, getEnemyScale(enemy), enemyId);
}

export function applyEnemyMove(
  state: GameState,
  enemyId: string,
  toX: number,
  toY: number,
): void {
  if (swarmGroupForEnemy(state, enemyId)) {
    applySwarmMove(state, enemyId, toX, toY);
    return;
  }
  const enemy = state.enemies.find((e) => e.id === enemyId);
  if (!enemy) return;
  if (state.enforceTurns !== false) spendEnemyMovement(enemy, 1);
  enemy.x = toX;
  enemy.y = toY;
  reconcileSwarmHp(state);
}

export function validateAddEnemy(
  state: GameState,
  x: number,
  y: number,
  scale = 1,
): string | null {
  return validateEnemyFootprint(state, x, y, scale);
}

export function addEnemy(state: GameState, enemy: Enemy): string | null {
  const scale = getEnemyScale(enemy);
  const err = validateEnemyFootprint(state, enemy.x, enemy.y, scale);
  if (err) return err;
  const maxHp = getEnemyMaxHp(enemy);
  state.enemies.push({
    ...enemy,
    scale,
    hp: normalizeHp(enemy.hp, maxHp),
  });
  refreshEnemyMovement(state.enemies[state.enemies.length - 1]!);
  reconcileSwarmHp(state);
  return null;
}

export function removeEnemy(state: GameState, enemyId: string): boolean {
  const before = state.enemies.length;
  state.enemies = state.enemies.filter((e) => e.id !== enemyId);
  if (state.enemies.length < before) {
    reconcileSwarmHp(state);
    return true;
  }
  return false;
}

export function addPlayer(
  state: GameState,
  player: Player,
  opts?: { className?: string; armor?: string; weapon?: string },
): boolean {
  const spawn = findSpawn(state);
  if (!spawn) return false;
  const className = opts?.className ?? player.class;
  const armor = opts?.armor ?? player.armor;
  const weapon = opts?.weapon ?? player.weapon;
  const maxHp = getClassMaxHp(className);
  const entry: Player = {
    ...player,
    x: spawn.x,
    y: spawn.y,
    ...(className !== undefined ? { class: className } : {}),
    ...(armor !== undefined ? { armor } : {}),
    ...(weapon !== undefined ? { weapon } : {}),
    hp: normalizeHp(player.hp, maxHp),
  };
  if (className && armor && weapon) {
    applyLoadoutToPlayer(entry, { className, armor, weapon });
  } else if (armor) {
    entry.speed = getArmorSpeed(armor);
  }
  state.players.push(entry);
  return true;
}

export function removePlayer(state: GameState, playerId: string): void {
  state.players = state.players.filter((p) => p.id !== playerId);
}

function playerMatchesProfile(
  player: Player,
  playerKey: string,
  nickname?: string,
): boolean {
  if (player.playerKey === playerKey) return true;
  return nickname !== undefined && !player.playerKey && player.nickname === nickname;
}

export function setPlayerHp(
  state: GameState,
  playerId: string,
  hp: number,
): string | null {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return "Unknown player";
  player.hp = clampHp(hp, getPlayerMaxHp(player));
  return null;
}

export function syncPlayerSheet(
  state: GameState,
  characterSheetId: string,
  className: string,
  armor?: string,
  weapon?: string,
  equipment?: string,
  gear?: string,
  weapon2?: string,
  yadathanTower?: string,
): string | null {
  const player = state.players.find((p) => p.characterSheetId === characterSheetId);
  if (!player) return "Player not on board";
  applyLoadoutToPlayer(player, {
    className,
    armor: armor ?? player.armor ?? "",
    weapon: weapon ?? player.weapon ?? "",
    equipment: equipment ?? player.equipment,
    gear: gear ?? player.gear,
    weapon2: weapon2 ?? player.weapon2,
    yadathanTower,
  });
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
    armor?: string;
    weapon?: string;
    equipment?: string;
    gear?: string;
    weapon2?: string;
    yadathanTower?: string;
  },
): { playerId: string } | { error: "board_full" } {
  const {
    playerKey,
    nickname,
    preferredId,
    newId,
    className,
    characterSheetId,
    armor,
    weapon,
    equipment,
    gear,
    weapon2,
    yadathanTower,
  } = opts;
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
        class: className,
        armor,
        weapon,
        equipment,
        gear,
        weapon2,
        hp: getClassMaxHp(className),
      },
      { className, armor, weapon },
    );
    if (!joined) return { error: "board_full" };
    const entry = state.players.find((p) => p.id === newId);
    if (entry && className && armor && weapon) {
      applyLoadoutToPlayer(entry, { className, armor, weapon, equipment, gear, weapon2, yadathanTower });
    }
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
    if (
      className !== undefined ||
      armor !== undefined ||
      weapon !== undefined ||
      equipment !== undefined ||
      gear !== undefined ||
      weapon2 !== undefined
    ) {
      applyLoadoutToPlayer(player, {
        className: className ?? player.class ?? "",
        armor: armor ?? player.armor ?? "",
        weapon: weapon ?? player.weapon ?? "",
        equipment: equipment ?? player.equipment,
        gear: gear ?? player.gear,
        weapon2: weapon2 ?? player.weapon2,
        yadathanTower,
      });
    }
  }

  return { playerId };
}

export function normalizeGameState(state: GameState, map?: GameMap): GameState {
  if (map) {
    state.mapId = map.id;
    state.mapName = map.name ?? map.id;
  } else if (!state.mapName) {
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
  if (state.enforceTurns === undefined) {
    state.enforceTurns = true;
  }
  if (state.enforceActionLimits === undefined) {
    state.enforceActionLimits = true;
  }
  if (!state.partyResources) {
    state.partyResources = { hellsteel: 0, soulfire: 0, brimstone: 0 };
  }
  if (!state.constructedBaseUpgrades) {
    state.constructedBaseUpgrades = [];
  }
  if (!state.combat && state.roundPhase !== "deployment") {
    state.combat = createDefaultCombatState(state.players.length);
  }
  const playerTurn = state.turn?.role === "player" ? state.turn : null;
  if (state.roundPhase === "playerTurn" && playerTurn) {
    const activePlayer = state.players.find((p) => p.id === playerTurn.playerId);
    if (activePlayer && !activePlayer.actionBudget) {
      const speed = activePlayer.speed ?? getArmorSpeed(activePlayer.armor);
      if (speed) activePlayer.actionBudget = createDefaultActionBudget(speed);
    }
  }
  for (const tile of state.tiles) {
    if (tile.walkable === undefined) {
      tile.walkable = !tile.terrain.some((t) =>
        t === "impassable" || t === "obstacle" || t === "void",
      );
    }
  }
  normalizePlayers(state.players);
  normalizeEnemies(state.enemies);
  return state;
}
