<script setup lang="ts">
import type { PatternDirection, PatternModifierValues } from "@gaem/shared";
import { PATTERN_MODIFIERS, TARGETING_PATTERNS } from "@gaem/shared";
import { computed } from "vue";

import { useBoardSelection } from "../composables/useBoardSelection.js";
import { usePatternSelection } from "../composables/usePatternSelection.js";
import NumberStepper from "./NumberStepper.vue";
import PanelShell from "./PanelShell.vue";
import SegmentedControl from "./SegmentedControl.vue";

const { closeRightPanel } = useBoardSelection();
const {
  selectedPatternId,
  selectedPattern,
  patternSize,
  patternDirection,
  wallLopsidedExtra,
  modifierValues,
  isDrawing,
  selectPattern,
  clampSize,
  clampModifierValue,
  adjustPatternSize,
  adjustModifierValue,
  setModifierValue,
  resetDrawing,
} = usePatternSelection();

const directions: { id: PatternDirection; label: string }[] = [
  { id: "n", label: "N" },
  { id: "e", label: "E" },
  { id: "s", label: "S" },
  { id: "w", label: "W" },
];

function modifierApplies(modifierId: string): boolean {
  const pattern = selectedPattern.value;
  const modifier = PATTERN_MODIFIERS.find((m) => m.id === modifierId);
  if (!modifier?.appliesTo || !pattern) return true;
  return modifier.appliesTo.includes(pattern.id);
}

function onModifierInput(id: keyof PatternModifierValues, value: number) {
  setModifierValue(id, value);
}
</script>

<template>
  <div class="panel">
    <div class="panel-header">
      <h2 class="panel-title">Patterns</h2>
      <button class="close-btn" type="button" title="Close" @click="closeRightPanel">×</button>
    </div>

    <div class="controls-block">
      <div class="size-bar">
        <span class="size-label">Size</span>
        <NumberStepper
          v-model="patternSize"
          :min="1"
          :max="selectedPattern?.size.max ?? 20"
          :clamp="clampSize"
          @adjust="adjustPatternSize"
        />
        <button
          v-if="isDrawing"
          type="button"
          class="reset-btn"
          @click="resetDrawing"
        >
          Reset
        </button>
      </div>

      <div
        v-for="modifier in PATTERN_MODIFIERS"
        :key="modifier.id"
        class="size-bar"
        :class="{ inactive: selectedPattern && !modifierApplies(modifier.id) }"
      >
        <span class="size-label-wrap">
          <span class="size-label">{{ modifier.name }}</span>
          <span class="label-tooltip">{{ modifier.description }}</span>
        </span>
        <NumberStepper
          :model-value="modifierValues[modifier.id as keyof PatternModifierValues]"
          :min="modifier.size.min"
          :max="modifier.size.max"
          :disabled="!!(selectedPattern && !modifierApplies(modifier.id))"
          :clamp="(v) => clampModifierValue(modifier.id as keyof PatternModifierValues, v)"
          @update:model-value="setModifierValue(modifier.id as keyof PatternModifierValues, $event)"
          @adjust="adjustModifierValue(modifier.id as keyof PatternModifierValues, $event)"
        />
      </div>

    </div>

    <div v-if="selectedPattern?.directional" class="dir-bar">
      <span class="size-label">Aim</span>
      <div class="dir-group">
        <button
          v-for="dir in directions"
          :key="dir.id"
          type="button"
          class="dir-btn"
          :class="{ active: patternDirection === dir.id }"
          @click="patternDirection = dir.id"
        >
          {{ dir.label }}
        </button>
      </div>
      <span class="hotkey-hint">R</span>
    </div>

    <div v-if="selectedPattern?.lopsided" class="dir-bar">
      <span class="size-label">Extra</span>
      <div class="dir-group">
        <button
          type="button"
          class="dir-btn"
          :class="{ active: wallLopsidedExtra === 'left' }"
          @click="wallLopsidedExtra = 'left'"
        >
          Left
        </button>
        <button
          type="button"
          class="dir-btn"
          :class="{ active: wallLopsidedExtra === 'right' }"
          @click="wallLopsidedExtra = 'right'"
        >
          Right
        </button>
      </div>
    </div>

    <div class="panel-scroll">
      <div class="list-block">
        <article
          v-for="pattern in TARGETING_PATTERNS"
          :key="pattern.id"
          class="pattern-item"
          :class="{ selected: selectedPatternId === pattern.id }"
        >
          <button
            type="button"
            class="pattern-header"
            @click="selectPattern(pattern.id)"
          >
            <span class="pattern-name">{{ pattern.name }}</span>
            <span v-if="pattern.kind === 'drawable'" class="pattern-tag">draw</span>
          </button>
          <p v-if="selectedPatternId === pattern.id" class="pattern-description">
            {{ pattern.description }}
          </p>
        </article>
      </div>
    </div>
  </div>
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 1rem;
  height: 100%;
}

