<script setup lang="ts">
import type { PlayerArmor, PlayerClass, PlayerWeapon } from "@gaem/shared";
import { nextTick, ref } from "vue";

import PlayerItemDetail from "./PlayerItemDetail.vue";
import RuleText from "./RuleText.vue";

defineProps<{
  label: string;
  value: string;
  kind: "classes" | "armor" | "weapons";
  item: PlayerClass | PlayerArmor | PlayerWeapon | undefined;
  editing: boolean;
  canEdit?: boolean;
}>();

const emit = defineEmits<{
  startEdit: [];
}>();

const detailOpen = ref(false);
const fieldInputEl = ref<HTMLInputElement | HTMLSelectElement | null>(null);

async function onStartEdit() {
  emit("startEdit");
  await nextTick();
  fieldInputEl.value?.focus();
  if (fieldInputEl.value instanceof HTMLInputElement) fieldInputEl.value.select();
}

function toggleDetail() {
  detailOpen.value = !detailOpen.value;
}

defineExpose({ fieldInputEl });
</script>

<template>
  <div class="gear-field">
    <div class="field-row">
      <template v-if="!editing">
        <span class="field-label">{{ label }}:</span>
        <span class="field-value">{{ value || "—" }}</span>
        <button
          v-if="item"
          type="button"
          class="detail-toggle"
          :aria-expanded="detailOpen"
          :aria-label="`${detailOpen ? 'Hide' : 'Show'} ${label.toLowerCase()} details`"
          @click="toggleDetail"
        >
          <span class="chevron" aria-hidden="true">{{ detailOpen ? "▾" : "▸" }}</span>
        </button>
        <button
          v-if="canEdit"
          type="button"
          class="edit-btn"
          :aria-label="`Edit ${label.toLowerCase()}`"
          @click="onStartEdit"
        >
          <slot name="edit-icon" />
        </button>
      </template>
      <template v-else>
        <span class="field-label">{{ label }}:</span>
        <slot name="input" :input-el="fieldInputEl" />
      </template>
    </div>

    <div v-if="!editing && detailOpen && item" class="field-detail">
      <p v-if="'summary' in item && item.summary" class="item-summary">{{ item.summary }}</p>
      <p v-if="item.description" class="item-description">
        <RuleText :text="item.description" />
      </p>
      <PlayerItemDetail :item="item" :kind="kind" />
    </div>
  </div>
</template>

<style scoped>
.gear-field + .gear-field {
  margin-top: 0.15rem;
}

.field-row {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.9rem;
  line-height: 1.4;
  min-height: 1.75rem;
}

.field-label {
  flex-shrink: 0;
  color: var(--color-muted);
  font-weight: 500;
}

.field-value {
  flex: 1;
  min-width: 0;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.detail-toggle {
  flex-shrink: 0;
  display: grid;
  place-items: center;
  width: 1.75rem;
  height: 1.75rem;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--color-muted);
  cursor: pointer;
  padding: 0;
}

.detail-toggle:hover {
  color: var(--color-text);
  background: var(--color-surface);
}

.chevron {
  font-size: 1.5rem;
  line-height: 1;
}

.edit-btn {
  flex-shrink: 0;
  display: grid;
  place-items: center;
  width: 1.4rem;
  height: 1.4rem;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--color-muted);
  cursor: pointer;
  padding: 0;
}

.edit-btn:hover {
  color: var(--color-accent);
  background: var(--color-surface);
}

:deep(.edit-btn .icon) {
  width: 0.75rem;
  height: 0.75rem;
  fill: currentColor;
}

.field-detail {
  margin: 0.35rem 0 0.5rem;
  padding: 0.55rem 0.65rem;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  font-size: 0.78rem;
  line-height: 1.45;
  color: var(--color-muted);
}

.item-summary {
  margin: 0 0 0.4rem;
  font-weight: 600;
  color: var(--color-text);
}

:deep(.field-input) {
  flex: 1;
  min-width: 0;
  border: 1px solid var(--color-accent-muted);
  border-radius: 0;
  background: var(--color-bg);
  color: var(--color-text);
  padding: 0.2rem 0.45rem;
  font: inherit;
  font-size: 0.9rem;
}
</style>
