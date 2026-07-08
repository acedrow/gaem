<script setup lang="ts">
import { UNIT_EFFECTS } from "@gaem/shared";
import { computed } from "vue";

import {
  useGmTools,
  type GmSelectTargetKind,
  GM_EFFECT_NONE,
} from "../composables/useGmTools.js";
import EffectIcon from "./EffectIcon.vue";
import GmPaintbrushControls from "./GmPaintbrushControls.vue";
import NumberStepper from "./NumberStepper.vue";

const {
  activeTool,
  selectTargetKind,
  bulkSelection,
  bulkSelectionCount,
  damageAmount,
  effectId,
  effectStacks,
} = useGmTools();

const showOverlay = computed(
  () => !!activeTool.value && activeTool.value !== "forceMove",
);

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
  <div v-if="showOverlay" class="action-bar gm-tools-overlay">
    <div v-if="activeTool === 'select'" class="hint-row tool-options-row">
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
      <span v-else class="hint">Drag on the board to select</span>
    </div>

    <div v-else-if="activeTool === 'damageEffect'" class="hint-row tool-options-row">
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
      <span class="hint">Click players or enemies to apply</span>
    </div>

    <div v-else-if="activeTool === 'paintbrush'" class="hint-row tool-options-row">
      <GmPaintbrushControls />
    </div>
  </div>
</template>

<style scoped>
.action-bar {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.65rem 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-surface);
}

.hint-row,
.tool-options-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  align-items: center;
}

.hint {
  font-size: 0.72rem;
  color: var(--color-muted);
}

.tool-options-row .hint {
  margin-left: auto;
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
  margin-left: auto;
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
</style>
