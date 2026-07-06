<script setup lang="ts">
import { TERRAIN_TYPE_ENTRIES, type TerrainTypeEntry } from "@gaem/shared";
import { ref } from "vue";

import { useBoardSelection } from "../composables/useBoardSelection.js";
import PanelShell from "./PanelShell.vue";
import RuleText from "./RuleText.vue";
import TerrainTypePreview from "./TerrainTypePreview.vue";

const { closeRightPanel } = useBoardSelection();
const expanded = ref<Set<string>>(new Set());

function isExpanded(id: string): boolean {
  return expanded.value.has(id);
}

function toggle(entry: TerrainTypeEntry) {
  if (expanded.value.has(entry.id)) expanded.value.delete(entry.id);
  else expanded.value.add(entry.id);
}
</script>

<template>
  <PanelShell title="Terrain" @close="closeRightPanel">
    <div class="panel-body">
      <article v-for="entry in TERRAIN_TYPE_ENTRIES" :key="entry.id" class="list-card">
        <button
          type="button"
          class="list-card-header"
          :class="{ expanded: isExpanded(entry.id) }"
          @click="toggle(entry)"
        >
          <span class="item-header">
            <TerrainTypePreview :terrain-type="entry.id" :size="22" />
            <span class="item-name">{{ entry.name }}</span>
          </span>
          <span class="chevron" aria-hidden="true">{{ isExpanded(entry.id) ? "▾" : "▸" }}</span>
        </button>

        <div v-if="isExpanded(entry.id)" class="list-card-body">
          <p class="item-summary">{{ entry.summary }}</p>
          <p class="item-description">
            <RuleText :text="entry.description" />
          </p>
        </div>
      </article>
    </div>
  </PanelShell>
</template>

<style scoped>
.item-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.chevron {
  color: var(--color-muted);
  font-size: 1.5rem;
}

.item-summary {
  margin: 0 0 0.5rem;
  font-weight: 600;
  color: var(--color-text);
}
</style>
