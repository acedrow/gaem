<script setup lang="ts">
import { useGmTools } from "../composables/useGmTools.js";

const { activeTool, setActiveTool } = useGmTools();
</script>

<template>
  <div class="gm-tools-toolbar chrome-tabs">
    <button
      type="button"
      class="chrome-tab"
      :class="{ active: activeTool === 'select' }"
      data-tooltip="Select"
      aria-label="Select"
      @click="setActiveTool('select')"
    >
      <svg class="chrome-tab-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M3 5.5V3h2.5M11 3h2.5v2.5M13.5 11v2.5H11M5.5 13.5H3V11" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" />
      </svg>
    </button>
    <button
      type="button"
      class="chrome-tab"
      :class="{ active: activeTool === 'damageEffect' }"
      data-tooltip="Damage / Effect"
      aria-label="Damage / Effect"
      @click="setActiveTool('damageEffect')"
    >
      <svg class="chrome-tab-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="8" cy="8" r="5.5" stroke="currentColor" stroke-width="1.25" />
        <path d="M8 2.5v2M8 11.5v2M2.5 8h2M11.5 8h2" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" />
        <circle cx="8" cy="8" r="1.25" fill="currentColor" />
      </svg>
    </button>
  </div>
</template>

<style scoped>
.gm-tools-toolbar {
  margin: 0 -0.75rem;
  padding: 0 0.75rem;
  border-bottom: 1px solid var(--color-border);
}
</style>