.panel-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
  flex-shrink: 0;
}

.panel-title {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 700;
  line-height: 1.3;
}

.close-btn {
  flex-shrink: 0;
  border: none;
  background: transparent;
  color: #8b949e;
  font-size: 1.4rem;
  line-height: 1;
  cursor: pointer;
  padding: 0 0.15rem;
}

.close-btn:hover {
  color: #e6edf3;
}

.size-bar,
.dir-bar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
}

.controls-block {
  display: flex;
  flex-direction: row;
  gap: 0.45rem;
  margin-bottom: 0.65rem;
  flex-shrink: 0;
  flex-wrap: wrap;
}

.size-bar.inactive {
  opacity: 0.45;
}

.size-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: #8b949e;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  min-width: 2.25rem;
}

.size-label-wrap {
  position: relative;
}

.size-label-wrap:hover .label-tooltip {
  display: block;
}

.label-tooltip {
  display: none;
  position: absolute;
  left: 0;
  top: calc(100% + 4px);
  z-index: 10;
  min-width: 140px;
  max-width: 220px;
  padding: 0.45rem 0.55rem;
  border-radius: 6px;
  border: 1px solid #30363d;
  background: #0d1117;
  color: #e6edf3;
  font-size: 0.75rem;
  font-weight: 400;
  line-height: 1.45;
  text-transform: none;
  letter-spacing: normal;
  white-space: normal;
  box-shadow: 0 4px 12px #01040966;
  pointer-events: none;
}

.stepper {
  display: flex;
  align-items: center;
}

.step-btn {
  width: 1.75rem;
  height: 1.75rem;
  padding: 0;
  border: 1px solid #30363d;
  background: #21262d;
  color: #c9d1d9;
  font-size: 1rem;
  line-height: 1;
  cursor: pointer;
}

.step-btn:first-child {
  border-radius: 6px 0 0 6px;
}

.step-btn:last-child {
  border-radius: 0 6px 6px 0;
}

.step-btn:hover:not(:disabled) {
  background: #30363d;
  color: #e6edf3;
}

.step-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.step-input {
  width: 2.25rem;
  height: 1.75rem;
  padding: 0;
  border: 1px solid #30363d;
  border-left: none;
  border-right: none;
  background: #0d1117;
  color: #e6edf3;
  font-size: 0.85rem;
  text-align: center;
  font-variant-numeric: tabular-nums;
  -moz-appearance: textfield;
  appearance: textfield;
}

.step-input::-webkit-outer-spin-button,
.step-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.step-input:disabled {
  opacity: 0.5;
}

.reset-btn {
  margin-left: auto;
  padding: 0.3rem 0.55rem;
  border: 1px solid #30363d;
  border-radius: 6px;
  background: #21262d;
  color: #8b949e;
  font-size: 0.75rem;
  cursor: pointer;
  font-family: inherit;
}

.reset-btn:hover {
  color: #e6edf3;
  background: #30363d;
}

.dir-group {
  display: flex;
  gap: 0;
}

.dir-btn {
  padding: 0.3rem 0.55rem;
  border: 1px solid #30363d;
  background: #21262d;
  color: #8b949e;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
}

.dir-btn:first-child {
  border-radius: 6px 0 0 6px;
}

.dir-btn:last-child {
  border-radius: 0 6px 6px 0;
}

.dir-btn + .dir-btn {
  border-left: none;
}

.dir-btn:hover {
  color: #e6edf3;
  background: #30363d;
}

.dir-btn.active {
  background: #388bfd;
  border-color: #388bfd;
  color: #fff;
}

.dir-bar {
  margin-bottom: 0.65rem;
}

.hotkey-hint {
  margin-left: auto;
  font-size: 0.65rem;
  font-weight: 600;
  color: #6e7681;
  border: 1px solid #30363d;
  border-radius: 4px;
  padding: 0.15rem 0.35rem;
  font-family: inherit;
}

.panel-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.list-block {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.pattern-item {
  border: 1px solid #21262d;
  border-radius: 8px;
}

.pattern-item.selected {
  border-color: #388bfd66;
}

.pattern-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  width: 100%;
  padding: 0.55rem 0.65rem;
  border: none;
  background: #161b22;
  color: #e6edf3;
  text-align: left;
  cursor: pointer;
  font-family: inherit;
}

.pattern-item.selected .pattern-header {
  background: #1c2128;
}

.pattern-header:hover {
  background: #1c2128;
}

.pattern-name {
  font-size: 0.9rem;
  font-weight: 700;
  line-height: 1.3;
}

.pattern-tag {
  font-size: 0.65rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #8b949e;
  border: 1px solid #30363d;
  border-radius: 4px;
  padding: 0.1rem 0.35rem;
}

.pattern-description {
  margin: 0;
  padding: 0.65rem 0.75rem 0.75rem;
  border-top: 1px solid #21262d;
  font-size: 0.82rem;
  line-height: 1.45;
  color: #c9d1d9;
}
</style>
