<script setup lang="ts">
import type { PatternDirection } from "@gaem/shared";
import {
  getEnemyListingByName,
  nextPatternDirection,
  parseEnemyAttackString,
  unexhaustedEnemies,
} from "@gaem/shared";
import { computed, ref, watch } from "vue";

import { useBoardSelection } from "../composables/useBoardSelection.js";
import { useCombatActions } from "../composables/useCombatActions.js";
import { useGameState } from "../composables/useGameState.js";

const { showGmCombatUi } = useCombatActions();
const { selectedEnemyId } = useBoardSelection();
const { gameState, send } = useGameState();

const attackIndex = ref(0);
const attackDirection = ref<PatternDirection>("n");
const targetPlayerId = ref("");
const damageOverride = ref<number | "">("");

const activeEnemy = computed(() => {
  const id = selectedEnemyId.value;
  if (!id) return null;
  return gameState.value?.enemies.find((e) => e.id === id) ?? null;
});

const listing = computed(() => getEnemyListingByName(activeEnemy.value?.name));

const parsedAttacks = computed(() =>
  (listing.value?.attacks ?? []).map((text) => parseEnemyAttackString(text)),
);

const selectedAttack = computed(() => parsedAttacks.value[attackIndex.value]);

const queue = computed(() => {
  const s = gameState.value;
  if (!s) return [];
  return unexhaustedEnemies(s);
});

watch(selectedEnemyId, () => {
  attackIndex.value = 0;
  attackDirection.value = "n";
  targetPlayerId.value = "";
  damageOverride.value = "";
});

function rotateDirection() {
  attackDirection.value = nextPatternDirection(attackDirection.value);
}

function runAttack() {
  const enemy = activeEnemy.value;
  if (!enemy) return;
  send({
    type: "gmEnemyAction",
    action: {
      action: "attack",
      enemyId: enemy.id,
      attackIndex: attackIndex.value,
      direction: attackDirection.value,
      targetPlayerId: targetPlayerId.value || undefined,
      damage: damageOverride.value === "" ? undefined : Number(damageOverride.value),
    },
  });
}

function exhaustEnemy() {
  const enemy = activeEnemy.value;
  if (!enemy) return;
  send({ type: "gmEnemyAction", action: { action: "exhaust", enemyId: enemy.id } });
}
</script>

<template>
  <div v-if="showGmCombatUi" class="action-bar panel gm-bar">
    <div v-if="!activeEnemy" class="hint-row">
      <span class="hint">Select an enemy on the board to move or attack</span>
      <span v-if="queue.length" class="queue-inline">
        Active: {{ queue.map((e) => e.name ?? e.id).join(", ") }}
      </span>
    </div>
    <template v-else>
      <div class="budget-row">
        <span class="chip enemy-name">{{ activeEnemy.name ?? activeEnemy.id }}</span>
        <span v-if="activeEnemy.exhausted" class="chip spent">Exhausted</span>
        <span v-else class="chip">Click board to move</span>
      </div>
      <div v-if="listing?.attacks?.length" class="actions-row">
        <select v-model="attackIndex" class="select">
          <option v-for="(_, i) in listing.attacks" :key="i" :value="i">
            Attack {{ i + 1 }}
          </option>
        </select>
        <button
          v-if="selectedAttack?.patternId"
          type="button"
          class="action-btn"
          @click="rotateDirection"
        >
          Aim {{ attackDirection.toUpperCase() }}
        </button>
        <select v-model="targetPlayerId" class="select">
          <option value="">Target —</option>
          <option v-for="p in gameState?.players ?? []" :key="p.id" :value="p.id">
            {{ p.nickname ?? p.id }}
          </option>
        </select>
        <input
          v-model="damageOverride"
          type="number"
          min="0"
          class="damage-input"
          placeholder="Dmg"
        />
        <button type="button" class="action-btn" @click="runAttack">Attack</button>
        <button type="button" class="action-btn" @click="exhaustEnemy">Exhaust</button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.action-bar {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.65rem 0.75rem;
  margin: 0 0.75rem 0.5rem;
}

.budget-row,
.actions-row,
.hint-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  align-items: center;
}

.chip {
  font-size: 0.72rem;
  font-weight: 600;
  padding: 0.15rem 0.45rem;
  border-radius: 999px;
  background: var(--color-surface-raised);
  border: 1px solid var(--color-border);
  color: var(--color-text);
}

.chip.spent {
  opacity: 0.45;
}

.chip.enemy-name {
  font-weight: 700;
}

.action-btn {
  font-size: 0.78rem;
  padding: 0.3rem 0.55rem;
  border-radius: 6px;
  border: 1px solid var(--color-border);
  background: var(--color-surface-raised);
  color: var(--color-text);
  cursor: pointer;
}

.select,
.damage-input {
  font-size: 0.78rem;
  padding: 0.25rem 0.4rem;
  border-radius: 6px;
  border: 1px solid var(--color-border);
  background: var(--color-surface-raised);
  color: var(--color-text);
}

.damage-input {
  width: 3.5rem;
}

.hint {
  font-size: 0.72rem;
  color: var(--color-muted);
}

.queue-inline {
  font-size: 0.72rem;
  color: var(--color-muted);
  margin-left: auto;
}
</style>
