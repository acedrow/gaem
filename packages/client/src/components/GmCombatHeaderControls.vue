<script setup lang="ts">
import { TERRAIN_TYPES, TILE_EFFECTS, UNIT_EFFECTS, terrainTypeDisplayName } from "@gaem/shared";
import { computed } from "vue";

import {
  useGmTools,
  type GmSelectTargetKind,
  GM_EFFECT_NONE,
  GM_TILE_EFFECT_NONE,
} from "../composables/useGmTools.js";
import EffectIcon from "./EffectIcon.vue";
import NumberStepper from "./NumberStepper.vue";

const {
  activeTool,
  selectTargetKind,
  bulkSelection,
  bulkSelectionCount,
  damageAmount,
  effectId,
  effectStacks,
  paintbrushElevation,
  paintbrushTerrain,
  paintbrushEffectId,
  paintbrushEffectStacks,
  resetPaintbrushSettings,
} = useGmTools();

const targetKinds: { id: GmSelectTargetKind; label: string }[] = [
  { id: "tiles", label: "Tiles" },
  { id: "enemies", label: "Enemies" },
  { id: "players", label: "Players" },
];

const bulkLabel = computed(() => {
  const count = bulkSelectionCount.value;
  if (!count || !bulkSelection.value) return "";
  const noun =
    bulkSelection.value.kind === "tiles"
      ? count === 1
        ? "tile"
        : "tiles"
      : bulkSelection.value.kind === "enemies"
        ? count === 1
          ? "enemy"
          : "enemies"
        : count === 1
          ? "player"
          : "players";
  return `${count} ${noun} selected`;
});
</script>

<template>
  <div v-if="activeTool" class="gm-combat-header-controls">
    <template v-if="activeTool === 'select'">
      <div class="segmented">
        <button
          v-for="kind in targetKinds"
          :key="kind.id"
          type="button"
          class="segment-btn"
          :class="{ active: selectTargetKind === kind.id }"
          @click="selectTargetKind = kind.id"
        >
          {{ kind.label }}
        </button>
      </div>
      <span v-if="bulkLabel" class="bulk-count">{{ bulkLabel }}</span>
    </template>

    <template v-else-if="activeTool === 'damageEffect'">
      <div class="control-group">
        <span class="control-label">Damage</span>
        <NumberStepper v-model="damageAmount" :min="0" :max="99" />
      </div>
      <div class="control-group effect-group">
        <span class="control-label">Effect</span>
        <select v-model="effectId" class="effect-select">
          <option :value="GM_EFFECT_NONE">None</option>
          <option v-for="effect in UNIT_EFFECTS" :key="effect.id" :value="effect.id">
            {{ effect.id }}
          </option>
        </select>
        <EffectIcon v-if="effectId" :effect-id="effectId" :size="16" />
      </div>
      <div class="control-group">
        <span class="control-label">Stacks</span>
        <NumberStepper v-model="effectStacks" :min="-99" :max="99" />
      </div>
    </template>

    <template v-else-if="activeTool === 'paintbrush'">
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
      <button type="button" class="reset-btn" @click="resetPaintbrushSettings">Reset</button>
    </template>
  </div>
</template>

<style scoped>
.gm-combat-header-controls {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-left: auto;
  flex-shrink: 0;
}

.segmented {
  display: flex;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  overflow: hidden;
}

.segment-btn {
  border: none;
  background: transparent;
  color: var(--color-muted);
  padding: 0.2rem 0.6rem;
  font-size: 0.8rem;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
}

.segment-btn + .segment-btn {
  border-left: 1px solid var(--color-border);
}

.segment-btn.active {
  background: var(--color-accent-subtle-bg);
  color: var(--color-accent-bright);
}

.bulk-count {
  font-size: 0.8rem;
  color: var(--color-muted);
  white-space: nowrap;
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

.reset-btn {
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-surface);
  color: var(--color-muted);
  font-size: 0.78rem;
  font-weight: 600;
  font-family: inherit;
  padding: 0.2rem 0.55rem;
  cursor: pointer;
}

.reset-btn:hover {
  color: var(--color-text);
  background: var(--color-surface-raised);
}
</style>
