import type { GameState, Player } from "../types.js";
import type { BoardCoord } from "../patterns.js";
import { isOrthogonallyAdjacent } from "../patterns.js";
import { areActionLimitsEnforced, buildBoardOccupancy, canPlayerMove, type BoardOccupancy } from "../game.js";
import { playerLabel } from "../console.js";
import { coordKey, isInBounds, isWalkable, tileAt } from "../map.js";
import { getArmorSpeed } from "../player-data.js";
import { movementCostMultiplier } from "./effects.js";
import { canUseActionTier, spendActionTierOrHaste, spendMovement } from "./actions.js";
import { createDefaultActionBudget, type ActionBudget } from "./types.js";

export type MovementStep = { x: number; y: number; cost: number };

function terrainMoveCost(
  state: GameState,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): number {
  const fromTile = tileAt(state.tiles, fromX, fromY);
  const toTile = tileAt(state.tiles, toX, toY);
  if (!fromTile || !toTile) return 1;
  let cost = 1;
  if (toTile.terrain.includes("uneasy")) cost += 1;
  if (toTile.elevation > fromTile.elevation) cost += toTile.elevation - fromTile.elevation;
  return cost;
}

export function computePathCost(
  state: GameState,
  player: Player,
  path: BoardCoord[],
): { total: number; steps: MovementStep[] } | null {
  if (path.length === 0) return { total: 0, steps: [] };
  let cx = player.x;
  let cy = player.y;
  const mult = movementCostMultiplier(player.effects);
  const steps: MovementStep[] = [];
  let total = 0;
  for (const step of path) {
    if (!isOrthogonallyAdjacent({ x: cx, y: cy }, step)) return null;
    const base = terrainMoveCost(state, cx, cy, step.x, step.y);
    const cost = base * mult;
    total += cost;
    steps.push({ x: step.x, y: step.y, cost });
    cx = step.x;
    cy = step.y;
  }
  return { total, steps };
}

export function maxSprintCost(player: Player): number {
  const speed = player.speed ?? getArmorSpeed(player.armor);
  return Math.floor(speed / 2);
}

export function movementStepCost(
  state: GameState,
  player: Player,
  toX: number,
  toY: number,
): number {
  return terrainMoveCost(state, player.x, player.y, toX, toY) * movementCostMultiplier(player.effects);
}

export function clearSprintBudget(budget: ActionBudget | undefined): void {
  if (!budget) return;
  budget.sprintRemaining = 0;
  budget.sprintMax = 0;
}

export function findPlayerMovementPath(
  state: GameState,
  playerId: string,
  dest: BoardCoord,
): BoardCoord[] | null {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return null;
  if (player.x === dest.x && player.y === dest.y) return [];

  const occupancy = buildBoardOccupancy(state);
  const queue: { x: number; y: number; path: BoardCoord[] }[] = [
    { x: player.x, y: player.y, path: [] },
  ];
  const visited = new Set<string>([coordKey(player.x, player.y)]);

  while (queue.length > 0) {
    const { x, y, path } = queue.shift()!;
    for (const [dx, dy] of [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ]) {
      const nx = x + dx;
      const ny = y + dy;
      const key = coordKey(nx, ny);
      if (visited.has(key)) continue;
      if (!isInBounds(nx, ny, state.width, state.height)) continue;
      if (!isWalkable(tileAt(state.tiles, nx, ny))) continue;
      if (occupancy.playerByKey.has(key)) continue;
      if (occupancy.enemyByKey.has(key)) continue;
      visited.add(key);
      const nextPath = [...path, { x: nx, y: ny }];
      if (nx === dest.x && ny === dest.y) return nextPath;
      queue.push({ x: nx, y: ny, path: nextPath });
    }
  }
  return null;
}

export function normalizeMovementPath(
  state: GameState,
  playerId: string,
  path: BoardCoord[],
): BoardCoord[] | null {
  if (!path.length || areActionLimitsEnforced(state)) return path;
  if (path.length > 1) return path;
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return null;
  const dest = path[0]!;
  if (isOrthogonallyAdjacent({ x: player.x, y: player.y }, dest)) return path;
  return findPlayerMovementPath(state, playerId, dest);
}

