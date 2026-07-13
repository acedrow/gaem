<script setup lang="ts">
import { computed, nextTick, onUnmounted, watch } from "vue";

import { useGmTools } from "../composables/useGmTools.js";
import { useTileBrushGalleryUi } from "../composables/useTileBrushGalleryUi.js";
import TileBrushGallery from "./TileBrushGallery.vue";

const {
  bundledTileSets,
  bundledTileFeatureSets,
  bundledTileAppearancesForSet,
  bundledTileFeaturesForSet,
  paintbrushAppearanceKey,
  paintbrushFeatureKey,
  paintbrushAppearanceSetId,
  paintbrushFeatureSetId,
  selectBundledPaintbrushAppearance,
  selectBundledPaintbrushFeature,
  clearPaintbrushAppearance,
  clearPaintbrushFeature,
  activeTool,
} = useGmTools();

const {
  galleryOpen,
  appearanceGalleryOpen,
  closeGalleries,
} = useTileBrushGalleryUi();

let backdropArmed = false;

const setOptions = computed(() =>
  appearanceGalleryOpen.value ? bundledTileSets : bundledTileFeatureSets,
);

const activeSetId = computed({
  get: () =>
    appearanceGalleryOpen.value
      ? paintbrushAppearanceSetId.value
      : paintbrushFeatureSetId.value,
  set: (id: string) => {
    if (appearanceGalleryOpen.value) paintbrushAppearanceSetId.value = id;
    else paintbrushFeatureSetId.value = id;
  },
});

const activeSetLabel = computed(() => {
  const id = activeSetId.value;
  return setOptions.value.find((set) => set.id === id)?.label ?? id;
});

function stepSet(delta: number) {
  const sets = setOptions.value;
  if (sets.length === 0) return;
  const current = sets.findIndex((set) => set.id === activeSetId.value);
  const index = current < 0 ? 0 : (current + delta + sets.length) % sets.length;
  activeSetId.value = sets[index]!.id;
}

function onSelectAppearance(key: string) {
  selectBundledPaintbrushAppearance(key);
  closeGalleries();
}

function onSelectAppearanceNone() {
  clearPaintbrushAppearance();
  closeGalleries();
}

function onSelectFeature(key: string) {
  selectBundledPaintbrushFeature(key);
  closeGalleries();
}

function onSelectFeatureNone() {
  clearPaintbrushFeature();
  closeGalleries();
}

function onBackdropClick() {
  if (!backdropArmed) return;
  closeGalleries();
}

function onKeydown(e: KeyboardEvent) {
  if (e.key !== "Escape") return;
  if (!galleryOpen.value) return;
  e.preventDefault();
  e.stopPropagation();
  closeGalleries();
}

watch(galleryOpen, (open) => {
  backdropArmed = false;
  if (open) {
    document.addEventListener("keydown", onKeydown, true);
    void nextTick(() => {
      requestAnimationFrame(() => {
        backdropArmed = true;
      });
    });
  } else {
    document.removeEventListener("keydown", onKeydown, true);
  }
});

watch(activeTool, (tool) => {
  if (tool !== "paintbrush") closeGalleries();
});

onUnmounted(() => {
  document.removeEventListener("keydown", onKeydown, true);
});
</script>

<template>
  <template v-if="galleryOpen">
    <div class="gallery-backdrop" @click="onBackdropClick" />
    <div class="gallery-overlay" @click.stop>
      <div class="gallery-set-bar">
        <button
          type="button"
          class="set-step-btn"
          aria-label="Previous tile set"
          @click="stepSet(-1)"
        >
          ‹
        </button>
        <span class="set-title" :title="activeSetLabel">{{ activeSetLabel }}</span>
        <button
          type="button"
          class="set-step-btn"
          aria-label="Next tile set"
          @click="stepSet(1)"
        >
          ›
        </button>
      </div>
      <TileBrushGallery
        v-if="appearanceGalleryOpen"
        :entries="bundledTileAppearancesForSet"
        :selected-key="paintbrushAppearanceKey"
        ariaLabel="Choose tile appearance"
        @select="onSelectAppearance"
        @select-none="onSelectAppearanceNone"
      />
      <TileBrushGallery
        v-else
        :entries="bundledTileFeaturesForSet"
        :selected-key="paintbrushFeatureKey"
        ariaLabel="Choose tile feature"
        @select="onSelectFeature"
        @select-none="onSelectFeatureNone"
      />
    </div>
  </template>
</template>

<style scoped>
.gallery-backdrop {
  position: fixed;
  inset: 0;
  z-index: 19;
}

.gallery-overlay {
  position: absolute;
  z-index: 20;
  top: 0.75rem;
  left: 0.5rem;
  right: 0.5rem;
  height: min(18rem, calc(100% - 1.5rem));
  display: flex;
  flex-direction: column;
  min-height: 0;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-surface);
  box-shadow: var(--shadow-menu);
  overflow: hidden;
}

.gallery-set-bar {
  display: grid;
  grid-template-columns: 2rem 1fr 2rem;
  align-items: center;
  flex-shrink: 0;
  gap: 0.25rem;
  padding: 0.35rem 0.4rem;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-surface-raised);
}

.set-title {
  min-width: 0;
  text-align: center;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.set-step-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 1.75rem;
  padding: 0;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-surface);
  color: var(--color-text);
  font-size: 1.15rem;
  line-height: 1;
  font-family: inherit;
  cursor: pointer;
}

.set-step-btn:hover {
  background: var(--color-surface-hover, var(--color-surface-raised));
}
</style>
