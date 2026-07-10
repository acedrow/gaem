<script setup lang="ts">
import {
  defaultOverworldParty,
  getFactionForRegion,
  listOverworldDeployDestinations,
  listOverworldTravelDestinations,
  OVERWORLD_HEIGHT,
  OVERWORLD_QUARTER_WIDTH,
  OVERWORLD_QUARTER_HEIGHT,
  OVERWORLD_REGION_FACTIONS,
  OVERWORLD_TRAVEL_FUEL_COST,
  OVERWORLD_WIDTH,
  type OverworldRegion,
  type OverworldRegionId,
} from "@gaem/shared";
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";

import { useApi } from "../composables/useApi.js";
import { useBoardViewport } from "../composables/useBoardViewport.js";
import { useFactionSelection } from "../composables/useFactionSelection.js";
import { useGameState } from "../composables/useGameState.js";
import { activeMainTab } from "../composables/useMainSectionTab.js";
import { useSession } from "../composables/useSession.js";
import { showToast } from "../composables/useToasts.js";
import skullUrl from "../assets/skull.svg";
import OverworldReconOverlay from "./OverworldReconOverlay.vue";

const CELL = 64;
const QUARTER = CELL / 2;
const DIS_NODE = 72;
const DIS_GAP = 56;
const boardWidthPx = OVERWORLD_WIDTH * CELL;
const boardHeightPx = OVERWORLD_HEIGHT * CELL;
const contentWidthPx = computed(() => boardWidthPx);
const contentHeightPx = computed(() => boardHeightPx + DIS_GAP + DIS_NODE);

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
const travelMode = ref(false);
const deployMode = ref(false);

const imageUrls = ref<Partial<Record<OverworldRegionId, string>>>({});
const loadedKeys = new Map<OverworldRegionId, string>();

const regions = computed((): OverworldRegion[] => {
  const list = gameState.value?.overworldRegions;
  if (list && list.length === 3) return list;
  return [{ id: "west" }, { id: "center" }, { id: "east" }];
});

const party = computed(() => gameState.value?.overworldParty ?? defaultOverworldParty());
const atDis = computed(() => party.value.atDis === true);

const travelDestKeys = computed(() => {
  if (!travelMode.value || atDis.value) return new Set<string>();
  return new Set(
    listOverworldTravelDestinations(party.value).map((d) => `${d.qx},${d.qy}`),
  );
});

const deployDestKeys = computed(() => {
  if (!deployMode.value || !atDis.value) return new Set<string>();
  return new Set(listOverworldDeployDestinations().map((d) => `${d.qx},${d.qy}`));
});

const quarterCells = computed(() =>
  Array.from({ length: OVERWORLD_QUARTER_WIDTH * OVERWORLD_QUARTER_HEIGHT }, (_, i) => {
    const qx = i % OVERWORLD_QUARTER_WIDTH;
    const qy = Math.floor(i / OVERWORLD_QUARTER_WIDTH);
    return { key: `${qx},${qy}`, qx, qy };
  }),
);

const partyTokenStyle = computed(() => ({
  left: `${party.value.qx * QUARTER}px`,
  top: `${party.value.qy * QUARTER}px`,
  width: `${QUARTER}px`,
  height: `${QUARTER}px`,
}));

const disLineEnds = computed(() => {
  const topY = 0;
  const bottomY = DIS_GAP + DIS_NODE / 2;
  const disX = boardWidthPx / 2;
  return [
    { x1: boardWidthPx / 6, y1: topY, x2: disX, y2: bottomY },
    { x1: boardWidthPx / 2, y1: topY, x2: disX, y2: bottomY },
    { x1: (boardWidthPx * 5) / 6, y1: topY, x2: disX, y2: bottomY },
  ];
});

function regionFactionName(regionId: OverworldRegionId): string {
  return getFactionForRegion(regionId).name;
}

function isRegionSelected(regionId: OverworldRegionId): boolean {
  return selectedFactionId.value === getFactionForRegion(regionId).id;
}

function isRegionDefeated(regionId: OverworldRegionId): boolean {
  const factionId = OVERWORLD_REGION_FACTIONS[regionId];
  return gameState.value?.factionStates?.[factionId]?.defeated === true;
}