export function validateMovementPath(
  state: GameState,
  playerId: string,
  path: BoardCoord[],
  opts?: { allowOccupiedDestination?: boolean; skipMovementBudget?: boolean },
): string | null {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return "Unknown player";
  if ((player.effects?.Pin ?? 0) > 0) return "Pinned — cannot move";
  if (!player.actionBudget) {
    const speed = player.speed ?? getArmorSpeed(player.armor);
    if (speed) player.actionBudget = createDefaultActionBudget(speed);
  }

  if (path.length === 0) return "Empty path";

  const resolved = normalizeMovementPath(state, playerId, path);
  if (!resolved) return "No path to destination";
  path = resolved;

  const occupancy = buildBoardOccupancy(state);
  let cx = player.x;
  let cy = player.y;

  for (let i = 0; i < path.length; i++) {
    const step = path[i]!;
    if (!isInBounds(step.x, step.y, state.width, state.height)) return "Out of bounds";
    if (!isOrthogonallyAdjacent({ x: cx, y: cy }, step)) return "Path must be adjacent steps";
    if (!isWalkable(tileAt(state.tiles, step.x, step.y))) return "Blocked";
    const key = coordKey(step.x, step.y);
    const isLast = i === path.length - 1;
    if (occupancy.playerByKey.has(key)) return "Tile occupied";
    if (occupancy.enemyByKey.has(key)) {
      if (!(isLast && opts?.allowOccupiedDestination)) return "Tile occupied";
    }
    cx = step.x;
    cy = step.y;
  }

  const computed = computePathCost(state, player, path);
  if (!computed) return "Invalid path";

  if (areActionLimitsEnforced(state) && state.enforceTurns !== false && !opts?.skipMovementBudget) {
    const budget = player.actionBudget?.movementRemaining;
    if (budget !== undefined && computed.total > budget) return "Not enough movement";
  }
  return null;
}

export function applyMovementPath(
  state: GameState,
  playerId: string,
  path: BoardCoord[],
  opts?: { spendBudget?: boolean },
): string | null {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return "Unknown player";
  const resolved = normalizeMovementPath(state, playerId, path);
  if (!resolved) return "No path to destination";
  path = resolved;
  const err = validateMovementPath(state, playerId, path);
  if (err) return err;
  const computed = computePathCost(state, player, path)!;
  if (
    areActionLimitsEnforced(state) &&
    state.enforceTurns !== false &&
    opts?.spendBudget !== false &&
    player.actionBudget
  ) {
    if (!spendMovement(player.actionBudget, computed.total)) return "Not enough movement";
  }
  const dest = path[path.length - 1]!;
  player.x = dest.x;
  player.y = dest.y;
  return null;
}

export function adjacentEnemies(
  state: GameState,
  x: number,
  y: number,
  occupancy?: BoardOccupancy,
): string[] {
  const occ = occupancy ?? buildBoardOccupancy(state);
  const ids = new Set<string>();
  for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
    const enemy = occ.enemyByKey.get(coordKey(x + dx, y + dy));
    if (enemy) ids.add(enemy.id);
  }
  return [...ids];
}

export function adjacentPlayers(
  state: GameState,
  x: number,
  y: number,
  excludeId?: string,
  occupancy?: BoardOccupancy,
): string[] {
  const occ = occupancy ?? buildBoardOccupancy(state);
  const ids: string[] = [];
  for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
    const p = occ.playerByKey.get(coordKey(x + dx, y + dy));
    if (p && p.id !== excludeId) ids.push(p.id);
  }
  return ids;
}

