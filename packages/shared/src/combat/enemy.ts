import type { GameState } from "../types.js";
import { getEnemyListingByName, refreshEnemyMovement } from "../enemy-data.js";
import { reconcileSwarmMovement } from "./swarm.js";

export function bossActionsForEncounter(
  actionsStat: string | undefined,
  playerCount: number,
): number {
  if (!actionsStat) return 1;
  const parts = actionsStat.split("/").map((p) => Number(p.trim()));
  if (parts.length !== 2 || !parts[0] || !parts[1]) return 1;
  return Math.max(1, Math.floor((playerCount / parts[1]) * parts[0]));
}

export function getEnemyBossActionBudget(
  state: GameState,
  enemyId: string,
): number | null {
  const enemy = state.enemies.find((e) => e.id === enemyId);
  if (!enemy?.name) return null;
  const listing = getEnemyListingByName(enemy.name);
  if (!listing?.actions) return null;
  const count = state.combat?.playerCountAtStart ?? state.players.length;
  return bossActionsForEncounter(listing.actions, count);
}

export function markEnemyExhausted(state: GameState, enemyId: string): void {
  const enemy = state.enemies.find((e) => e.id === enemyId);
  if (enemy) enemy.exhausted = true;
}

export function resetEnemyExhaustion(state: GameState): void {
  for (const enemy of state.enemies) {
    enemy.exhausted = false;
    refreshEnemyMovement(enemy);
  }
  reconcileSwarmMovement(state);
}

export function resetGmTurnActions(state: GameState): void {
  resetEnemyExhaustion(state);
  if (state.combat) {
    state.combat.pendingActions = state.combat.pendingActions.filter((p) => !p.actorEnemyId);
    state.combat.activeEnemyId = null;
  }
}

export function unexhaustedEnemies(state: GameState) {
  return state.enemies.filter((e) => !e.exhausted);
}

export function setActiveEnemy(state: GameState, enemyId: string | null): void {
  if (!state.combat) return;
  state.combat.activeEnemyId = enemyId;
}
