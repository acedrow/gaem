<script setup lang="ts">
import { defaultOverworldParty, type RuleTermTooltip } from "@gaem/shared";
import { computed } from "vue";

import { useGameState } from "../composables/useGameState.js";
import NumberStepper from "./NumberStepper.vue";
import RuleTerm from "./RuleTerm.vue";

const props = defineProps<{
  travelMode: boolean;
}>();

const emit = defineEmits<{
  "update:travelMode": [value: boolean];
}>();

const SPEED_TOOLTIP: RuleTermTooltip = {
  title: "Map Speed",
  summary: "Map Speed 1 ≈ 2.5 inches of travel.",
  description:
    "On this map, each major square is 1 inch and each quarter square is 0.5 inch. Travel moves the party up to that distance on the quarter grid (rounded up).",
};

const FUEL_TOOLTIP: RuleTermTooltip = {
  title: "Fuel",
  summary: "Spend 2 Fuel to Travel on the STRATCOM map.",
  description:
    "Fuel is a journey currency for hellscape travel. Remaining Fuel is erased when the party returns to DIS.",
};

const REVELATIONS_TOOLTIP: RuleTermTooltip = {
  title: "Revelations",
  summary: "Currency for scouting and catacomb exploration.",
  description:
    "Gain Revelation from Scavenge and similar moves; spend it on Scout and under-DIS exploration. Not spent on Travel.",
};

const { gameState, send } = useGameState();

const party = computed(() => gameState.value?.overworldParty ?? defaultOverworldParty());

function onMapSpeedAdjust(delta: number) {
  send({ type: "overworldCampaignAction", action: { kind: "adjustMapSpeed", delta } });
}

function onFuelAdjust(delta: number) {
  send({ type: "overworldCampaignAction", action: { kind: "adjustFuel", delta } });
}

function onRevelationsAdjust(delta: number) {
  send({ type: "overworldCampaignAction", action: { kind: "adjustRevelations", delta } });
}

function toggleTravelMode() {
  emit("update:travelMode", !props.travelMode);
}
</script>

<template>
  <div class="recon-overlay">
    <div class="recon-row">
      <RuleTerm text="Speed" :tooltip="SPEED_TOOLTIP" />
      <NumberStepper
        :model-value="party.mapSpeed"
        :min="0"
        :step="0.5"
        @adjust="onMapSpeedAdjust"
      />
    </div>
    <div class="recon-row">
      <RuleTerm text="Fuel" :tooltip="FUEL_TOOLTIP" />
      <NumberStepper
        :model-value="party.fuel"
        :min="0"
        @adjust="onFuelAdjust"
      />
    </div>
    <div class="recon-row">
      <RuleTerm text="Revelations" :tooltip="REVELATIONS_TOOLTIP" />
      <NumberStepper
        :model-value="party.revelations"
        :min="0"
        @adjust="onRevelationsAdjust"
      />
    </div>
    <button
      type="button"
      class="action-btn move-btn"
      :class="{ active: travelMode }"
      @click="toggleTravelMode"
    >
      Move
    </button>
  </div>
</template>

<style scoped>
.recon-overlay {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  padding: 0.65rem 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-surface);
  min-width: 11rem;
  box-shadow: var(--shadow-popover);
}

.recon-row {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.recon-row :deep(.rule-term) {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--color-text);
}

.move-btn {
  margin-top: 0.15rem;
  background: var(--color-surface-raised);
}

.move-btn.active {
  border-color: var(--color-accent-bright);
  background: var(--color-accent-tint-bg);
}
</style>
