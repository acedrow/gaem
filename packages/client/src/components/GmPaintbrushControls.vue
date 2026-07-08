<script setup lang="ts">
import { TERRAIN_TYPES, TILE_EFFECTS, terrainTypeDisplayName } from "@gaem/shared";
import { ref } from "vue";

import {
  useGmTools,
  GM_TILE_EFFECT_NONE,
} from "../composables/useGmTools.js";
import EffectIcon from "./EffectIcon.vue";
import NumberStepper from "./NumberStepper.vue";
import TileBaseColorModal from "./TileBaseColorModal.vue";

const {
  paintbrushElevation,
  paintbrushTerrain,
  paintbrushEffectId,
  paintbrushEffectStacks,
  paintbrushTileName,
  paintbrushBaseColor,
  paintbrushAppearancePreviewUrl,
  paintbrushPresetLoadId,
  paintbrushPresetNames,
  paintbrushPresetError,
  paintbrushAppearanceUploading,
  resetPaintbrushSettings,
  loadSelectedPreset,
  saveCurrentPreset,
  deleteSelectedPreset,
  uploadPaintbrushAppearance,
  clearPaintbrushAppearance,
} = useGmTools();

const colorModalOpen = ref(false);
const appearanceInput = ref<HTMLInputElement | null>(null);

function onAppearanceSelected(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (file) void uploadPaintbrushAppearance(file);
}
</script>

<template>
  <div class="paintbrush-controls">
    <div class="control-group">
      <span class="control-label">Elevation</span>
      <NumberStepper v-model="paintbrushElevation" :min="-3" :max="3" />
    </div>
    <div class="control-group">
      <span class="control-label">Terrain</span>
      <select v-model="paintbrushTerrain" class="effect-select terrain-select">
        <option v-for="terrain in TERRAIN_TYPES" :key="terrain" :value="terrain">
          {{ terrainTypeDisplayName(terrain) }}
        </option>
      </select>
    </div>
    <div class="control-group effect-group">
      <span class="control-label">Effect</span>
      <select v-model="paintbrushEffectId" class="effect-select">
        <option :value="GM_TILE_EFFECT_NONE">None</option>
        <option v-for="effect in TILE_EFFECTS" :key="effect.id" :value="effect.id">
          {{ effect.id }}
        </option>
      </select>
      <EffectIcon v-if="paintbrushEffectId" :effect-id="paintbrushEffectId" :size="16" />
    </div>
    <div v-if="paintbrushEffectId" class="control-group">
      <span class="control-label">Stacks</span>
      <NumberStepper v-model="paintbrushEffectStacks" :min="-99" :max="99" />
    </div>

    <div class="control-group">
      <span class="control-label">Name</span>
      <input v-model="paintbrushTileName" type="text" class="text-input" placeholder="Optional" />
    </div>
    <div class="control-group">
      <span class="control-label">Color</span>
      <button
        type="button"
        class="color-swatch-btn"
        :style="paintbrushBaseColor ? { background: paintbrushBaseColor } : undefined"
        @click="colorModalOpen = true"
      >
        <span v-if="!paintbrushBaseColor" class="color-swatch-placeholder">—</span>
      </button>
    </div>
    <div class="control-group appearance-group">
      <span class="control-label">Appearance</span>
      <img
        v-if="paintbrushAppearancePreviewUrl"
        :src="paintbrushAppearancePreviewUrl"
        alt=""
        class="appearance-thumb"
      />
      <label class="upload-btn" :class="{ uploading: paintbrushAppearanceUploading }">
        {{ paintbrushAppearanceUploading ? "Uploading…" : "PNG" }}
        <input
          ref="appearanceInput"
          type="file"
          accept="image/png"
          class="hidden-input"
          :disabled="paintbrushAppearanceUploading"
          @change="onAppearanceSelected"
        />
      </label>
      <button
        v-if="paintbrushAppearancePreviewUrl"
        type="button"
        class="mini-btn"
        @click="clearPaintbrushAppearance"
      >
        Clear
      </button>
    </div>

    <div class="control-group preset-group">
      <span class="control-label">Preset</span>
      <select v-model="paintbrushPresetLoadId" class="effect-select preset-select">
        <option value="">Load…</option>
        <option v-for="name in paintbrushPresetNames" :key="name" :value="name">
          {{ name }}
        </option>
      </select>
      <button type="button" class="mini-btn" :disabled="!paintbrushPresetLoadId" @click="loadSelectedPreset">
        Load
      </button>
      <button type="button" class="mini-btn" @click="saveCurrentPreset">Save</button>
      <button
        type="button"
        class="mini-btn"
        :disabled="!paintbrushPresetLoadId"
        @click="deleteSelectedPreset"
      >
        Delete
      </button>
    </div>

    <span v-if="paintbrushPresetError" class="preset-error">{{ paintbrushPresetError }}</span>

    <button type="button" class="reset-btn" @click="resetPaintbrushSettings">Reset</button>

    <TileBaseColorModal v-model="paintbrushBaseColor" :open="colorModalOpen" @close="colorModalOpen = false" />
  </div>
</template>

<style scoped>
.paintbrush-controls {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.control-group {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.control-label {
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--color-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.effect-group {
  gap: 0.35rem;
}

.effect-select {
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-surface);
  color: var(--color-text);
  font-size: 0.8rem;
  font-family: inherit;
  padding: 0.15rem 0.35rem;
  max-width: 8rem;
}

.terrain-select {
  max-width: 9rem;
}

.preset-select {
  max-width: 7rem;
}

.text-input {
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-surface);
  color: var(--color-text);
  font-size: 0.8rem;
  font-family: inherit;
  padding: 0.15rem 0.35rem;
  width: 7rem;
}

.color-swatch-btn {
  width: 1.6rem;
  height: 1.6rem;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-surface-raised);
  cursor: pointer;
  padding: 0;
}

.color-swatch-placeholder {
  font-size: 0.75rem;
  color: var(--color-muted);
}

.appearance-group {
  gap: 0.3rem;
}

.appearance-thumb {
  width: 1.6rem;
  height: 1.6rem;
  object-fit: cover;
  border-radius: 4px;
  border: 1px solid var(--color-border);
}

.upload-btn {
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-surface);
  color: var(--color-muted);
  font-size: 0.78rem;
  font-weight: 600;
  font-family: inherit;
  padding: 0.2rem 0.45rem;
  cursor: pointer;
}

.upload-btn.uploading {
  opacity: 0.6;
  cursor: wait;
}

.hidden-input {
  display: none;
}

.mini-btn,
.reset-btn {
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-surface);
  color: var(--color-muted);
  font-size: 0.78rem;
  font-weight: 600;
  font-family: inherit;
  padding: 0.2rem 0.45rem;
  cursor: pointer;
}

.mini-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.mini-btn:hover:not(:disabled),
.reset-btn:hover {
  color: var(--color-text);
  background: var(--color-surface-raised);
}

.preset-error {
  font-size: 0.75rem;
  color: var(--color-danger);
  max-width: 12rem;
}

.preset-group {
  flex-wrap: wrap;
}
</style>
