<script setup lang="ts">
import type { GameMap } from "@gaem/shared";
import { computed, ref, watch } from "vue";

import { useApi } from "../composables/useApi.js";
import { useBoardSelection } from "../composables/useBoardSelection.js";
import { useGameState } from "../composables/useGameState.js";
import PanelShell from "./PanelShell.vue";

const props = defineProps<{ mapId: string }>();

const { fetchMap } = useApi();
const { closeRightPanel } = useBoardSelection();
const { gameState } = useGameState();

const map = ref<GameMap | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);

const isActiveOnBoard = computed(
  () => map.value != null && gameState.value?.mapId === map.value.id,
);

const tilePresetCount = computed(() => Object.keys(map.value?.tilePresets ?? {}).length);

async function loadMap(id: string) {
  loading.value = true;
  error.value = null;
  map.value = null;
  try {
    const result = await fetchMap(id);
    if (!result) throw new Error("Map not found");
    map.value = result;
  } catch {
    error.value = "Unable to load map";
  } finally {
    loading.value = false;
  }
}

watch(
  () => props.mapId,
  (id) => {
    void loadMap(id);
  },
  { immediate: true },
);
</script>

<template>
  <PanelShell :title="map?.name ?? mapId" :subtitle="map?.id" @close="closeRightPanel">
    <div class="panel-body">
      <p v-if="loading" class="panel-muted">Loading…</p>
      <p v-else-if="error" class="panel-error">{{ error }}</p>
      <template v-else-if="map">
        <p v-if="isActiveOnBoard" class="active-badge">Active on board</p>
        <dl class="map-details">
          <div class="detail-row">
            <dt>Dimensions</dt>
            <dd>{{ map.width }}×{{ map.height }}</dd>
          </div>
          <div class="detail-row">
            <dt>Tiles</dt>
            <dd>{{ map.tiles.length }}</dd>
          </div>
          <div class="detail-row">
            <dt>Enemy spawns</dt>
            <dd>{{ map.enemies?.length ?? 0 }}</dd>
          </div>
          <div class="detail-row">
            <dt>Tile presets</dt>
            <dd>{{ tilePresetCount }}</dd>
          </div>
        </dl>
      </template>
    </div>
  </PanelShell>
</template>

<style scoped>
.panel-muted {
  margin: 0;
  color: var(--color-muted-subtle);
  font-size: 0.85rem;
}

.panel-error {
  margin: 0;
  color: var(--color-danger);
  font-size: 0.85rem;
}

.active-badge {
  margin: 0 0 0.75rem;
  padding: 0.25rem 0.5rem;
  width: fit-content;
  border: 1px solid var(--color-accent);
  color: var(--color-accent);
  font-size: 0.75rem;
  font-weight: 600;
}

.map-details {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.detail-row {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  font-size: 0.85rem;
}

.detail-row dt {
  margin: 0;
  color: var(--color-muted);
  font-weight: 600;
}

.detail-row dd {
  margin: 0;
  color: var(--color-text);
}
</style>
