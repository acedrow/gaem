<script setup lang="ts">
import { usePlayerSettings } from "../composables/usePlayerSettings.js";

const { showHealthBars, showConnectionsInConsole } = usePlayerSettings();
</script>

<template>
  <div class="settings-panel">
    <header class="panel-header">
      <h2 class="panel-heading">Settings</h2>
    </header>

    <div class="settings-list">
      <label class="setting-row">
        <span class="setting-label">Show health bars</span>
        <button
          type="button"
          role="switch"
          class="toggle"
          :class="{ on: showHealthBars }"
          :aria-checked="showHealthBars"
          @click="showHealthBars = !showHealthBars"
        >
          <span class="toggle-thumb" />
        </button>
      </label>

      <label class="setting-row">
        <span class="setting-label">Show connections in console</span>
        <button
          type="button"
          role="switch"
          class="toggle"
          :class="{ on: showConnectionsInConsole }"
          :aria-checked="showConnectionsInConsole"
          @click="showConnectionsInConsole = !showConnectionsInConsole"
        >
          <span class="toggle-thumb" />
        </button>
      </label>
    </div>
  </div>
</template>

<style scoped>
.settings-panel {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.panel-header {
  flex-shrink: 0;
  padding: 1rem 1rem 0.75rem;
  border-bottom: 1px solid #30363d;
}

.panel-heading {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.settings-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1rem;
}

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.setting-label {
  font-size: 0.85rem;
  font-weight: 600;
  color: #e6edf3;
}

.toggle {
  position: relative;
  flex-shrink: 0;
  width: 2.25rem;
  height: 1.25rem;
  border: 1px solid #484f58;
  border-radius: 999px;
  background: #21262d;
  padding: 0;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}

.toggle.on {
  background: #238636;
  border-color: #2ea043;
}

.toggle-thumb {
  position: absolute;
  top: 1px;
  left: 1px;
  width: calc(1.25rem - 4px);
  height: calc(1.25rem - 4px);
  border-radius: 50%;
  background: #e6edf3;
  transition: transform 0.15s;
}

.toggle.on .toggle-thumb {
  transform: translateX(1rem);
}
</style>
