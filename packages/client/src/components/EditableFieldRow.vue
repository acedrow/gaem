<script setup lang="ts">
import { nextTick, ref } from "vue";

const props = defineProps<{
  label: string;
  value: string;
  editing: boolean;
  canEdit?: boolean;
  editAriaLabel?: string;
}>();

const emit = defineEmits<{
  startEdit: [];
  commitEdit: [];
  cancelEdit: [];
}>();

const fieldInputEl = ref<HTMLInputElement | HTMLSelectElement | null>(null);

async function onStartEdit() {
  emit("startEdit");
  await nextTick();
  fieldInputEl.value?.focus();
}

defineExpose({ fieldInputEl });
</script>

<template>
  <div class="field-row">
    <template v-if="!editing">
      <span class="field-label">{{ label }}:</span>
      <span class="field-value-wrap">
        <span class="field-value">{{ value || "—" }}</span>
        <slot name="tooltip" />
      </span>
      <button
        v-if="canEdit"
        type="button"
        class="edit-btn"
        :aria-label="editAriaLabel ?? `Edit ${label.toLowerCase()}`"
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
</template>

<style scoped>
.field-row {
  display: grid;
  grid-template-columns: 5.5rem 1fr auto;
  align-items: start;
  gap: 0.35rem 0.5rem;
  padding: 0.35rem 0;
}

.field-label {
  color: var(--color-muted);
  font-size: 0.85rem;
}

.field-value-wrap {
  position: relative;
  min-width: 0;
}

.field-value {
  font-size: 0.9rem;
  color: var(--color-text);
}

.field-value-wrap:hover .field-tooltip {
  opacity: 1;
  visibility: visible;
}

:deep(.field-tooltip) {
  position: absolute;
  left: 0;
  top: calc(100% + 4px);
  z-index: 5;
  width: max-content;
  max-width: 16rem;
  padding: 0.5rem 0.65rem;
  border-radius: 6px;
  border: 1px solid var(--color-border);
  background: var(--color-bg);
  color: var(--color-muted);
  font-size: 0.75rem;
  line-height: 1.4;
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  box-shadow: var(--shadow-popover);
}

:deep(.tooltip-summary) {
  margin: 0 0 0.35rem;
  color: var(--color-text);
  font-weight: 600;
}

:deep(.tooltip-body) {
  margin: 0;
}

.edit-btn {
  border: none;
  background: transparent;
  color: var(--color-muted);
  padding: 0.15rem;
  cursor: pointer;
}

.edit-btn:hover {
  color: var(--color-text);
}

:deep(.field-input) {
  width: 100%;
  border: 1px solid var(--color-border);
  border-radius: 0;
  background: var(--color-bg);
  color: var(--color-text);
  padding: 0.35rem 0.5rem;
  font-size: 0.85rem;
}
</style>
