<script setup lang="ts">
import { computed } from "vue";

import { useBoardActionMode } from "../composables/useBoardActionMode.js";
import { useCombatActions } from "../composables/useCombatActions.js";

const {
  showPlayerActionBar,
  budget,
  canMain,
  canSupport,
  canAux,
  hasWeaponAttack,
  armorStructured,
  sendPlayerAction,
} = useCombatActions();

const { mode, setMode, clearMode } = useBoardActionMode();

const speedLabel = computed(() => {
  if (!budget.value) return "—";
  return `${budget.value.movementRemaining}/${budget.value.movementMax}`;
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
  else setMode(next);
}
</script>

<template>
  <div v-if="showPlayerActionBar" class="action-bar">
    <div class="budget-row">
      <span class="chip" :class="{ spent: !canMain }">Main</span>
      <span class="chip" :class="{ spent: !canSupport }">Support</span>
      <span class="chip" :class="{ spent: !canAux }">Aux</span>
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
        :disabled="!canAux"
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
      <span class="hint">Click a highlighted tile to aim, then click the attack area to confirm</span>
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
