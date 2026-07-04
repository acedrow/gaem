<script setup lang="ts">
import { computed } from "vue";

import { getEffectSummary } from "@gaem/shared";

import { useBoardActionMode } from "../composables/useBoardActionMode.js";
import { useCombatActions } from "../composables/useCombatActions.js";
import AbilityBlock from "./AbilityBlock.vue";
import ActionBudgetChips from "./ActionBudgetChips.vue";
import SheetActionButton from "./SheetActionButton.vue";

const props = defineProps<{ playerId: string }>();

const {
  showPlayerActionBar,
  budget,
  canMain,
  canSupport,
  canAux,
  canStartSprint,
  canResetMovement,
  activePlayer,
  effectPills,
  resetMovement,
} = useCombatActions(() => props.playerId);

const { mode, setMode, clearMode } = useBoardActionMode();

const speedLabel = computed(() => {
  if (!budget.value) return "—";
  return `${budget.value.movementRemaining}/${budget.value.movementMax}`;
});

const pills = computed(() => (activePlayer.value ? effectPills(activePlayer.value) : []));

function pillTitle(token: string) {
  const id = token.split(":")[0] ?? token;
  return getEffectSummary(id) ?? token;
}

function onResetMovement() {
  clearMode();
  resetMovement();
}

function pickSprintMode() {
  if (mode.value === "sprint") clearMode();
  else setMode("sprint");
}
</script>

<template>
  <div v-if="activePlayer && (showPlayerActionBar || pills.length)" class="sheet-combat-wrap">
    <div v-if="showPlayerActionBar" class="sheet-combat">
      <div class="budget-row">
        <ActionBudgetChips :can-main="canMain" :can-support="canSupport" :can-aux="canAux" />
      </div>

      <div class="speed-row">
        <span class="stat">Speed {{ speedLabel }}</span>
        <button
          type="button"
          class="sheet-action-btn"
          :disabled="!canResetMovement"
          @click="onResetMovement"
        >
          Reset movement
        </button>
        <SheetActionButton
          :active="mode === 'sprint'"
          :disabled="mode !== 'sprint' && !canStartSprint"
          @click="pickSprintMode"
        >
          Sprint
          <template #tooltip>
            <AbilityBlock tier-label="Aux action" content="Sprint — Move up to half your Speed." />
          </template>
        </SheetActionButton>
      </div>
    </div>

    <div v-if="pills.length" class="effect-bar">
      <span
        v-for="pill in pills"
        :key="pill"
        class="effect-pill"
        :title="pillTitle(pill)"
      >
        {{ pill }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.sheet-combat-wrap {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid var(--color-border);
}

.sheet-combat {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.budget-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  align-items: center;
}

.speed-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.stat {
  font-size: 0.75rem;
  color: var(--color-muted);
  font-weight: 600;
}

.effect-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}

.effect-pill {
  font-size: 0.7rem;
  padding: 0.12rem 0.4rem;
  border-radius: 999px;
  background: var(--color-danger-tint-bg);
  border: 1px solid var(--color-danger-tint-border);
  color: var(--color-danger-light);
}

.sheet-action-btn {
  font-size: 0.72rem;
  padding: 0.2rem 0.5rem;
  border-radius: 6px;
  border: 1px solid var(--color-border);
  background: var(--color-surface-raised);
  color: var(--color-text);
  cursor: pointer;
}

.sheet-action-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.sheet-action-btn:not(:disabled):hover {
  border-color: var(--color-accent-muted);
  color: var(--color-accent-bright);
}
</style>
