import type { GameState } from "@gaem/shared";
import { getEnemyMaxHp } from "@gaem/shared";
import type { Ref } from "vue";
import { onUnmounted, ref, watch } from "vue";

import { DAMAGE_ANIMATION_DURATION_MS } from "../lib/damageAnimationTiming.js";

export function useEnemyDeathAnimations(
  gameState: Ref<GameState | null>,
  onRemove: (enemyId: string) => void,
) {
  const dyingEnemyIds = ref<ReadonlySet<string>>(new Set());
  let prevHp: Map<string, number> | null = null;
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  function setDying(ids: Set<string>) {
    dyingEnemyIds.value = ids;
  }

  function clearDeath(enemyId: string) {
    const timer = timers.get(enemyId);
    if (timer) {
      clearTimeout(timer);
      timers.delete(enemyId);
    }
    if (!dyingEnemyIds.value.has(enemyId)) return;
    const next = new Set(dyingEnemyIds.value);
    next.delete(enemyId);
    setDying(next);
  }

  function startDeath(enemyId: string) {
    if (dyingEnemyIds.value.has(enemyId) || timers.has(enemyId)) return;
    const next = new Set(dyingEnemyIds.value);
    next.add(enemyId);
    setDying(next);
    const timer = setTimeout(() => {
      timers.delete(enemyId);
      onRemove(enemyId);
    }, DAMAGE_ANIMATION_DURATION_MS);
    timers.set(enemyId, timer);
  }

  function isEnemyDying(enemyId: string): boolean {
    return dyingEnemyIds.value.has(enemyId);
  }

  watch(gameState, (state) => {
    if (!state) {
      prevHp = null;
      return;
    }

    const nextHp = new Map<string, number>();
    for (const enemy of state.enemies) {
      nextHp.set(enemy.id, enemy.hp ?? getEnemyMaxHp(enemy));
    }

    if (prevHp) {
      for (const [enemyId, hp] of nextHp) {
        const before = prevHp.get(enemyId);
        if (before !== undefined && before > 0 && hp <= 0) {
          startDeath(enemyId);
        }
      }
    }

    for (const enemyId of dyingEnemyIds.value) {
      if (!nextHp.has(enemyId)) clearDeath(enemyId);
    }

    prevHp = nextHp;
  });

  onUnmounted(() => {
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
    setDying(new Set());
    prevHp = null;
  });

  return { isEnemyDying };
}
