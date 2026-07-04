<script setup lang="ts">
import { computed } from "vue";

import {
  isRangeTargetAttack,
  isRangedPatternAttack,
  resolveCombatAttackSpec,
  rangeTargetMax,
  usesAnchoredPatternPlacement,
} from "@gaem/shared";

import { useBoardActionMode } from "../composables/useBoardActionMode.js";
import { useCombatActions } from "../composables/useCombatActions.js";
import ActionBudgetChips from "./ActionBudgetChips.vue";

const {
  showPlayerActionBar,
  budget,
  canMain,
  canSupport,
  canAux,
  canStartSprint,
  hasWeaponAttack,
  armorStructured,
  activePlayer,
  sendPlayerAction,
} = useCombatActions();

const { mode, rangeAttackTargetIds, setMode, clearMode } = useBoardActionMode();

const speedLabel = computed(() => {
  if (!budget.value) return "—";
  return `${budget.value.movementRemaining}/${budget.value.movementMax}`;
});

const attackHint = computed(() => {
  if (mode.value !== "attack" || !activePlayer.value?.weapon) {
    return "Click a highlighted tile to aim, then click the attack area to confirm";
  }
  const spec = resolveCombatAttackSpec(activePlayer.value, activePlayer.value.weapon);
  if (!spec) {
    return "Click a highlighted tile to aim, then click the attack area to confirm";
  }
  if (isRangeTargetAttack(spec)) {
    const max = rangeTargetMax(spec);
    const count = rangeAttackTargetIds.value.length;
    if (max <= 1) {
      return "Click an enemy in range to attack";
    }
    return `Select up to ${max} enemies (${count}/${max}). Click an enemy to toggle, empty tile to confirm.`;
  }
  if (usesAnchoredPatternPlacement(spec)) {
    return "Click a tile in range to place the pattern, then click a highlighted tile to attack";
  }
  if (isRangedPatternAttack(spec)) {
    return "Click a tile in range to aim, then click a highlighted tile to attack";
  }
  return "Click a highlighted tile to aim, then click the attack area to confirm";
});

function useClassActive() {
  sendPlayerAction({ action: "classActive" });
}

function useWeaponActive() {
  sendPlayerAction({ action: "weaponActive" });
}

function useEquipment() {
  sendPlayerAction({ action: "useEquipment" });
}

function useInteract() {
  sendPlayerAction({ action: "interact" });
}

function weaponSwap() {
  sendPlayerAction({ action: "weaponSwap" });
  clearMode();
}

function pickMode(next: typeof mode.value) {
  if (mode.value === next) clearMode();
  else if (next === "attack") setMode("attack");
  else setMode(next);
}
</script>

<template>
  <div v-if="showPlayerActionBar" class="action-bar">
    <div class="budget-row">
      <ActionBudgetChips :can-main="canMain" :can-support="canSupport" :can-aux="canAux" />
      <span class="chip speed">Speed {{ speedLabel }}</span>
    </div>
    <div class="actions-row">
      <button type="button" class="action-btn" :class="{ active: mode === 'move' }" @click="pickMode('move')">
        Move
      </button>
      <button
        type="button"
        class="action-btn"
        :class="{ active: mode === 'attack' }"
        :disabled="!canMain || !hasWeaponAttack"
        @click="pickMode('attack')"
      >
        Attack
      </button>
      <button
        type="button"
        class="action-btn"
        :class="{ active: mode === 'shove' }"
        :disabled="!canAux"
        @click="pickMode('shove')"
      >
        Shove
      </button>
      <button
        type="button"
        class="action-btn"
        :class="{ active: mode === 'sprint' }"
        :disabled="mode !== 'sprint' && !canStartSprint"
        @click="pickMode('sprint')"
      >
        Sprint
      </button>
      <button type="button" class="action-btn" :disabled="!canAux" @click="weaponSwap">
        Swap
      </button>
    </div>
    <div class="actions-row">
      <button type="button" class="action-btn" :disabled="!canSupport" @click="useClassActive">
        Class
      </button>
      <button
        type="button"
        class="action-btn"
        :class="{ active: mode === 'armorTeleport' || mode === 'armorPush' }"
        :disabled="!canSupport || !armorStructured"
        @click="
          armorStructured?.kind === 'teleport_adjacent'
            ? pickMode('armorTeleport')
            : pickMode('armorPush')
        "
      >
        Armor
      </button>
      <button type="button" class="action-btn" :disabled="!canMain" @click="useWeaponActive">
        Weapon
      </button>
      <button type="button" class="action-btn" :disabled="!canSupport" @click="useEquipment">
        Equip
      </button>
      <button type="button" class="action-btn" :disabled="!canSupport" @click="useInteract">
        Use
      </button>
      <button
        type="button"
        class="action-btn"
        :class="{ active: mode === 'rez' }"
        :disabled="!canMain"
        @click="pickMode('rez')"
      >
        Rez
      </button>
    </div>
    <div v-if="mode === 'attack'" class="hint-row">
      <span class="hint">{{ attackHint }}</span>
    </div>
    <button v-if="mode" type="button" class="action-btn cancel" @click="clearMode">
      Cancel
    </button>
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

.chip.speed {
  margin-left: auto;
  font-size: 0.72rem;
  font-weight: 600;
  padding: 0.15rem 0.45rem;
  border-radius: 999px;
  background: var(--color-surface-raised);
  border: 1px solid var(--color-border);
  color: var(--color-text);
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

.action-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.action-btn.active {
  border-color: var(--color-accent-bright);
  background: var(--color-accent-tint-bg);
}

.action-btn.small {
  font-size: 0.72rem;
}

.action-btn.cancel {
  align-self: flex-start;
  color: var(--color-muted);
}

.hint {
  font-size: 0.72rem;
  color: var(--color-muted);
}
</style>
