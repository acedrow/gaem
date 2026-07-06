<script setup lang="ts">
import { getArmorByName, getClassByName, getEffectById, getEquipmentByName, getGearByName, getTerrainTypeById, getWeaponByName } from "@gaem/shared";
import { computed } from "vue";

import { useBoardSelection } from "../composables/useBoardSelection.js";
import type { DataFocus } from "../composables/useInfoDataSelection.js";
import { kindLabel } from "../lib/game-data-search.js";
import { TERRAIN_TILE_IMAGE_URLS } from "../lib/terrainTileImages.js";
import EffectIcon from "./EffectIcon.vue";
import PanelShell from "./PanelShell.vue";
import PlayerItemDetail from "./PlayerItemDetail.vue";
import RuleText from "./RuleText.vue";

const props = defineProps<{ focus: DataFocus }>();

const { closeRightPanel } = useBoardSelection();

const playerClass = computed(() =>
  props.focus.kind === "classes" ? getClassByName(props.focus.name) : undefined,
);
const playerArmor = computed(() =>
  props.focus.kind === "armor" ? getArmorByName(props.focus.name) : undefined,
);
const playerWeapon = computed(() =>
  props.focus.kind === "weapons" ? getWeaponByName(props.focus.name) : undefined,
);
const playerEquipment = computed(() =>
  props.focus.kind === "equipment" ? getEquipmentByName(props.focus.name) : undefined,
);
const playerGear = computed(() =>
  props.focus.kind === "gear" ? getGearByName(props.focus.name) : undefined,
);
const ruleEffect = computed(() =>
  props.focus.kind === "effects" ? getEffectById(props.focus.name) : undefined,
);
const terrainType = computed(() =>
  props.focus.kind === "terrain" ? getTerrainTypeById(props.focus.name) : undefined,
);

const title = computed(() => terrainType.value?.name ?? props.focus.name);
const categoryLabel = computed(() => kindLabel(props.focus.kind));

const item = computed(
  () => playerClass.value ?? playerArmor.value ?? playerWeapon.value ?? playerEquipment.value ?? playerGear.value,
);
</script>

<template>
  <PanelShell :title="title" :kicker="categoryLabel" @close="closeRightPanel">
    <div v-if="terrainType" class="panel-body">
      <div class="terrain-header">
        <span
          v-if="TERRAIN_TILE_IMAGE_URLS[terrainType.id]"
          class="terrain-preview"
          :style="{ backgroundImage: `url(${TERRAIN_TILE_IMAGE_URLS[terrainType.id]})` }"
        />
        <span v-else class="terrain-preview terrain-preview--plain" :class="terrainType.id" />
      </div>
      <p class="item-summary">{{ terrainType.summary }}</p>
      <p class="item-description">
        <RuleText :text="terrainType.description" />
      </p>
    </div>
    <div v-else-if="ruleEffect" class="panel-body">
      <div class="effect-header">
        <EffectIcon :effect-id="ruleEffect.id" :size="28" />
      </div>
      <p class="item-summary">{{ ruleEffect.summary }}</p>
      <p class="item-description">
        <RuleText :text="ruleEffect.description" />
      </p>
    </div>
    <div v-else-if="item" class="panel-body">
      <p v-if="'summary' in item && item.summary" class="item-summary">{{ item.summary }}</p>
      <p v-if="item.description" class="item-description">
        <RuleText :text="item.description" />
      </p>
      <PlayerItemDetail :item="item" :kind="focus.kind" />
    </div>
    <p v-else class="muted">Entry not found.</p>
  </PanelShell>
</template>

<style scoped>
.effect-header {
  margin-bottom: 0.5rem;
}

.terrain-header {
  margin-bottom: 0.5rem;
}

.terrain-preview {
  display: inline-block;
  width: 36px;
  height: 36px;
  border-radius: 4px;
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

.item-summary {
  margin: 0 0 0.5rem;
  font-weight: 600;
  color: var(--color-text);
}

.item-description {
  margin: 0 0 0.75rem;
}
</style>
