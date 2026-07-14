<script setup lang="ts">
import { TERRAIN_TYPES, TILE_EFFECTS, terrainTypeDisplayName } from "@gaem/shared";
import { ref } from "vue";

import {
  useGmTools,
  GM_TILE_EFFECT_NONE,
} from "../composables/useGmTools.js";
import { useTileBrushGalleryUi } from "../composables/useTileBrushGalleryUi.js";
import EffectIcon from "./EffectIcon.vue";
import NumberStepper from "./NumberStepper.vue";
import TerrainTypeIcon from "./TerrainTypeIcon.vue";
import TileBaseColorModal from "./TileBaseColorModal.vue";
import TileColorTintModal from "./TileColorTintModal.vue";

const {
  paintbrushElevation,
  paintbrushTerrain,
  paintbrushEffectId,
  paintbrushEffectStacks,
  paintbrushTileName,
  paintbrushObstacleHp,
  paintbrushBaseColor,
  paintbrushAppearanceTint,
  paintbrushFeatureTint,
  paintbrushAppearancePreviewUrl,
  paintbrushEnableElevation,
  paintbrushEnableTerrain,
  paintbrushEnableEffect,
  paintbrushEnableObstacleHp,
  paintbrushEnableName,
  paintbrushEnableColor,
  paintbrushEnableAppearance,
  paintbrushEnableFeature,
  paintbrushEnableAppearanceTint,
  paintbrushEnableFeatureTint,
  paintbrushEnableRotation,
  paintbrushEnableFlip,
  paintbrushImageRotation,
  paintbrushImageFlip,
  paintbrushAutoRotate,
  paintbrushPresetLoadId,
  paintbrushPresetNames,
  paintbrushPresetError,
  paintbrushAppearanceUploading,
  paintbrushFeatureUploading,
  paintbrushFeaturePreviewUrl,
  resetPaintbrushSettings,
  enableAllPaintbrushOptions,
  disableAllPaintbrushOptions,
  loadSelectedPreset,
  saveCurrentPreset,
  deleteSelectedPreset,
  uploadPaintbrushAppearance,
  clearPaintbrushAppearance,
  uploadPaintbrushFeature,
  clearPaintbrushFeature,
  bundledTileSets,
  bundledTileAppearancesForSet,
  bundledTileFeatureSets,
  bundledTileFeaturesForSet,
  paintbrushAppearanceSetId,
  paintbrushFeatureSetId,
} = useGmTools();

const {
  appearanceGalleryOpen,
  featureGalleryOpen,
  openAppearanceGallery,
  openFeatureGallery,
  toggleAppearanceGallery,
  toggleFeatureGallery,
} = useTileBrushGalleryUi();

const colorModalOpen = ref(false);
const appearanceTintModalOpen = ref(false);
const featureTintModalOpen = ref(false);

function onAppearanceSelected(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (file) void uploadPaintbrushAppearance(file);
}

function onFeatureSelected(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (file) void uploadPaintbrushFeature(file);
}
</script>