export function validateResetMovement(state: GameState, playerId: string): string | null {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return "Unknown player";
  if (!canPlayerMove(state, playerId)) return "Not your turn";
  if (state.roundPhase === "deployment") return "Wrong phase";
  if (player.turnStartX === undefined || player.turnStartY === undefined) return "No turn start recorded";
  if (!player.actionBudget) {
    const speed = player.speed ?? getArmorSpeed(player.armor);
    if (speed) player.actionBudget = createDefaultActionBudget(speed);
  }
  if (areActionLimitsEnforced(state) && player.actionBudget) {
    if (!player.actionBudget.main || !player.actionBudget.support || !player.actionBudget.aux) {
      return "Actions already spent";
    }
    if (state.combat?.pendingActions.some((p) => p.actorPlayerId === playerId)) {
      return "Pending actions";
    }
  }
  return null;
}

export function applyResetMovement(state: GameState, playerId: string): string {
  const player = state.players.find((p) => p.id === playerId)!;
  player.x = player.turnStartX!;
  player.y = player.turnStartY!;
  if (player.actionBudget) {
    player.actionBudget.movementRemaining = player.actionBudget.movementMax;
    clearSprintBudget(player.actionBudget);
  }
  return `${playerLabel(player)} reset movement`;
}

export function validateSprintBegin(state: GameState, playerId: string): string | null {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return "Unknown player";
  if (!canPlayerMove(state, playerId)) return "Not your turn";
  if (state.roundPhase === "deployment") return "Wrong phase";
  if ((player.effects?.Pin ?? 0) > 0) return "Pinned — cannot move";
  if (!player.actionBudget) {
    const speed = player.speed ?? getArmorSpeed(player.armor);
    if (speed) player.actionBudget = createDefaultActionBudget(speed);
  }
  if ((player.actionBudget?.sprintRemaining ?? 0) > 0) return "Already sprinting";
  if (areActionLimitsEnforced(state) && !canUseActionTier(player, "aux")) {
    return "Aux action spent";
  }
  if (maxSprintCost(player) <= 0) return "No sprint movement";
  return null;
}

export function applySprintBegin(state: GameState, playerId: string): string {
  const player = state.players.find((p) => p.id === playerId)!;
  if (areActionLimitsEnforced(state)) spendActionTierOrHaste(player, "aux");
  const max = maxSprintCost(player);
  player.actionBudget!.sprintRemaining = max;
  player.actionBudget!.sprintMax = max;
  return `${playerLabel(player)} started sprint (${max} movement)`;
}

export function validateSprintMove(
  state: GameState,
  playerId: string,
  x: number,
  y: number,
): string | null {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return "Unknown player";
  if (!canPlayerMove(state, playerId)) return "Not your turn";
  if (state.roundPhase === "deployment") return "Wrong phase";
  if ((player.effects?.Pin ?? 0) > 0) return "Pinned — cannot move";
  const remaining = player.actionBudget?.sprintRemaining ?? 0;
  if (remaining <= 0) return "No sprint movement remaining";
  const err = validateMovementPath(state, playerId, [{ x, y }], { skipMovementBudget: true });
  if (err) return err;
  const cost = movementStepCost(state, player, x, y);
  if (cost > remaining) return "Not enough sprint movement";
  return null;
}

export function applySprintMove(state: GameState, playerId: string, x: number, y: number): string {
  const player = state.players.find((p) => p.id === playerId)!;
  const cost = movementStepCost(state, player, x, y);
  player.x = x;
  player.y = y;
  const budget = player.actionBudget!;
  budget.sprintRemaining = Math.max(0, (budget.sprintRemaining ?? 0) - cost);
  if (budget.sprintRemaining <= 0) clearSprintBudget(budget);
  return `${playerLabel(player)} sprinted to (${x}, ${y})`;
}

export function validateSprintCancel(state: GameState, playerId: string): string | null {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return "Unknown player";
  if ((player.actionBudget?.sprintRemaining ?? 0) <= 0) return "Not sprinting";
  return null;
}

export function applySprintCancel(state: GameState, playerId: string): string {
  const player = state.players.find((p) => p.id === playerId)!;
  clearSprintBudget(player.actionBudget);
  return `${playerLabel(player)} ended sprint`;
}
