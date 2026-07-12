<script setup lang="ts">
import { TERRAIN_TYPES, TILE_EFFECTS, terrainTypeDisplayName } from "@gaem/shared";
import { onUnmounted, ref, watch } from "vue";

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
  paintbrushEnableElevation,
  paintbrushEnableTerrain,
  paintbrushEnableEffect,
  paintbrushEnableName,
  paintbrushEnableColor,
  paintbrushEnableAppearance,
  paintbrushPresetLoadId,
  paintbrushPresetNames,
  paintbrushPresetError,
  paintbrushAppearanceUploading,
  resetPaintbrushSettings,
  enableAllPaintbrushOptions,
  disableAllPaintbrushOptions,
  loadSelectedPreset,
  saveCurrentPreset,
  deleteSelectedPreset,
  uploadPaintbrushAppearance,
  clearPaintbrushAppearance,
  selectBundledPaintbrushAppearance,
  bundledTileSets,
  bundledTileAppearancesForSet,
  paintbrushAppearanceKey,
  paintbrushAppearanceSetId,
} = useGmTools();

const colorModalOpen = ref(false);
const galleryOpen = ref(false);

function closeGallery() {
  galleryOpen.value = false;
}

function toggleGallery() {
  galleryOpen.value = !galleryOpen.value;
}

function onSelectAppearance(key: string) {
  selectBundledPaintbrushAppearance(key);
  closeGallery();
}

function onGalleryKeydown(e: KeyboardEvent) {
  if (e.key !== "Escape" || !galleryOpen.value) return;
  e.preventDefault();
  e.stopPropagation();
  closeGallery();
}

watch(galleryOpen, (open) => {
  if (open) {
    document.addEventListener("keydown", onGalleryKeydown, true);
  } else {
    document.removeEventListener("keydown", onGalleryKeydown, true);
  }
});

watch(paintbrushAppearanceSetId, closeGallery);

onUnmounted(() => {
  document.removeEventListener("keydown", onGalleryKeydown, true);
});

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
      <input
        v-model="paintbrushEnableElevation"
        type="checkbox"
        class="option-enable"
        aria-label="Enable elevation"
      />
      <NumberStepper v-model="paintbrushElevation" :min="-3" :max="3" />
    </div>
    <div class="control-group">
      <span class="control-label">Terrain</span>
      <input
        v-model="paintbrushEnableTerrain"
        type="checkbox"
        class="option-enable"
        aria-label="Enable terrain"
      />
      <select v-model="paintbrushTerrain" class="effect-select terrain-select">
        <option v-for="terrain in TERRAIN_TYPES" :key="terrain" :value="terrain">
          {{ terrainTypeDisplayName(terrain) }}
        </option>
      </select>
    </div>
    <div class="control-group effect-group">
      <span class="control-label">Effect</span>
      <input
        v-model="paintbrushEnableEffect"
        type="checkbox"
        class="option-enable"
        aria-label="Enable effect"
      />
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
      <input
        v-model="paintbrushEnableName"
        type="checkbox"
        class="option-enable"
        aria-label="Enable name"
      />
      <input v-model="paintbrushTileName" type="text" class="text-input" placeholder="Optional" />
    </div>
    <div class="control-group">
      <span class="control-label">Color</span>
      <input
        v-model="paintbrushEnableColor"
        type="checkbox"
        class="option-enable"
        aria-label="Enable color"
      />
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
      <input
        v-model="paintbrushEnableAppearance"
        type="checkbox"
        class="option-enable"
        aria-label="Enable appearance"
      />
      <img
        v-if="paintbrushAppearancePreviewUrl"
        :src="paintbrushAppearancePreviewUrl"
        alt=""
        class="appearance-thumb tile-image"
      />
      <select
        v-if="bundledTileSets.length"
        v-model="paintbrushAppearanceSetId"
        class="effect-select set-select"
        aria-label="Tile set"
      >
        <option v-for="set in bundledTileSets" :key="set.id" :value="set.id">
          {{ set.label }}
        </option>
      </select>
      <div v-if="bundledTileAppearancesForSet.length" class="appearance-gallery">
        <button
          type="button"
          class="gallery-toggle"
          :aria-expanded="galleryOpen"
          aria-haspopup="listbox"
          @click="toggleGallery"
        >
          Gallery
        </button>
        <template v-if="galleryOpen">
          <div class="gallery-backdrop" @click="closeGallery" />
          <div class="gallery-menu" role="listbox" @click.stop>
            <button
              v-for="item in bundledTileAppearancesForSet"
              :key="item.key"
              type="button"
              role="option"
              class="gallery-item"
              :class="{ selected: paintbrushAppearanceKey === item.key }"
              :aria-selected="paintbrushAppearanceKey === item.key"
              @click="onSelectAppearance(item.key)"
            >
              <img :src="item.url" alt="" class="gallery-thumb tile-image" />
              <span class="gallery-name">{{ item.name }}</span>
            </button>
          </div>
        </template>
      </div>
      <label class="upload-btn" :class="{ uploading: paintbrushAppearanceUploading }">
        {{ paintbrushAppearanceUploading ? "Uploading…" : "Upload" }}
        <input
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

    <button type="button" class="mini-btn" @click="enableAllPaintbrushOptions">Enable all</button>
    <button type="button" class="mini-btn" @click="disableAllPaintbrushOptions">Disable all</button>
    <button type="button" class="reset-btn" @click="resetPaintbrushSettings">Reset</button>

    <span class="eyedropper-hint">Hold E to sample a tile</span>

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

.option-enable {
  margin: 0;
  cursor: pointer;
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

.set-select {
  max-width: 8rem;
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

.appearance-gallery {
  position: relative;
}

.gallery-toggle {
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

.gallery-toggle[aria-expanded="true"] {
  color: var(--color-text);
  background: var(--color-surface-raised);
}

.gallery-backdrop {
  position: fixed;
  inset: 0;
  z-index: 19;
}

.gallery-menu {
  position: absolute;
  top: calc(100% + 0.25rem);
  left: 0;
  z-index: 20;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  min-width: 9rem;
  max-height: 12rem;
  overflow-y: auto;
  padding: 0.35rem;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-surface);
  box-shadow: var(--shadow-menu);
}

.gallery-item {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  width: 100%;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--color-text);
  font-size: 0.78rem;
  font-family: inherit;
  padding: 0.25rem 0.35rem;
  cursor: pointer;
  text-align: left;
}

.gallery-item:hover,
.gallery-item.selected {
  background: var(--color-surface-raised);
  border-color: var(--color-border);
}

.gallery-thumb {
  width: 1.4rem;
  height: 1.4rem;
  object-fit: cover;
  border-radius: 4px;
  border: 1px solid var(--color-border);
  flex-shrink: 0;
}

.gallery-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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

.eyedropper-hint {
  width: 100%;
  font-size: 0.75rem;
  color: var(--color-text-muted);
}
</style>
