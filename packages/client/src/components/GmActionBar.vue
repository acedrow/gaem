<script setup lang="ts">
import type { PatternDirection } from "@gaem/shared";
import {
  getEnemyListingByName,
  getEnemySpeed,
  getSwarmMovementRemaining,
  isDirectTargetEnemyAttack,
  isTowerEnemy,
  nextPatternDirection,
  parseEnemyAttackString,
  swarmGroupForEnemy,
  unexhaustedEnemies,
} from "@gaem/shared";
import { computed, ref, watch } from "vue";

import { useBoardActionMode } from "../composables/useBoardActionMode.js";
import { useBoardSelection } from "../composables/useBoardSelection.js";
import { useCombatActions } from "../composables/useCombatActions.js";
import { useGameState } from "../composables/useGameState.js";

const { showGmCombatUi } = useCombatActions();
const { selectedEnemyId } = useBoardSelection();
const { gameState, send } = useGameState();
const { mode, gmEnemyAttack, startGmEnemyAttack, clearMode } = useBoardActionMode();

const attackIndex = ref(0);
const attackDirection = ref<PatternDirection>("n");
const damageOverride = ref<number | "">("");

const activeEnemy = computed(() => {
  const id = selectedEnemyId.value;
  if (!id) return null;
  return gameState.value?.enemies.find((e) => e.id === id) ?? null;
});

const activeIsTower = computed(() =>
  activeEnemy.value ? isTowerEnemy(activeEnemy.value) : false,
);

const listing = computed(() => getEnemyListingByName(activeEnemy.value?.name));

const speedLabel = computed(() => {
  const enemy = activeEnemy.value;
  const s = gameState.value;
  if (!enemy || !s) return "—";
  const max = getEnemySpeed(enemy);
  const group = swarmGroupForEnemy(s, enemy.id);
  if (group && group.size > 1) {
    return `${getSwarmMovementRemaining(s, group.memberIds)}/${max}`;
  }
  const remaining = enemy.movementRemaining ?? max;
  return `${remaining}/${max}`;
});

const parsedAttacks = computed(() =>
  (listing.value?.attacks ?? []).map((text) => parseEnemyAttackString(text)),
);

const selectedAttack = computed(() => parsedAttacks.value[attackIndex.value]);

const isDirectAttack = computed(() =>
  selectedAttack.value ? isDirectTargetEnemyAttack(selectedAttack.value) : false,
);

const targetingAttack = computed(
  () =>
    mode.value === "gmEnemyAttack" &&
    gmEnemyAttack.value?.enemyId === activeEnemy.value?.id &&
    gmEnemyAttack.value?.attackIndex === attackIndex.value,
);

const queue = computed(() => {
  const s = gameState.value;
  if (!s) return [];
  return unexhaustedEnemies(s).filter((e) => !isTowerEnemy(e));
});

watch(selectedEnemyId, () => {
  attackIndex.value = 0;
  attackDirection.value = "n";
  damageOverride.value = "";
  clearMode();
});

watch(attackIndex, () => {
  if (mode.value === "gmEnemyAttack") clearMode();
});

function rotateDirection() {
  attackDirection.value = nextPatternDirection(attackDirection.value);
}

function runAttack() {
  const enemy = activeEnemy.value;
  if (!enemy) return;
  const damage = damageOverride.value === "" ? undefined : Number(damageOverride.value);
  if (isDirectAttack.value) {
    startGmEnemyAttack(enemy.id, attackIndex.value, damage);
    return;
  }
  send({
    type: "gmEnemyAction",
    action: {
      action: "attack",
      enemyId: enemy.id,
      attackIndex: attackIndex.value,
      direction: attackDirection.value,
      damage,
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
  <div v-if="showGmCombatUi" class="action-bar gm-bar">
    <div v-if="!activeEnemy" class="hint-row">
      <span class="hint">Select an enemy on the board to move or attack</span>
      <span v-if="queue.length" class="queue-inline">
        Active: {{ queue.map((e) => e.name ?? e.id).join(", ") }}
      </span>
    </div>
    <template v-else>
      <div class="budget-row">
        <span class="chip enemy-name">{{ activeEnemy.name ?? activeEnemy.id }}</span>
        <span v-if="activeEnemy.exhausted && !activeIsTower" class="chip spent">Exhausted</span>
        <span v-else-if="!activeIsTower" class="chip speed">Speed {{ speedLabel }}</span>
      </div>
      <div v-if="listing?.attacks?.length && !activeIsTower" class="actions-row">
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
        <input
          v-model="damageOverride"
          type="number"
          min="0"
          class="damage-input"
          placeholder="Dmg"
        />
        <button type="button" class="action-btn" @click="runAttack">
          {{ isDirectAttack ? (targetingAttack ? "Targeting…" : "Target") : "Attack" }}
        </button>
        <button type="button" class="action-btn" @click="exhaustEnemy">Exhaust</button>
      </div>
      <p v-if="targetingAttack" class="attack-hint">Click a highlighted player to attack</p>
    </template>
  </div>
</template>

<style scoped>
.action-bar {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  gap: 0.5rem;
  padding: 0.65rem 0.75rem;
  margin: 0 0.75rem 0.5rem;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-surface);
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

.chip.speed {
  margin-left: auto;
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
  border-radius: 0;
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

.attack-hint {
  margin: 0;
  font-size: 0.72rem;
  color: var(--color-muted);
}

.queue-inline {
  font-size: 0.72rem;
  color: var(--color-muted);
  margin-left: auto;
}
</style>
