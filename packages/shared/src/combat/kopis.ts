import type { GameState, Enemy } from "../types.js";
import { applyEffectStacks, removeEffectStacks } from "./effects.js";

export const MAG_DUMP_EFFECT = "Mag Dump";

export function ensureKopisCombatFields(state: GameState): boolean {
  if (!state.combat) return false;
  if (!state.combat.boardTokens) state.combat.boardTokens = [];
  if (!state.combat.kopisMarks) state.combat.kopisMarks = {};
  syncKopisMarkEffects(state);
  return true;
}

export function clearKopisMarkEffect(state: GameState, enemyId: string): void {
  const enemy = state.enemies.find((e) => e.id === enemyId);
  if (enemy) removeEffectStacks(enemy, [`${MAG_DUMP_EFFECT}:1`]);
}

export function syncKopisMarkEffects(state: GameState): void {
  if (!state.combat?.kopisMarks) return;
  const markedIds = new Set(Object.values(state.combat.kopisMarks));
  for (const enemy of state.enemies) {
    if ((enemy.effects?.[MAG_DUMP_EFFECT] ?? 0) > 0 && !markedIds.has(enemy.id)) {
      removeEffectStacks(enemy, [`${MAG_DUMP_EFFECT}:1`]);
    }
  }
  for (const enemyId of markedIds) {
    const enemy = state.enemies.find((e) => e.id === enemyId);
    if (enemy) applyEffectStacks(enemy, [`${MAG_DUMP_EFFECT}:1`]);
  }
}

export function applyKopisMark(state: GameState, playerId: string, enemyId: string): void {
  if (!ensureKopisCombatFields(state)) return;
  const prevEnemyId = state.combat!.kopisMarks![playerId];
  if (prevEnemyId && prevEnemyId !== enemyId) {
    clearKopisMarkEffect(state, prevEnemyId);
  }
  state.combat!.kopisMarks![playerId] = enemyId;
  const enemy = state.enemies.find((e) => e.id === enemyId);
  if (enemy) applyEffectStacks(enemy, [`${MAG_DUMP_EFFECT}:1`]);
}

export function handleEnemyDefeated(
  state: GameState,
  enemy: Enemy,
  killerPlayerId?: string,
): string | null {
  if (!ensureKopisCombatFields(state)) return null;
  clearKopisMarkEffect(state, enemy.id);

  let tokenMsg: string | null = null;
  if (killerPlayerId) {
    const markEnemyId = state.combat!.kopisMarks?.[killerPlayerId];
    if (markEnemyId === enemy.id) {
      delete state.combat!.kopisMarks![killerPlayerId];
      const tokenId = `kopis-${killerPlayerId}-${enemy.x}-${enemy.y}-${Date.now()}`;
      state.combat!.boardTokens!.push({
        id: tokenId,
        ownerId: killerPlayerId,
        x: enemy.x,
        y: enemy.y,
        kind: "kopis",
      });
      tokenMsg = `Kopis token dropped at (${enemy.x}, ${enemy.y})`;
    }
  }

  for (const [playerId, markedId] of Object.entries(state.combat!.kopisMarks ?? {})) {
    if (markedId === enemy.id) {
      delete state.combat!.kopisMarks![playerId];
    }
  }

  return tokenMsg;
}
