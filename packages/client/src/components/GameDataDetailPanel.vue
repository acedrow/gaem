<script setup lang="ts">
import type { PlayerArmor, PlayerClass, PlayerWeapon } from "@gaem/shared";
import {
  getArmorByName,
  getClassByName,
  getWeaponByName,
} from "@gaem/shared";
import { computed } from "vue";

import { useBoardSelection } from "../composables/useBoardSelection.js";
import type { DataFocus } from "../composables/useInfoDataSelection.js";
import { kindLabel } from "../lib/game-data-search.js";

const props = defineProps<{ focus: DataFocus }>();

const { closeRightPanel } = useBoardSelection();

const playerClass = computed(() =>
  props.focus.kind === "classes" ? getClassByName(props.focus.name) : undefined,
);
const playerArmor = computed(() =>
  props.focus.kind === "armor" ? getArmorByName(props.focus.name) : undefined,
);
const playerWeapon = computed(() =>
  props.focus.kind === "weapons" ? getWeaponByName(props.focus.name) : undefined,
);

const title = computed(() => props.focus.name);
const categoryLabel = computed(() => kindLabel(props.focus.kind));

const item = computed(
  (): PlayerClass | PlayerArmor | PlayerWeapon | undefined =>
    playerClass.value ?? playerArmor.value ?? playerWeapon.value,
);
</script>

<template>
  <div class="panel">
    <div class="panel-header">
      <div class="title-block">
        <p class="panel-kicker">{{ categoryLabel }}</p>
        <h2 class="panel-title">{{ title }}</h2>
      </div>
      <button class="close-btn" type="button" title="Close" @click="closeRightPanel">×</button>
    </div>

    <div v-if="item" class="panel-body">
      <p v-if="'summary' in item && item.summary" class="item-summary">{{ item.summary }}</p>
      <p v-if="item.description" class="item-description">{{ item.description }}</p>

      <template v-if="playerClass">
        <p class="item-stat">HP {{ playerClass.hp }}</p>
        <p v-if="playerClass.activeAbility" class="item-ability">
          <span class="ability-label">Active</span>
          {{ playerClass.activeAbility }}
        </p>
        <p v-if="playerClass.passiveAbility" class="item-ability">
          <span class="ability-label">Passive</span>
          {{ playerClass.passiveAbility }}
        </p>
      </template>

      <template v-else-if="playerArmor">
        <p class="item-stat">Speed {{ playerArmor.speed }}</p>
        <p v-if="playerArmor.specialMovement" class="item-ability">
          <span class="ability-label">Movement</span>
          {{ playerArmor.specialMovement }}
        </p>
        <p v-if="playerArmor.armorAction" class="item-ability">
          <span class="ability-label">Armor action</span>
          {{ playerArmor.armorAction }}
        </p>
        <p v-if="playerArmor.reversal" class="item-ability">
          <span class="ability-label">Reversal ({{ playerArmor.reversal.charges }} charges)</span>
          {{ playerArmor.reversal.effect }}
        </p>
      </template>

      <template v-else-if="playerWeapon">
        <p v-if="playerWeapon.activeAbility" class="item-ability">
          <span class="ability-label">Active</span>
          {{ playerWeapon.activeAbility }}
        </p>
        <p v-if="playerWeapon.passiveAbility" class="item-ability">
          <span class="ability-label">Passive</span>
          {{ playerWeapon.passiveAbility }}
        </p>
      </template>
    </div>

    <p v-else class="muted">Entry not found.</p>
  </div>
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 1rem;
  height: 100%;
}

.panel-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 1rem;
  flex-shrink: 0;
}

.title-block {
  min-width: 0;
}

.panel-kicker {
  margin: 0 0 0.2rem;
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #8b949e;
}

.panel-title {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 700;
  line-height: 1.3;
}

.close-btn {
  flex-shrink: 0;
  border: none;
  background: transparent;
  color: #8b949e;
  font-size: 1.4rem;
  line-height: 1;
  cursor: pointer;
  padding: 0 0.15rem;
}

.close-btn:hover {
  color: #e6edf3;
}

.panel-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.item-summary {
  margin: 0;
  font-size: 0.82rem;
  color: #8b949e;
  font-style: italic;
}

.item-description {
  margin: 0;
  font-size: 0.85rem;
  line-height: 1.5;
  color: #c9d1d9;
}

.item-stat {
  margin: 0;
  font-size: 0.8rem;
  color: #8b949e;
  font-weight: 600;
}

.item-ability {
  margin: 0;
  font-size: 0.82rem;
  line-height: 1.45;
  color: #c9d1d9;
}

.ability-label {
  display: block;
  margin-bottom: 0.15rem;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #8b949e;
}

.muted {
  margin: 0;
  color: #8b949e;
  font-size: 0.9rem;
}
</style>
