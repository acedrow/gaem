<script setup lang="ts">
import { RULE_EFFECTS } from "@gaem/shared";
import { ref } from "vue";

import { useBoardSelection } from "../composables/useBoardSelection.js";
import EffectIcon from "./EffectIcon.vue";
import PanelShell from "./PanelShell.vue";
import RuleText from "./RuleText.vue";

const { closeRightPanel } = useBoardSelection();
const expanded = ref<Set<string>>(new Set());

function isExpanded(id: string): boolean {
  return expanded.value.has(id);
}

function toggle(id: string) {
  if (expanded.value.has(id)) expanded.value.delete(id);
  else expanded.value.add(id);
}
</script>

<template>
  <PanelShell title="Effects" @close="closeRightPanel">
    <div class="panel-body">
      <article v-for="effect in RULE_EFFECTS" :key="effect.id" class="list-card">
        <button
          type="button"
          class="list-card-header"
          :class="{ expanded: isExpanded(effect.id) }"
          @click="toggle(effect.id)"
        >
          <span class="item-header">
            <EffectIcon :effect-id="effect.id" :size="18" />
            <span class="item-name">{{ effect.id }}</span>
          </span>
          <span class="chevron" aria-hidden="true">{{ isExpanded(effect.id) ? "▾" : "▸" }}</span>
        </button>

        <div v-if="isExpanded(effect.id)" class="list-card-body">
          <p class="item-summary">{{ effect.summary }}</p>
          <p class="item-description">
            <RuleText :text="effect.description" />
          </p>
        </div>
      </article>
    </div>
  </PanelShell>
</template>

<style scoped>
.item-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.item-name {
  font-weight: 600;
}

.chevron {
  color: var(--color-muted);
  font-size: 1.5rem;
}

.item-summary {
  margin: 0 0 0.5rem;
  font-weight: 600;
  color: var(--color-text);
}
</style>
