<script setup lang="ts">
import {
  getFactionForRegion,
  OVERWORLD_HEIGHT,
  OVERWORLD_WIDTH,
  type OverworldRegion,
  type OverworldRegionId,
} from "@gaem/shared";
import { computed, nextTick, onUnmounted, ref, watch } from "vue";

import { useApi } from "../composables/useApi.js";
import { useBoardViewport } from "../composables/useBoardViewport.js";
import { useFactionSelection } from "../composables/useFactionSelection.js";
import { useGameState } from "../composables/useGameState.js";
import { activeMainTab } from "../composables/useMainSectionTab.js";
import { useSession } from "../composables/useSession.js";
import { showToast } from "../composables/useToasts.js";

const CELL = 64;
const contentWidthPx = computed(() => OVERWORLD_WIDTH * CELL);
const contentHeightPx = computed(() => OVERWORLD_HEIGHT * CELL);

const { gameState, send } = useGameState();
const { hasGmCapabilities } = useSession();
const { uploadRegionImage, fetchRegionImageUrl } = useApi();
const { selectedFactionId, selectFaction } = useFactionSelection();

const viewportEl = ref<HTMLElement | null>(null);
const viewportKey = ref("overworld");
const isReady = ref(true);
const uploadingRegionId = ref<OverworldRegionId | null>(null);
const fileInputEl = ref<HTMLInputElement | null>(null);
const pendingUploadRegionId = ref<OverworldRegionId | null>(null);

const imageUrls = ref<Partial<Record<OverworldRegionId, string>>>({});
const loadedKeys = new Map<OverworldRegionId, string>();

const regions = computed((): OverworldRegion[] => {
  const list = gameState.value?.overworldRegions;
  if (list && list.length === 3) return list;
  return [{ id: "west" }, { id: "center" }, { id: "east" }];
});

function regionFactionName(regionId: OverworldRegionId): string {
  return getFactionForRegion(regionId).name;
}

function isRegionSelected(regionId: OverworldRegionId): boolean {
  return selectedFactionId.value === getFactionForRegion(regionId).id;
}

function onSelectRegion(regionId: OverworldRegionId) {
  selectFaction(getFactionForRegion(regionId).id);
}

const {
  stageStyle,
  isTransformed,
  fitToView,
  restoreOrFit,
  onWheel,
  observeViewport,
  disconnect,
} = useBoardViewport(viewportEl, contentWidthPx, contentHeightPx, isReady, viewportKey);

watch(viewportEl, (el, prev) => {
  observeViewport(el, prev);
});

watch(
  () => activeMainTab.value,
  (tab) => {
    if (tab === "overworld") nextTick(restoreOrFit);
  },
);

async function syncRegionImages(list: OverworldRegion[]) {
  const nextUrls: Partial<Record<OverworldRegionId, string>> = { ...imageUrls.value };
  const keep = new Set<OverworldRegionId>();

  for (const region of list) {
    keep.add(region.id);
    const key = region.imageKey;
    if (!key) {
      const prev = nextUrls[region.id];
      if (prev) URL.revokeObjectURL(prev);
      delete nextUrls[region.id];
      loadedKeys.delete(region.id);
      continue;
    }
    if (loadedKeys.get(region.id) === key && nextUrls[region.id]) continue;
    const prev = nextUrls[region.id];
    if (prev) URL.revokeObjectURL(prev);
    const url = await fetchRegionImageUrl(key);
    if (url) {
      nextUrls[region.id] = url;
      loadedKeys.set(region.id, key);
    } else {
      delete nextUrls[region.id];
      loadedKeys.delete(region.id);
    }
  }

  for (const id of Object.keys(nextUrls) as OverworldRegionId[]) {
    if (!keep.has(id)) {
      const prev = nextUrls[id];
      if (prev) URL.revokeObjectURL(prev);
      delete nextUrls[id];
      loadedKeys.delete(id);
    }
  }

  imageUrls.value = nextUrls;
}

watch(
  regions,
  (list) => {
    void syncRegionImages(list);
  },
  { immediate: true, deep: true },
);

onUnmounted(() => {
  disconnect();
  for (const url of Object.values(imageUrls.value)) {
    if (url) URL.revokeObjectURL(url);
  }
});

function resetZoom() {
  fitToView(true);
}

function openUpload(regionId: OverworldRegionId) {
  if (!hasGmCapabilities.value || uploadingRegionId.value) return;
  pendingUploadRegionId.value = regionId;
  fileInputEl.value?.click();
}

async function onFileSelected(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  const regionId = pendingUploadRegionId.value;
  input.value = "";
  pendingUploadRegionId.value = null;
  if (!file || !regionId) return;

  uploadingRegionId.value = regionId;
  try {
    const key = await uploadRegionImage(file);
    if (!key) {
      showToast("Failed to upload region image", "error");
      return;
    }
    send({ type: "setOverworldRegionImage", regionId, imageKey: key });
  } finally {
    uploadingRegionId.value = null;
  }
}

const gridCells = computed(() =>
  Array.from({ length: OVERWORLD_WIDTH * OVERWORLD_HEIGHT }, (_, i) => i),
);
</script>

