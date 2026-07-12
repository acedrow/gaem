<script setup lang="ts">
import {
  defaultOverworldParty,
  FACTION_QUALITY_KEYS,
  getFactionById,
  getFactionForRegion,
  listOverworldDeployDestinations,
  listOverworldTravelDestinations,
  OVERWORLD_HEIGHT,
  OVERWORLD_QUARTER_WIDTH,
  OVERWORLD_QUARTER_HEIGHT,
  OVERWORLD_REGION_FACTIONS,
  OVERWORLD_TRAVEL_FUEL_COST,
  OVERWORLD_WIDTH,
  type FactionLocation,
  type FactionQualityDots,
  type OverworldLocation,
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
import locationUrl from "../assets/location.svg";
import skullUrl from "../assets/skull.svg";
import BoardContextMenu, { type BoardContextMenuItem } from "./BoardContextMenu.vue";
import ModalDialog from "./ModalDialog.vue";
import OverworldGmIchorOverlay from "./OverworldGmIchorOverlay.vue";
import OverworldReconOverlay from "./OverworldReconOverlay.vue";
import PlaceOverworldLocationModal from "./PlaceOverworldLocationModal.vue";

const CELL = 64;
const QUARTER = CELL / 2;
const DIS_NODE = 72;
const DIS_GAP = 56;
const boardWidthPx = OVERWORLD_WIDTH * CELL;
const boardHeightPx = OVERWORLD_HEIGHT * CELL;
const contentWidthPx = computed(() => boardWidthPx);
const contentHeightPx = computed(() => boardHeightPx + DIS_GAP + DIS_NODE);

const { gameState, send } = useGameState();
const { hasGmCapabilities, isGm } = useSession();
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
const selectedLocationId = ref<string | null>(null);

const contextMenu = ref<{
  open: boolean;
  x: number;
  y: number;
  qx: number;
  qy: number;
  items: BoardContextMenuItem[];
}>({ open: false, x: 0, y: 0, qx: 0, qy: 0, items: [] });

const placeModal = ref<{ open: boolean; qx: number | null; qy: number | null }>({
  open: false,
  qx: null,
  qy: null,
});

const removeModal = ref<{ open: boolean; location: OverworldLocation | null }>({
  open: false,
  location: null,
});

const imageUrls = ref<Partial<Record<OverworldRegionId, string>>>({});
const loadedKeys = new Map<OverworldRegionId, string>();

const regions = computed((): OverworldRegion[] => {
  const list = gameState.value?.overworldRegions;
  if (list && list.length === 3) return list;
  return [{ id: "west" }, { id: "center" }, { id: "east" }];
});

const party = computed(() => gameState.value?.overworldParty ?? defaultOverworldParty());
const atDis = computed(() => party.value.atDis === true);
const locations = computed(() => gameState.value?.overworldLocations ?? []);
const locationByKey = computed(() => {
  const map = new Map<string, OverworldLocation>();
  for (const loc of locations.value) {
    map.set(`${loc.qx},${loc.qy}`, loc);
  }
  return map;
});

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

function closeContextMenu() {
  contextMenu.value = { open: false, x: 0, y: 0, qx: 0, qy: 0, items: [] };
}

function onBoardContextMenu(e: MouseEvent) {
  if (!hasGmCapabilities.value || travelMode.value || deployMode.value) return;
  e.preventDefault();
  const board = e.currentTarget as HTMLElement;
  const rect = board.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    closeContextMenu();
    return;
  }
  const qx = Math.floor(((e.clientX - rect.left) / rect.width) * OVERWORLD_QUARTER_WIDTH);
  const qy = Math.floor(((e.clientY - rect.top) / rect.height) * OVERWORLD_QUARTER_HEIGHT);
  if (
    !Number.isInteger(qx) ||
    !Number.isInteger(qy) ||
    qx < 0 ||
    qy < 0 ||
    qx >= OVERWORLD_QUARTER_WIDTH ||
    qy >= OVERWORLD_QUARTER_HEIGHT
  ) {
    closeContextMenu();
    return;
  }
  const existing = locationByKey.value.get(`${qx},${qy}`);
  contextMenu.value = {
    open: true,
    x: e.clientX,
    y: e.clientY,
    qx,
    qy,
    items: existing
      ? [{ id: "remove-location", label: "Remove location", danger: true }]
      : [{ id: "place-location", label: "Place location" }],
  };
}