<template>
  <div class="paintbrush-controls">
    <div class="action-row">
      <button type="button" class="mini-btn" @click="enableAllPaintbrushOptions">Enable all</button>
      <button type="button" class="mini-btn" @click="disableAllPaintbrushOptions">Disable all</button>
      <button type="button" class="reset-btn" @click="resetPaintbrushSettings">Reset</button>
    </div>

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
    <div class="control-group effect-group">
      <span class="control-label">Terrain</span>
      <input
        v-model="paintbrushEnableTerrain"
        type="checkbox"
        class="option-enable"
        aria-label="Enable terrain"
      />
      <select v-model="paintbrushTerrain" class="effect-select">
        <option v-for="terrain in TERRAIN_TYPES" :key="terrain" :value="terrain">
          {{ terrainTypeDisplayName(terrain) }}
        </option>
      </select>
      <TerrainTypeIcon :terrain-type="paintbrushTerrain" :size="16" />
    </div>
    <div v-if="paintbrushTerrain === 'obstacle'" class="control-group">
      <span class="control-label">Obstacle HP</span>
      <input
        v-model="paintbrushEnableObstacleHp"
        type="checkbox"
        class="option-enable"
        aria-label="Enable obstacle HP"
      />
      <NumberStepper v-model="paintbrushObstacleHp" :min="1" :max="99" />
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
      <span class="option-enable-spacer" aria-hidden="true" />
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
      <div class="appearance-controls">
        <select
          v-if="bundledTileSets.length"
          v-model="paintbrushAppearanceSetId"
          class="effect-select"
          aria-label="Tile set"
          @change="openAppearanceGallery"
        >
          <option v-for="set in bundledTileSets" :key="set.id" :value="set.id">
            {{ set.label }}
          </option>
        </select>
        <div class="appearance-row">
          <div v-if="bundledTileAppearancesForSet.length" class="appearance-gallery">
            <button
              type="button"
              class="appearance-thumb-btn"
              :aria-expanded="appearanceGalleryOpen"
              aria-haspopup="listbox"
              aria-label="Choose tile appearance"
              @click="toggleAppearanceGallery"
            >
              <img
                v-if="paintbrushAppearancePreviewUrl"
                :src="paintbrushAppearancePreviewUrl"
                alt=""
                class="appearance-thumb tile-image"
              />
              <span v-else class="appearance-thumb-placeholder">—</span>
            </button>
          </div>
          <img
            v-else-if="paintbrushAppearancePreviewUrl"
            :src="paintbrushAppearancePreviewUrl"
            alt=""
            class="appearance-thumb tile-image"
          />
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
      </div>
    </div>

    <div class="control-group">
      <span class="control-label">Color tint</span>
      <input
        v-model="paintbrushEnableAppearanceTint"
        type="checkbox"
        class="option-enable"
        aria-label="Enable appearance color tint"
      />
      <button
        type="button"
        class="color-swatch-btn"
        :style="paintbrushAppearanceTint ? { background: paintbrushAppearanceTint.color } : undefined"
        aria-label="Appearance color tint"
        @click="appearanceTintModalOpen = true"
      >
        <span v-if="!paintbrushAppearanceTint" class="color-swatch-placeholder">—</span>
      </button>
    </div>

    <div class="control-group appearance-group">
      <span class="control-label">Feature</span>
      <input
        v-model="paintbrushEnableFeature"
        type="checkbox"
        class="option-enable"
        aria-label="Enable feature"
      />
      <div class="appearance-controls">
        <select
          v-if="bundledTileFeatureSets.length"
          v-model="paintbrushFeatureSetId"
          class="effect-select"
          aria-label="Feature set"
          @change="openFeatureGallery"
        >
          <option v-for="set in bundledTileFeatureSets" :key="set.id" :value="set.id">
            {{ set.label }}
          </option>
        </select>
        <div class="appearance-row">
          <div v-if="bundledTileFeaturesForSet.length" class="appearance-gallery">
            <button
              type="button"
              class="appearance-thumb-btn"
              :aria-expanded="featureGalleryOpen"
              aria-haspopup="listbox"
              aria-label="Choose tile feature"
              @click="toggleFeatureGallery"
            >
              <img
                v-if="paintbrushFeaturePreviewUrl"
                :src="paintbrushFeaturePreviewUrl"
                alt=""
                class="appearance-thumb tile-image"
              />
              <span v-else class="appearance-thumb-placeholder">—</span>
            </button>
          </div>
          <img
            v-else-if="paintbrushFeaturePreviewUrl"
            :src="paintbrushFeaturePreviewUrl"
            alt=""
            class="appearance-thumb tile-image"
          />
          <label class="upload-btn" :class="{ uploading: paintbrushFeatureUploading }">
            {{ paintbrushFeatureUploading ? "Uploading…" : "Upload" }}
            <input
              type="file"
              accept="image/png"
              class="hidden-input"
              :disabled="paintbrushFeatureUploading"
              @change="onFeatureSelected"
            />
          </label>
          <button
            v-if="paintbrushFeaturePreviewUrl"
            type="button"
            class="mini-btn"
            @click="clearPaintbrushFeature"
          >
            Clear
          </button>
        </div>
      </div>
    </div>

    <div class="control-group">
      <span class="control-label">Color tint</span>
      <input
        v-model="paintbrushEnableFeatureTint"
        type="checkbox"
        class="option-enable"
        aria-label="Enable feature color tint"
      />
      <button
        type="button"
        class="color-swatch-btn"
        :style="paintbrushFeatureTint ? { background: paintbrushFeatureTint.color } : undefined"
        aria-label="Feature color tint"
        @click="featureTintModalOpen = true"
      >
        <span v-if="!paintbrushFeatureTint" class="color-swatch-placeholder">—</span>
      </button>
    </div>

    <div class="control-group">
      <span class="control-label">Rotate</span>
      <input
        v-model="paintbrushEnableRotation"
        type="checkbox"
        class="option-enable"
        aria-label="Enable rotation"
      />
      <label class="auto-rotate">
        <input
          v-model="paintbrushAutoRotate"
          type="checkbox"
          :disabled="!paintbrushEnableRotation"
          aria-label="Auto rotate"
        />
        Auto
      </label>
      <span class="transform-value">
        {{ paintbrushAutoRotate ? "Random" : `${paintbrushImageRotation}°` }}
      </span>
      <span class="transform-hint">R</span>
    </div>
    <div class="control-group">
      <span class="control-label">Flip</span>
      <input
        v-model="paintbrushEnableFlip"
        type="checkbox"
        class="option-enable"
        aria-label="Enable flip"
      />
      <span class="transform-value">{{ paintbrushImageFlip ? "On" : "Off" }}</span>
      <span class="transform-hint">F</span>
    </div>

    <div class="control-group preset-group">
      <span class="control-label">Preset</span>
      <span class="option-enable-spacer" aria-hidden="true" />
      <div class="preset-controls">
        <select v-model="paintbrushPresetLoadId" class="effect-select">
          <option value="">Load…</option>
          <option v-for="name in paintbrushPresetNames" :key="name" :value="name">
            {{ name }}
          </option>
        </select>
        <div class="preset-actions">
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
      </div>
    </div>

    <p v-if="paintbrushPresetError" class="preset-error">{{ paintbrushPresetError }}</p>

    <p class="eyedropper-hint">Hold E to sample · R rotate · F flip</p>

    <TileBaseColorModal v-model="paintbrushBaseColor" :open="colorModalOpen" @close="colorModalOpen = false" />
    <TileColorTintModal
      v-model="paintbrushAppearanceTint"
      title="Appearance color tint"
      :open="appearanceTintModalOpen"
      :preview-url="paintbrushAppearancePreviewUrl"
      @close="appearanceTintModalOpen = false"
    />
    <TileColorTintModal
      v-model="paintbrushFeatureTint"
      title="Feature color tint"
      :open="featureTintModalOpen"
      :preview-url="paintbrushFeaturePreviewUrl"
      @close="featureTintModalOpen = false"
    />
  </div>
