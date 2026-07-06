<script setup lang="ts">
import type { TerrainType } from "@gaem/shared";

import { TERRAIN_TILE_IMAGE_URLS } from "../lib/terrainTileImages.js";
import TerrainTypeIcon from "./TerrainTypeIcon.vue";

withDefaults(
  defineProps<{
    terrainType: TerrainType;
    size?: number;
  }>(),
  {
    size: 28,
  },
);
</script>

<template>
  <span
    v-if="terrainType === 'void' && TERRAIN_TILE_IMAGE_URLS.void"
    class="terrain-preview terrain-preview--void"
    :style="{
      width: `${size}px`,
      height: `${size}px`,
      backgroundImage: `url(${TERRAIN_TILE_IMAGE_URLS.void})`,
    }"
    aria-hidden="true"
  />
  <span
    v-else-if="terrainType === 'standard'"
    class="terrain-preview terrain-preview--standard"
    :style="{ width: `${size}px`, height: `${size}px` }"
    aria-hidden="true"
  />
  <span
    v-else
    class="terrain-preview terrain-preview--icon"
    :style="{ width: `${size}px`, height: `${size}px` }"
  >
    <TerrainTypeIcon :terrain-type="terrainType" :size="size - 8" />
  </span>
</template>

<style scoped>
.terrain-preview {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 3px;
  border: 1px solid var(--color-border);
  background: var(--color-surface-raised);
}

.terrain-preview--void {
  background-size: cover;
  background-position: center;
}

.terrain-preview--standard {
  background: var(--color-surface-raised);
}
</style>
