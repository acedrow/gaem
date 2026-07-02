<script setup lang="ts">
import { computed } from "vue";

import { useGameState } from "../composables/useGameState.js";
import { usePlayerSettings } from "../composables/usePlayerSettings.js";
import { useSession } from "../composables/useSession.js";

const { isGm } = useSession();
const { gameState, send } = useGameState();
const { showHealthBars, showConnectionsInConsole } = usePlayerSettings();

const showReversals = computed(() => gameState.value?.showReversals !== false);

function setShowReversals(value: boolean) {
  send({ type: "setShowReversals", showReversals: value });
}
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

      <template v-if="isGm">
        <h3 class="settings-section-heading">GM Settings</h3>

        <label class="setting-row">
          <span class="setting-label">Show reversals</span>
          <button
            type="button"
            role="switch"
            class="toggle"
            :class="{ on: showReversals }"
            :aria-checked="showReversals"
            @click="setShowReversals(!showReversals)"
          >
            <span class="toggle-thumb" />
          </button>
        </label>
      </template>
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
  border-bottom: 1px solid var(--color-border);
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

.settings-section-heading {
  margin: 0.5rem 0 0;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--color-muted);
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
  color: var(--color-text);
}

.toggle {
  position: relative;
  flex-shrink: 0;
  width: 2.25rem;
  height: 1.25rem;
  border: 1px solid var(--color-border-strong);
  border-radius: 999px;
  background: var(--color-surface-raised);
  padding: 0;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}

.toggle.on {
  background: var(--color-success-dark);
  border-color: var(--color-success-bright);
}

.toggle-thumb {
  position: absolute;
  top: 1px;
  left: 1px;
  width: calc(1.25rem - 4px);
  height: calc(1.25rem - 4px);
  border-radius: 50%;
  background: var(--color-text);
  transition: transform 0.15s;
}

.toggle.on .toggle-thumb {
  transform: translateX(1rem);
}
</style>