<template>
  <div class="overworld-root">
    <input
      ref="fileInputEl"
      class="region-file-input"
      type="file"
      accept="image/png,image/jpeg,image/webp"
      @change="onFileSelected"
    />
    <div
      ref="viewportEl"
      class="overworld-viewport"
      @wheel.prevent="onWheel"
    >
      <div
        class="overworld-stage"
        :style="[
          stageStyle,
          { width: `${contentWidthPx}px`, height: `${contentHeightPx}px` },
        ]"
      >
        <div class="overworld-board">
          <div class="regions">
            <div
              v-for="region in regions"
              :key="region.id"
              class="region"
              :class="{
                'region--empty': !imageUrls[region.id],
                'region--selected': isRegionSelected(region.id),
              }"
              role="button"
              tabindex="0"
              :aria-label="regionFactionName(region.id) + ' territory'"
              :aria-pressed="isRegionSelected(region.id)"
              @click="onSelectRegion(region.id)"
              @keydown.enter.prevent="onSelectRegion(region.id)"
              @keydown.space.prevent="onSelectRegion(region.id)"
            >
              <img
                v-if="imageUrls[region.id]"
                class="region-image"
                :src="imageUrls[region.id]"
                :alt="regionFactionName(region.id) + ' region'"
                draggable="false"
              />
              <div v-else class="region-placeholder">
                <span class="region-label">{{ regionFactionName(region.id) }}</span>
              </div>
              <button
                v-if="hasGmCapabilities"
                type="button"
                class="region-edit-btn"
                :class="{ uploading: uploadingRegionId === region.id }"
                :disabled="uploadingRegionId !== null"
                :aria-label="'Upload ' + regionFactionName(region.id) + ' region image'"
                @click.stop="openUpload(region.id)"
              >
                <svg class="region-edit-icon" viewBox="0 0 16 16" aria-hidden="true">
                  <path
                    d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.387 8.387L2.5 14.5l1.126-3.666 8.387-8.387z"
                    fill="currentColor"
                  />
                </svg>
              </button>
            </div>
          </div>
          <div
            class="grid-overlay"
            :style="{
              gridTemplateColumns: `repeat(${OVERWORLD_WIDTH}, 1fr)`,
              gridTemplateRows: `repeat(${OVERWORLD_HEIGHT}, 1fr)`,
            }"
            aria-hidden="true"
          >
            <div
              v-for="cell in gridCells"
              :key="cell"
              class="grid-cell"
            />
          </div>
        </div>
      </div>
      <button
        v-if="isTransformed"
        type="button"
        class="reset-zoom-btn"
        @click="resetZoom"
      >
        Reset zoom
      </button>
    </div>
  </div>
</template>

<style scoped>
.overworld-root {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.region-file-input {
  display: none;
}

.overworld-viewport {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.overworld-stage {
  position: relative;
  transform-origin: 0 0;
  will-change: transform;
}

.overworld-board {
  position: relative;
  width: 100%;
  height: 100%;
  aspect-ratio: 17 / 11;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  overflow: hidden;
}

.regions {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  width: 100%;
  height: 100%;
}

.region {
  position: relative;
  min-width: 0;
  min-height: 0;
  border-right: 1px solid var(--color-border);
  background: var(--color-bg);
  cursor: pointer;
}

.region:last-child {
  border-right: none;
}

.region--empty {
  background: var(--color-surface);
}

.region--selected {
  box-shadow: inset 0 0 0 2px var(--color-accent);
  z-index: 1;
}

.region:hover .region-placeholder,
.region--selected .region-placeholder {
  color: var(--color-text);
}

.region:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: -2px;
  z-index: 1;
}

.region-image {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  user-select: none;
  pointer-events: none;
}

.region-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  color: var(--color-text-secondary);
}

.region-label {
  text-transform: uppercase;
  font-size: 0.9rem;
  letter-spacing: 0.04em;
  opacity: 0.7;
}

.region-edit-btn {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-surface);
  color: var(--color-text);
  cursor: pointer;
  opacity: 0.9;
}

.region-edit-btn:hover:not(:disabled) {
  background: var(--color-surface-hover);
  border-color: var(--color-accent-muted);
}

.region-edit-btn:disabled {
  cursor: wait;
  opacity: 0.6;
}

.region-edit-btn.uploading {
  opacity: 0.5;
}

.region-edit-icon {
  width: 0.9rem;
  height: 0.9rem;
}

.grid-overlay {
  position: absolute;
  inset: 0;
  display: grid;
  pointer-events: none;
  z-index: 1;
}

.grid-cell {
  border-right: 1px solid var(--color-border);
  border-bottom: 1px solid var(--color-border);
  opacity: 0.45;
}

.reset-zoom-btn {
  position: absolute;
  bottom: 0.75rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 2;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-surface);
  color: var(--color-text);
  padding: 0.35rem 0.75rem;
  font-size: 0.8rem;
  cursor: pointer;
}

.reset-zoom-btn:hover {
  background: var(--color-surface-hover);
  border-color: var(--color-accent-muted);
}
</style>
