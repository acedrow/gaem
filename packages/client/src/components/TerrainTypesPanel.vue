<script setup lang="ts">
import { TERRAIN_TYPE_ENTRIES, type TerrainTypeEntry } from "@gaem/shared";
import { ref } from "vue";

import { useBoardSelection } from "../composables/useBoardSelection.js";
import { TERRAIN_TILE_IMAGE_URLS } from "../lib/terrainTileImages.js";
import PanelShell from "./PanelShell.vue";
import RuleText from "./RuleText.vue";

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
            <span
              v-if="TERRAIN_TILE_IMAGE_URLS[entry.id]"
              class="terrain-preview"
              :style="{ backgroundImage: `url(${TERRAIN_TILE_IMAGE_URLS[entry.id]})` }"
            />
            <span v-else class="terrain-preview terrain-preview--plain" :class="entry.id" />
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

.terrain-preview {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border-radius: 3px;
  background-size: cover;
  background-position: center;
  border: 1px solid var(--color-border);
}

.terrain-preview--plain.standard {
  background: var(--color-surface-raised);
}

.terrain-preview--plain.uneasy {
  background: var(--color-tile-sand);
}

.terrain-preview--plain.impassable {
  background: var(--color-border-strong);
}

.terrain-preview--plain.cover {
  background: var(--color-tile-grass);
}

.terrain-preview--plain.obstacle {
  background: var(--color-tile-difficult);
}

.terrain-preview--plain.void {
  background: var(--color-bg);
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
