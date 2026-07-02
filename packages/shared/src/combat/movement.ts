import type { GameState, Player } from "../types.js";
import type { BoardCoord } from "../patterns.js";
import { isOrthogonallyAdjacent } from "../patterns.js";
import { buildBoardOccupancy, type BoardOccupancy } from "../game.js";
import { coordKey, isInBounds, isWalkable, tileAt } from "../map.js";
import { getArmorSpeed } from "../player-data.js";
import { movementCostMultiplier } from "./effects.js";
import { spendMovement } from "./actions.js";
import { createDefaultActionBudget } from "./types.js";

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

export function validateMovementPath(
  state: GameState,
  playerId: string,
  path: BoardCoord[],
  opts?: { allowOccupiedDestination?: boolean; sprint?: boolean },
): string | null {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return "Unknown player";
  if ((player.effects?.Pin ?? 0) > 0) return "Pinned — cannot move";
  if (!opts?.sprint && !player.actionBudget) {
    const speed = player.speed ?? getArmorSpeed(player.armor);
    if (speed) player.actionBudget = createDefaultActionBudget(speed);
  }

  if (path.length === 0) return "Empty path";

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

  if (opts?.sprint) {
    const maxSprint = Math.floor((player.speed ?? 0) / 2);
    if (computed.total > maxSprint) return "Sprint exceeds half Speed";
    return null;
  }

  const budget = player.actionBudget?.movementRemaining;
  if (budget !== undefined && computed.total > budget) return "Not enough movement";
  return null;
}

export function applyMovementPath(
  state: GameState,
  playerId: string,
  path: BoardCoord[],
  opts?: { sprint?: boolean; spendBudget?: boolean },
): string | null {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return "Unknown player";
  const err = validateMovementPath(state, playerId, path, { sprint: opts?.sprint });
  if (err) return err;
  const computed = computePathCost(state, player, path)!;
  if (opts?.spendBudget !== false && player.actionBudget) {
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
