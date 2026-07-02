<script setup lang="ts">
import {
  getArmorByName,
  getClassByName,
  getWeaponByName,
} from "@gaem/shared";
import { computed } from "vue";

import { useBoardSelection } from "../composables/useBoardSelection.js";
import type { DataFocus } from "../composables/useInfoDataSelection.js";
import { kindLabel } from "../lib/game-data-search.js";
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

const title = computed(() => props.focus.name);
const categoryLabel = computed(() => kindLabel(props.focus.kind));

const item = computed(
  () => playerClass.value ?? playerArmor.value ?? playerWeapon.value,
);
</script>

<template>
  <PanelShell :title="title" :kicker="categoryLabel" @close="closeRightPanel">
    <div v-if="item" class="panel-body">
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
.item-summary {
  margin: 0 0 0.5rem;
  font-weight: 600;
  color: var(--color-text);
}

.item-description {
  margin: 0 0 0.75rem;
}
</style>