function onContextMenuSelect(id: string) {
  const { qx, qy } = contextMenu.value;
  closeContextMenu();
  if (id === "place-location") {
    placeModal.value = { open: true, qx, qy };
    return;
  }
  if (id === "remove-location") {
    const existing = locationByKey.value.get(`${qx},${qy}`);
    if (!existing) return;
    removeModal.value = { open: true, location: existing };
  }
}

function closePlaceModal() {
  placeModal.value = { open: false, qx: null, qy: null };
}

function closeRemoveModal() {
  removeModal.value = { open: false, location: null };
}

function confirmRemoveLocation() {
  const loc = removeModal.value.location;
  if (!loc) return;
  send({ type: "overworldLocationAction", action: { kind: "remove", locationId: loc.id } });
  closeRemoveModal();
}

function locationMarkerStyle(loc: OverworldLocation) {
  return {
    left: `${loc.qx * QUARTER}px`,
    top: `${loc.qy * QUARTER}px`,
    width: `${QUARTER}px`,
    height: `${QUARTER}px`,
  };
}

function catalogLocation(loc: OverworldLocation): FactionLocation | undefined {
  const faction = getFactionById(loc.factionId);
  if (!faction) return undefined;
  return [...faction.startingLocations, ...faction.uniqueLocations].find(
    (entry) => entry.name === loc.name,
  );
}

function formatLocationQuality(quality: Partial<FactionQualityDots> | undefined): string {
  if (!quality) return "";
  return FACTION_QUALITY_KEYS.filter((key) => quality[key] != null)
    .map((key) => `${key.charAt(0).toUpperCase() + key.slice(1)} ${quality[key]}`)
    .join(", ");
}

function locationMeta(loc: FactionLocation): string {
  const parts: string[] = [];
  if (loc.type) parts.push(loc.type);
  if (loc.buildTime != null) parts.push(`Build ${"Θ".repeat(loc.buildTime)}`);
  const q = formatLocationQuality(loc.quality);
  if (q) parts.push(q);
  return parts.join(" · ");
}

const locationMarkers = computed(() =>
  locations.value.map((loc) => {
    const catalog = catalogLocation(loc);
    return {
      loc,
      catalog,
      meta: catalog ? locationMeta(catalog) : "",
    };
  }),
);

function onLocationClick(loc: OverworldLocation) {
  if (travelMode.value || deployMode.value) return;
  if (selectedLocationId.value === loc.id) {
    selectedLocationId.value = null;
    fitToView(true);
    return;
  }
  selectedLocationId.value = loc.id;
  focusOnRect(loc.qx * QUARTER, loc.qy * QUARTER, QUARTER, QUARTER);
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") {
    if (travelMode.value) travelMode.value = false;
    if (deployMode.value) deployMode.value = false;
    if (contextMenu.value.open) closeContextMenu();
    if (selectedLocationId.value) selectedLocationId.value = null;
  }
}

const {
  scale,
  fitScale,
  stageStyle,
  isTransformed,
  fitToView,
  focusOnRect,
  restoreOrFit,
  onWheel,
  observeViewport,
  disconnect,
} = useBoardViewport(viewportEl, contentWidthPx, contentHeightPx, isReady, viewportKey);

function clearLocationSelection() {
  if (selectedLocationId.value) selectedLocationId.value = null;
}

function onViewportWheel(e: WheelEvent) {
  clearLocationSelection();
  onWheel(e);
}

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
      selectedLocationId.value = null;
    }
  },
);

watch([travelMode, deployMode], ([travel, deploy]) => {
  if (travel || deploy) selectedLocationId.value = null;
});

