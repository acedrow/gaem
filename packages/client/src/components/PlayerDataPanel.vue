<script setup lang="ts">
import type { PlayerArmor, PlayerClass, PlayerWeapon } from "@gaem/shared";
import { PLAYER_ARMOR, PLAYER_CLASSES, PLAYER_WEAPONS } from "@gaem/shared";
import { computed, ref } from "vue";

import { useBoardSelection } from "../composables/useBoardSelection.js";
import type { DataCategory } from "../composables/useInfoDataSelection.js";
import PanelShell from "./PanelShell.vue";
import PlayerItemDetail from "./PlayerItemDetail.vue";

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
  if (expanded.value.has(name)) expanded.value.delete(name);
  else expanded.value.add(name);
}
</script>

<template>
  <PanelShell :title="title" @close="closeRightPanel">
    <div class="panel-body">
      <article v-for="item in items" :key="item.name" class="list-card">
        <button
          type="button"
          class="list-card-header"
          :class="{ expanded: isExpanded(item.name) }"
          @click="toggle(item.name)"
        >
          <span class="item-name">{{ item.name }}</span>
          <span class="chevron" aria-hidden="true">{{ isExpanded(item.name) ? "▾" : "▸" }}</span>
        </button>

        <div v-if="isExpanded(item.name)" class="list-card-body">
          <p v-if="'summary' in item && item.summary" class="item-summary">{{ item.summary }}</p>
          <p class="item-description">{{ item.description }}</p>
          <PlayerItemDetail :item="item" :kind="category" />
        </div>
      </article>
    </div>
  </PanelShell>
</template>

<style scoped>
.item-name {
  font-weight: 600;
}

.chevron {
  color: var(--color-muted);
  font-size: 0.75rem;
}

.item-summary {
  margin: 0 0 0.5rem;
  font-weight: 600;
  color: var(--color-text);
}

.item-description {
  margin: 0 0 0.5rem;
  line-height: 1.45;
}
</style>
