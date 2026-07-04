<script setup lang="ts">
defineProps<{
  canMain: boolean;
  canSupport: boolean;
  canAux: boolean;
}>();
</script>

<template>
  <span class="chip" :class="{ spent: !canMain }">Main</span>
  <span class="chip" :class="{ spent: !canSupport }">Support</span>
  <span class="chip" :class="{ spent: !canAux }">Aux</span>
</template>

<style scoped>
.chip {
  font-size: 0.72rem;
  font-weight: 600;
  padding: 0.15rem 0.45rem;
  border-radius: 999px;
  background: var(--color-surface-raised);
  border: 1px solid var(--color-border);
  color: var(--color-text);
}

.chip.spent {
  opacity: 0.45;
}
</style>
