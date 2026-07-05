<script setup lang="ts">
import { computed } from "vue";

import { getEffectSummary, isYadathanArmorName } from "@gaem/shared";

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
  hasteRemaining,
  actionBudgetChips,
  sandboxMode,
  commitHaste,
  canStartSprint,
  canResetMovement,
  canTowerTeleport,
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

const showTowerStep = computed(
  () => activePlayer.value && isYadathanArmorName(activePlayer.value.armor),
);

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

function pickTowerTeleportMode() {
  if (mode.value === "towerTeleport") clearMode();
  else setMode("towerTeleport");
}
</script>

<template>
  <div v-if="activePlayer && (showPlayerActionBar || pills.length)" class="sheet-combat-wrap">
    <div v-if="showPlayerActionBar" class="sheet-combat">
      <div class="budget-row">
        <ActionBudgetChips
          :interactive="showPlayerActionBar && !sandboxMode"
          v-bind="actionBudgetChips"
          :haste-stacks="hasteRemaining"
          @commit-haste="commitHaste"
        />
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
        <SheetActionButton
          v-if="showTowerStep"
          :active="mode === 'towerTeleport'"
          :disabled="!canTowerTeleport"
          @click="pickTowerTeleportMode"
        >
          Tower step
          <template #tooltip>
            <AbilityBlock
              tier-label="Special movement"
              content="Spend all remaining Speed to teleport adjacent to your tower."
            />
          </template>
        </SheetActionButton>
      </div>
    </div>

    <div v-if="pills.length" class="effect-pills">
      <span v-for="pill in pills" :key="pill" class="effect-pill" :title="pillTitle(pill)">
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
}

.sheet-combat {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.budget-row,
.speed-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  align-items: center;
}

.stat {
  font-size: 0.78rem;
  color: var(--color-muted);
}

.sheet-action-btn {
  font-size: 0.72rem;
  padding: 0.2rem 0.45rem;
  border-radius: 6px;
  border: 1px solid var(--color-border);
  background: var(--color-surface-raised);
  color: var(--color-text);
  cursor: pointer;
}

.sheet-action-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.effect-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}

.effect-pill {
  font-size: 0.68rem;
  padding: 0.1rem 0.35rem;
  border-radius: 999px;
  background: var(--color-surface-raised);
  border: 1px solid var(--color-border);
}
</style>
