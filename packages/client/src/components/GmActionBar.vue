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
} from "@gaem/shared";
import { computed, ref, watch } from "vue";

import { useBoardActionMode } from "../composables/useBoardActionMode.js";
import { useBoardSelection } from "../composables/useBoardSelection.js";
import { useCombatActions } from "../composables/useCombatActions.js";
import { useGameState } from "../composables/useGameState.js";

const { showGmCombatUi } = useCombatActions();
const { selectedEnemyId } = useBoardSelection();
const { gameState, send } = useGameState();
const { mode, gmEnemyAttack, startGmEnemyAttack, startGmSwarmAttack, clearMode } = useBoardActionMode();

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

const isInSwarm = computed(() => {
  const s = gameState.value;
  const enemy = activeEnemy.value;
  if (!s || !enemy) return false;
  const group = swarmGroupForEnemy(s, enemy.id);
  return (group?.size ?? 0) > 1;
});

const swarmDirectAttackIndex = computed(() => {
  const attacks = listing.value?.attacks ?? [];
  return attacks.findIndex((text) => isDirectTargetEnemyAttack(parseEnemyAttackString(text)));
});

const showSwarmAttack = computed(
  () => !!activeEnemy.value && !activeIsTower.value && isInSwarm.value && swarmDirectAttackIndex.value >= 0,
);

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
    (gmEnemyAttack.value?.swarm
      ? gmEnemyAttack.value.attackIndex === swarmDirectAttackIndex.value
      : gmEnemyAttack.value?.attackIndex === attackIndex.value),
);

const targetingSwarmAttack = computed(
  () => targetingAttack.value && !!gmEnemyAttack.value?.swarm,
);

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

function runSwarmAttack() {
  const enemy = activeEnemy.value;
  const index = swarmDirectAttackIndex.value;
  if (!enemy || index < 0) return;
  const damage = damageOverride.value === "" ? undefined : Number(damageOverride.value);
  startGmSwarmAttack(enemy.id, index, damage);
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
  <div v-if="showGmCombatUi && activeEnemy" class="action-bar gm-bar">
    <div class="budget-row">
      <span class="chip enemy-name">{{ activeEnemy.name ?? activeEnemy.id }}</span>
      <span v-if="activeEnemy.exhausted && !activeIsTower" class="chip spent">Exhausted</span>
      <span v-else-if="!activeIsTower" class="chip speed">Speed {{ speedLabel }}</span>
    </div>
    <div v-if="showSwarmAttack" class="actions-row">
      <input
        v-model="damageOverride"
        type="number"
        min="0"
        class="damage-input"
        placeholder="Dmg"
      />
      <button type="button" class="action-btn primary" @click="runSwarmAttack">
        {{ targetingSwarmAttack ? "Targeting…" : "Swarm attack" }}
      </button>
      <button type="button" class="action-btn" @click="exhaustEnemy">Exhaust</button>
    </div>
    <div v-else-if="listing?.attacks?.length && !activeIsTower" class="actions-row">
      <select v-model="attackIndex" class="select">
        <option v-for="(attack, i) in listing.attacks" :key="`${attack}-${i}`" :value="i">
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
    <p v-if="targetingSwarmAttack" class="attack-hint">Click a highlighted player, then choose strike count</p>
    <p v-else-if="targetingAttack" class="attack-hint">Click a highlighted player to attack</p>
  </div>
</template>

<style scoped>
.action-bar {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.65rem 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-surface);
}

.budget-row,
.actions-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  align-items: center;
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
  background: var(--color-surface-raised);
}

.action-btn.primary {
  border-color: var(--color-accent-muted);
  background: var(--color-accent-subtle-bg);
  color: var(--color-accent);
  font-weight: 600;
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

.attack-hint {
  margin: 0;
  font-size: 0.72rem;
  color: var(--color-muted);
}

</style>
