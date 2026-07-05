<script setup lang="ts">
import ModalDialog from "./ModalDialog.vue";

defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  close: [];
  breakSwarm: [];
  attackWhole: [];
}>();
</script>

<template>
  <ModalDialog title="Breaker" :open="open" @close="emit('close')">
    <p class="prompt">
      This attack targets a Swarm and your weapon has Breaker. How do you want to attack?
    </p>
    <div class="actions">
      <button type="button" class="action-btn primary" @click="emit('breakSwarm')">
        Break swarm
      </button>
      <button type="button" class="action-btn" @click="emit('attackWhole')">
        Attack as whole
      </button>
      <button type="button" class="action-btn muted" @click="emit('close')">
        Cancel
      </button>
    </div>
  </ModalDialog>
</template>

<style scoped>
.prompt {
  margin: 0 0 1rem;
  font-size: 0.85rem;
  line-height: 1.45;
  color: var(--color-text-secondary);
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.action-btn {
  font-size: 0.8rem;
  padding: 0.35rem 0.65rem;
  border-radius: 6px;
  border: 1px solid var(--color-border);
  background: var(--color-surface-raised);
  color: var(--color-text);
  cursor: pointer;
}

.action-btn.primary {
  border-color: var(--color-accent-muted);
  background: var(--color-accent-subtle-bg);
  color: var(--color-accent);
}

.action-btn.muted {
  color: var(--color-muted);
}
</style>