</template>

<style scoped>
.paintbrush-controls {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.control-group {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  flex-wrap: wrap;
}

.control-label {
  flex: 0 0 5rem;
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--color-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.option-enable {
  flex-shrink: 0;
  margin: 0;
  cursor: pointer;
}

.option-enable-spacer {
  width: 1rem;
  flex-shrink: 0;
}

.effect-group {
  gap: 0.35rem;
}

.effect-select,
.text-input {
  flex: 1;
  min-width: 0;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-surface);
  color: var(--color-text);
  font-size: 0.8rem;
  font-family: inherit;
  padding: 0.25rem 0.4rem;
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
  align-items: flex-start;
}

.appearance-controls {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.appearance-row {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex-wrap: wrap;
}

.appearance-thumb {
  width: 1.6rem;
  height: 1.6rem;
  object-fit: cover;
  border-radius: 4px;
  border: 1px solid var(--color-border);
  display: block;
}

.appearance-thumb-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.6rem;
  height: 1.6rem;
  padding: 0;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-surface-raised);
  cursor: pointer;
}

.appearance-thumb-btn:hover,
.appearance-thumb-btn[aria-expanded="true"] {
  border-color: var(--color-text-muted);
}

.appearance-thumb-btn .appearance-thumb {
  border: none;
  border-radius: 3px;
}

.appearance-thumb-placeholder {
  font-size: 0.75rem;
  color: var(--color-muted);
  line-height: 1;
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

.preset-controls {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.preset-actions,
.action-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
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
  margin: 0;
  font-size: 0.75rem;
  color: var(--color-danger);
}

.eyedropper-hint {
  margin: 0;
  font-size: 0.75rem;
  color: var(--color-text-muted);
}

.transform-value {
  font-size: 0.8rem;
  color: var(--color-text);
  min-width: 2.5rem;
}

.auto-rotate {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--color-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  cursor: pointer;
  user-select: none;
}

.auto-rotate input {
  margin: 0;
}

.auto-rotate:has(input:disabled) {
  opacity: 0.5;
  cursor: default;
}

.transform-hint {
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--color-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
</style>
