<script setup lang="ts">
withDefaults(
  defineProps<{
    title: string;
    open: boolean;
    wide?: boolean;
    okLabel?: string;
    cancelLabel?: string;
    okDisabled?: boolean;
  }>(),
  {
    okLabel: "OK",
    cancelLabel: "Cancel",
    okDisabled: false,
  },
);

const emit = defineEmits<{
  close: [];
  confirm: [];
}>();
</script>

<template>
  <div v-if="open" class="modal-backdrop" @click.self="emit('close')">
    <div class="modal" :class="{ 'modal--wide': wide }" role="dialog" :aria-label="title">
      <h2 class="modal-title">{{ title }}</h2>
      <slot />
      <div class="modal-actions">
        <slot name="actions">
          <button type="button" class="btn-secondary" @click="emit('close')">{{ cancelLabel }}</button>
          <button type="button" class="btn-primary" :disabled="okDisabled" @click="emit('confirm')">
            {{ okLabel }}
          </button>
        </slot>
      </div>
    </div>
  </div>
</template>