watch(locations, (list) => {
  if (selectedLocationId.value && !list.some((loc) => loc.id === selectedLocationId.value)) {
    selectedLocationId.value = null;
  }
});

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
  selectedLocationId.value = null;
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
    <div class="overworld-side-stack">
      <OverworldReconOverlay v-model:travel-mode="travelMode" v-model:deploy-mode="deployMode" />
      <OverworldGmIchorOverlay v-if="isGm" />
    </div>
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
      @wheel.prevent="onViewportWheel"
      @click="clearLocationSelection"
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
          @contextmenu="onBoardContextMenu"
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
            v-for="marker in locationMarkers"
            :key="marker.loc.id"
            class="location-marker"
            :class="{
              'location-marker--selected': selectedLocationId === marker.loc.id,
              'location-marker--inert': travelMode || deployMode,
            }"
            :style="locationMarkerStyle(marker.loc)"
            role="button"
            tabindex="0"
            :aria-label="marker.loc.name"
            :aria-pressed="selectedLocationId === marker.loc.id"
            @click.stop="onLocationClick(marker.loc)"
            @keydown.enter.prevent="onLocationClick(marker.loc)"
            @keydown.space.prevent="onLocationClick(marker.loc)"
          >
            <img class="location-marker-icon" :src="locationUrl" alt="" draggable="false" />
            <div class="location-tooltip popover-tooltip">
              <div class="location-tooltip-name">{{ marker.loc.name }}</div>
              <template v-if="marker.catalog">
                <div v-if="marker.meta" class="location-tooltip-meta">{{ marker.meta }}</div>
                <p v-if="marker.catalog.description" class="location-tooltip-desc">
                  {{ marker.catalog.description }}
                </p>
                <p v-if="marker.catalog.purpose" class="location-tooltip-detail">
                  <span class="location-tooltip-label">Purpose</span> {{ marker.catalog.purpose }}
                </p>
                <p v-if="marker.catalog.terrain" class="location-tooltip-detail">
                  <span class="location-tooltip-label">Terrain</span> {{ marker.catalog.terrain }}
                </p>
                <p v-if="marker.catalog.defenses" class="location-tooltip-detail">
                  <span class="location-tooltip-label">Defenses</span> {{ marker.catalog.defenses }}
                </p>
                <p v-if="marker.catalog.requires" class="location-tooltip-detail">
                  <span class="location-tooltip-label">Requires</span> {{ marker.catalog.requires }}
                </p>
              </template>
            </div>
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

    <BoardContextMenu
      :open="contextMenu.open"
      :x="contextMenu.x"
      :y="contextMenu.y"
      :items="contextMenu.items"
      @select="onContextMenuSelect"
      @close="closeContextMenu"
    />

    <PlaceOverworldLocationModal
      :open="placeModal.open"
      :qx="placeModal.qx"
      :qy="placeModal.qy"
      @close="closePlaceModal"
    />

    <ModalDialog
      title="Remove location?"
      :open="removeModal.open"
      ok-label="Remove"
      @close="closeRemoveModal"
      @confirm="confirmRemoveLocation"
    >
      <p class="remove-location-copy">
        Remove
        <strong>{{ removeModal.location?.name }}</strong>
        from the overworld map?
      </p>
    </ModalDialog>
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

.overworld-side-stack {
  position: absolute;
  top: 0.75rem;
  right: 0.75rem;
  z-index: 5;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
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
  font-size: 1.35rem;
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

.location-marker {
  position: absolute;
  z-index: 3;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: auto;
  cursor: pointer;
  transform: scale(calc(2 * var(--board-fit-scale, 1) / var(--board-scale, 1)));
  transform-origin: center;
}

.location-marker--inert {
  pointer-events: none;
  cursor: default;
}

.location-marker--selected .location-marker-icon {
  filter:
    drop-shadow(0 0 1.5px var(--color-accent))
    drop-shadow(0 0 3px var(--color-accent-bright))
    drop-shadow(0 1px 2px rgba(0, 0, 0, 0.75));
}

.location-marker-icon {
  width: 70%;
  height: 70%;
  object-fit: contain;
  pointer-events: none;
  user-select: none;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.75));
}

.location-tooltip {
  top: calc(100% + 4px);
  left: 50%;
  transform: translateX(-50%);
  z-index: 5;
  opacity: 0;
  transition: opacity 0.12s ease;
  white-space: normal;
  min-width: 140px;
  max-width: 240px;
  text-align: left;
}

.location-marker:hover .location-tooltip,
.location-marker:focus-visible .location-tooltip,
.location-marker--selected .location-tooltip {
  opacity: 1;
}

.location-tooltip-name {
  font-weight: 600;
  line-height: 1.25;
}

.location-tooltip-meta {
  margin-top: 0.15rem;
  color: var(--color-text-secondary);
  font-size: 0.65rem;
  line-height: 1.3;
}

.location-tooltip-desc {
  margin: 0.3rem 0 0;
  color: var(--color-text);
  font-size: 0.65rem;
  line-height: 1.35;
}

.location-tooltip-detail {
  margin: 0.2rem 0 0;
  color: var(--color-text-secondary);
  font-size: 0.65rem;
  line-height: 1.3;
}

.location-tooltip-label {
  color: var(--color-text);
  font-weight: 600;
}

.party-token {
  position: absolute;
  z-index: 4;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  transform: scale(calc(2 * var(--board-fit-scale, 1) / var(--board-scale, 1)));
  transform-origin: center;
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
  transform: scale(calc(2 * var(--board-fit-scale, 1) / var(--board-scale, 1)));
  transform-origin: center;
}

.remove-location-copy {
  margin: 0;
  font-size: 0.9rem;
  color: var(--color-text);
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