function onSelectRegion(regionId: OverworldRegionId) {
  if (travelMode.value || deployMode.value) return;
  selectFaction(getFactionForRegion(regionId).id);
}

function isTravelDest(qx: number, qy: number): boolean {
  return travelDestKeys.value.has(`${qx},${qy}`);
}

function isDeployDest(qx: number, qy: number): boolean {
  return deployDestKeys.value.has(`${qx},${qy}`);
}

function isHitDest(qx: number, qy: number): boolean {
  return isTravelDest(qx, qy) || isDeployDest(qx, qy);
}

function onQuarterClick(qx: number, qy: number) {
  if (deployMode.value) {
    if (!isDeployDest(qx, qy)) {
      deployMode.value = false;
      return;
    }
    send({ type: "overworldCampaignAction", action: { kind: "deployToHell", qx, qy } });
    deployMode.value = false;
    return;
  }
  if (!travelMode.value) return;
  if (!isTravelDest(qx, qy)) {
    travelMode.value = false;
    return;
  }
  if (party.value.fuel < OVERWORLD_TRAVEL_FUEL_COST) {
    showToast("Not enough fuel", "error");
    return;
  }
  send({ type: "overworldCampaignAction", action: { kind: "travel", qx, qy } });
  travelMode.value = false;
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") {
    if (travelMode.value) travelMode.value = false;
    if (deployMode.value) deployMode.value = false;
  }
}

const {
  scale,
  fitScale,
  stageStyle,
  isTransformed,
  fitToView,
  restoreOrFit,
  onWheel,
  observeViewport,
  disconnect,
} = useBoardViewport(viewportEl, contentWidthPx, contentHeightPx, isReady, viewportKey);

const showQuarters = computed(
  () =>
    travelMode.value ||
    deployMode.value ||
    (fitScale.value > 0 && scale.value / fitScale.value >= 2),
);

watch(viewportEl, (el, prev) => {
  observeViewport(el, prev);
});

watch(
  () => activeMainTab.value,
  (tab) => {
    if (tab === "overworld") nextTick(restoreOrFit);
    else {
      travelMode.value = false;
      deployMode.value = false;
    }
  },
);

watch(atDis, (inDis) => {
  if (inDis) travelMode.value = false;
  else deployMode.value = false;
});

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

onMounted(() => {
  window.addEventListener("keydown", onKeydown);
});

onUnmounted(() => {
  window.removeEventListener("keydown", onKeydown);
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
    <OverworldReconOverlay v-model:travel-mode="travelMode" v-model:deploy-mode="deployMode" />
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
        <div
          class="overworld-board"
          :style="{ width: `${boardWidthPx}px`, height: `${boardHeightPx}px` }"
        >
          <div class="regions">
            <div
              v-for="region in regions"
              :key="region.id"
              class="region"
              :class="{
                'region--empty': !imageUrls[region.id],
                'region--selected': isRegionSelected(region.id),
                'region--defeated': isRegionDefeated(region.id),
              }"
              role="button"
              tabindex="0"
              :aria-label="
                regionFactionName(region.id) +
                ' territory' +
                (isRegionDefeated(region.id) ? ', defeated' : '')
              "
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
              <div
                v-if="isRegionDefeated(region.id)"
                class="region-defeated-overlay"
                aria-hidden="true"
              >
                <img class="region-skull" :src="skullUrl" alt="" draggable="false" />
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
            :class="{ 'grid-overlay--quarters': showQuarters }"
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
          <div
            v-if="travelMode || deployMode"
            class="quarter-hit-layer"
            :style="{
              gridTemplateColumns: `repeat(${OVERWORLD_QUARTER_WIDTH}, 1fr)`,
              gridTemplateRows: `repeat(${OVERWORLD_QUARTER_HEIGHT}, 1fr)`,
            }"
          >
            <button
              v-for="cell in quarterCells"
              :key="cell.key"
              type="button"
              class="quarter-hit"
              :class="{ 'quarter-hit--dest': isHitDest(cell.qx, cell.qy) }"
              :aria-label="
                isTravelDest(cell.qx, cell.qy)
                  ? `Travel to ${cell.qx}, ${cell.qy}`
                  : isDeployDest(cell.qx, cell.qy)
                    ? `Deploy to ${cell.qx}, ${cell.qy}`
                    : undefined
              "
              :tabindex="isHitDest(cell.qx, cell.qy) ? 0 : -1"
              @click="onQuarterClick(cell.qx, cell.qy)"
            />
          </div>
          <div
            v-if="!atDis"
            class="party-token"
            :style="partyTokenStyle"
            aria-label="Party"
            title="Party"
          >
            <span class="party-token-dot" />
          </div>
        </div>
        <div
          class="dis-spur"
          :style="{ width: `${boardWidthPx}px`, height: `${DIS_GAP + DIS_NODE}px` }"
        >
          <svg
            class="dis-lines"
            :viewBox="`0 0 ${boardWidthPx} ${DIS_GAP + DIS_NODE}`"
            aria-hidden="true"
          >
            <line
              v-for="line in disLineEnds"
              :key="`${line.x1},${line.y1}`"
              :x1="line.x1"
              :y1="line.y1"
              :x2="line.x2"
              :y2="line.y2"
            />
          </svg>
          <div
            class="dis-node"
            :style="{ width: `${DIS_NODE}px`, height: `${DIS_NODE}px` }"
            aria-label="DIS"
            title="DIS"
          >
            <span class="dis-node-label">DIS</span>
            <span
              v-if="atDis"
              class="party-token-dot party-token-dot--on-dis"
              aria-label="Party in DIS"
              title="Party in DIS"
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

