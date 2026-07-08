<script setup lang="ts">
import { computed, ref, watch } from "vue";

import ModalDialog from "./ModalDialog.vue";

const props = defineProps<{
  open: boolean;
  modelValue: string | null;
}>();

const emit = defineEmits<{
  close: [];
  "update:modelValue": [value: string | null];
}>();

const hexInput = ref("");

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) return;
    hexInput.value = props.modelValue ?? "#2d4a3e";
  },
);

const swatchColor = computed(() => {
  const v = hexInput.value.trim();
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v) ? v : "#000000";
});

function onColorPickerInput(e: Event) {
  const value = (e.target as HTMLInputElement).value;
  hexInput.value = value;
}

function onConfirm() {
  const v = hexInput.value.trim();
  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v)) {
    emit("update:modelValue", v);
  }
  emit("close");
}

function onClear() {
  emit("update:modelValue", null);
  emit("close");
}
</script>

<template>
  <ModalDialog
    title="Tile base color"
    :open="open"
    ok-label="Apply"
    cancel-label="Cancel"
    @close="emit('close')"
    @confirm="onConfirm"
  >
    <div class="color-modal-body">
      <label class="color-picker-row">
        <span class="control-label">Color</span>
        <input
          type="color"
          class="color-input"
          :value="swatchColor"
          @input="onColorPickerInput"
        />
        <input v-model="hexInput" type="text" class="hex-input" spellcheck="false" />
      </label>
      <button type="button" class="clear-btn" @click="onClear">Clear color</button>
    </div>
  </ModalDialog>
</template>

<style scoped>
.color-modal-body {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.color-picker-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.control-label {
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--color-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.color-input {
  width: 2.5rem;
  height: 2rem;
  padding: 0;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
}

.hex-input {
  flex: 1;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-surface);
  color: var(--color-text);
  font-size: 0.85rem;
  font-family: inherit;
  padding: 0.3rem 0.5rem;
}

.clear-btn {
  align-self: flex-start;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-surface);
  color: var(--color-muted);
  font-size: 0.78rem;
  font-weight: 600;
  font-family: inherit;
  padding: 0.25rem 0.55rem;
  cursor: pointer;
}

.clear-btn:hover {
  color: var(--color-text);
  background: var(--color-surface-raised);
}
</style>
