<script setup lang="ts">
import type {
  PlayerArmor,
  PlayerClass,
  PlayerEquipment,
  PlayerGear,
  PlayerWeapon,
} from "@gaem/shared";
import { ref } from "vue";

import PlayerItemDetail from "./PlayerItemDetail.vue";
import RuleText from "./RuleText.vue";

defineProps<{
  label: string;
  value: string;
  kind: "classes" | "armor" | "weapons" | "equipment" | "gear";
  item: PlayerClass | PlayerArmor | PlayerWeapon | PlayerEquipment | PlayerGear | undefined;
  canEdit?: boolean;
  weaponBombIndex?: number;
  weaponBombSelectable?: boolean;
}>();

const emit = defineEmits<{
  startEdit: [];
  "update:weaponBombIndex": [index: number];
}>();

const detailOpen = ref(false);

function toggleDetail() {
  detailOpen.value = !detailOpen.value;
}
</script>

<template>
  <div class="gear-field">
    <div class="field-row">
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
        :aria-label="`Change ${label.toLowerCase()}`"
        @click="emit('startEdit')"
      >
        <svg class="icon" viewBox="0 0 16 16" aria-hidden="true">
          <path
            d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.387 8.387L2.5 14.5l1.126-3.666 8.387-8.387z"
            fill="currentColor"
          />
        </svg>
      </button>
    </div>

    <div v-if="detailOpen && item" class="field-detail">
      <p v-if="'summary' in item && item.summary" class="item-summary">{{ item.summary }}</p>
      <p v-if="item.description" class="item-description">
        <RuleText :text="item.description" />
      </p>
      <PlayerItemDetail
        :item="item"
        :kind="kind"
        :weapon-bomb-index="weaponBombIndex"
        :weapon-bomb-selectable="weaponBombSelectable"
        @update:weapon-bomb-index="emit('update:weaponBombIndex', $event)"
      />
    </div>

    <div v-if="$slots.actions" class="field-actions">
      <slot name="actions" />
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

.edit-btn .icon {
  width: 0.75rem;
  height: 0.75rem;
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

.field-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin: 0.15rem 0 0.35rem 0.35rem;
}
</style>