.overworld-root > :deep(.recon-overlay) {
  position: absolute;
  top: 0.75rem;
  right: 0.75rem;
  z-index: 5;
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
  display: flex;
  flex-direction: column;
  transform-origin: 0 0;
  will-change: transform;
}

.overworld-board {
  position: relative;
  flex-shrink: 0;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  overflow: hidden;
}

.dis-spur {
  position: relative;
  flex-shrink: 0;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.dis-lines {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  overflow: visible;
}

.dis-lines line {
  stroke: var(--color-border);
  stroke-width: 2;
}

.dis-node {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.2rem;
  border-radius: 50%;
  border: 2px solid var(--color-border);
  background: var(--color-surface);
  box-shadow: var(--shadow-popover);
}

.dis-node-label {
  font-family: var(--font-heading);
  font-size: 0.95rem;
  letter-spacing: 0.08em;
  color: var(--color-text);
  pointer-events: none;
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

.region--defeated .region-image,
.region--defeated .region-placeholder {
  filter: grayscale(1) brightness(0.55);
}

.region-defeated-overlay {
  position: absolute;
  inset: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.35);
  pointer-events: none;
}

.region-skull {
  width: min(42%, 7rem);
  height: auto;
  opacity: 0.85;
  filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.6));
  pointer-events: none;
  user-select: none;
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
  border-right: 2px solid var(--color-border);
  border-bottom: 2px solid var(--color-border);
  opacity: 0.45;
}

.grid-overlay--quarters .grid-cell {
  background-image:
    linear-gradient(var(--color-border), var(--color-border)),
    linear-gradient(var(--color-border), var(--color-border));
  background-size: 1px 100%, 100% 1px;
  background-position: center, center;
  background-repeat: no-repeat;
}

.quarter-hit-layer {
  position: absolute;
  inset: 0;
  display: grid;
  z-index: 3;
}

.quarter-hit {
  margin: 0;
  padding: 0;
  border: none;
  background: transparent;
  cursor: default;
}

.quarter-hit--dest {
  cursor: pointer;
  outline: 1px dashed var(--color-purple-outline-strong);
  outline-offset: -1px;
  background: var(--color-purple-faint-bg);
}

.quarter-hit--dest:hover {
  background: var(--color-accent-hover-bg);
}

.party-token {
  position: absolute;
  z-index: 4;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.party-token-dot {
  width: 58%;
  height: 58%;
  border-radius: 50%;
  background: var(--color-accent);
  border: 2px solid var(--color-bg);
  box-shadow: 0 0 0 1px var(--color-accent-bright);
}

.party-token-dot--on-dis {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
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
