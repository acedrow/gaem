<script setup lang="ts">
import type { PlayerArmor, PlayerClass, PlayerWeapon } from "@gaem/shared";
import { PLAYER_ARMOR, PLAYER_CLASSES, PLAYER_WEAPONS } from "@gaem/shared";
import { computed, ref } from "vue";

import { useBoardSelection } from "../composables/useBoardSelection.js";
import type { DataCategory } from "../composables/useInfoDataSelection.js";

const props = defineProps<{ category: DataCategory }>();

const { closeRightPanel } = useBoardSelection();
const expanded = ref<Set<string>>(new Set());

const title = computed(() => {
  if (props.category === "armor") return "Armor";
  if (props.category === "classes") return "Classes";
  return "Weapons";
});

const items = computed(() => {
  if (props.category === "armor") return PLAYER_ARMOR;
  if (props.category === "classes") return PLAYER_CLASSES;
  return PLAYER_WEAPONS;
});

function isExpanded(name: string): boolean {
  return expanded.value.has(name);
}

function toggle(name: string) {
  const next = new Set(expanded.value);
  if (next.has(name)) next.delete(name);
  else next.add(name);
  expanded.value = next;
}

function isClass(item: PlayerClass | PlayerArmor | PlayerWeapon): item is PlayerClass {
  return props.category === "classes";
}

function isArmor(item: PlayerClass | PlayerArmor | PlayerWeapon): item is PlayerArmor {
  return props.category === "armor";
}

function isWeapon(item: PlayerClass | PlayerArmor | PlayerWeapon): item is PlayerWeapon {
  return props.category === "weapons";
}
</script>

<template>
  <div class="panel">
    <div class="panel-header">
      <h2 class="panel-title">{{ title }}</h2>
      <button class="close-btn" type="button" title="Close" @click="closeRightPanel">×</button>
    </div>

    <div class="panel-body">
      <article v-for="item in items" :key="item.name" class="data-item">
        <button
          type="button"
          class="item-header"
          :class="{ expanded: isExpanded(item.name) }"
          @click="toggle(item.name)"
        >
          <span class="item-name">{{ item.name }}</span>
          <span class="chevron" aria-hidden="true">{{ isExpanded(item.name) ? "▾" : "▸" }}</span>
        </button>

        <div v-if="isExpanded(item.name)" class="item-body">
          <p v-if="'summary' in item && item.summary" class="item-summary">{{ item.summary }}</p>
          <p class="item-description">{{ item.description }}</p>

          <template v-if="isClass(item)">
            <p class="item-stat">HP {{ item.hp }}</p>
            <p v-if="item.activeAbility" class="item-ability">
              <span class="ability-label">Active</span>
              {{ item.activeAbility }}
            </p>
            <p v-if="item.passiveAbility" class="item-ability">
              <span class="ability-label">Passive</span>
              {{ item.passiveAbility }}
            </p>
          </template>

          <template v-else-if="isArmor(item)">
            <p class="item-stat">Speed {{ item.speed }}</p>
            <p v-if="item.specialMovement" class="item-ability">
              <span class="ability-label">Movement</span>
              {{ item.specialMovement }}
            </p>
            <p v-if="item.armorAction" class="item-ability">
              <span class="ability-label">Armor action</span>
              {{ item.armorAction }}
            </p>
            <p v-if="item.reversal" class="item-ability">
              <span class="ability-label">Reversal ({{ item.reversal.charges }} charges)</span>
              {{ item.reversal.effect }}
            </p>
          </template>

          <template v-else-if="isWeapon(item)">
            <p v-if="item.activeAbility" class="item-ability">
              <span class="ability-label">Active</span>
              {{ item.activeAbility }}
            </p>
            <p v-if="item.passiveAbility" class="item-ability">
              <span class="ability-label">Passive</span>
              {{ item.passiveAbility }}
            </p>
          </template>
        </div>
      </article>
    </div>
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
  gap: 0.35rem;
}

.data-item {
  border: 1px solid #21262d;
  border-radius: 8px;
}

.item-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  width: 100%;
  padding: 0.55rem 0.65rem;
  border: none;
  background: #161b22;
  color: #e6edf3;
  text-align: left;
  cursor: pointer;
  font-family: inherit;
}

.item-header:hover,
.item-header.expanded {
  background: #1c2128;
}

.item-name {
  font-size: 0.9rem;
  font-weight: 700;
  line-height: 1.3;
}

.chevron {
  flex-shrink: 0;
  font-size: 0.75rem;
  color: #8b949e;
}

.item-body {
  padding: 0.65rem 0.75rem 0.75rem;
  border-top: 1px solid #21262d;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
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
</style>
