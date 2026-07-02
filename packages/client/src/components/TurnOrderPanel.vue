<script setup lang="ts">
import type { PhaseAction } from "@gaem/shared";
import { formatTurnHolder } from "@gaem/shared";
import { computed } from "vue";

import { useGameState } from "../composables/useGameState.js";
import { useSession } from "../composables/useSession.js";

const { role } = useSession();
const { gameState, send } = useGameState();

const round = computed(() => gameState.value?.round ?? null);
const enforceTurns = computed(() => gameState.value?.enforceTurns !== false);

function setEnforceTurns(value: boolean) {
  send({ type: "setEnforceTurns", enforceTurns: value });
}

const roundGroups = computed(() => {
  const s = gameState.value;
  if (!s?.turnLog.length) return [];
  return [...s.turnLog].sort((a, b) => a.round - b.round);
});

const gmActionConfirm: Partial<Record<PhaseAction, string>> = {
  resetCombat: "Reset combat? This clears turn history and returns to deployment.",
  resetRound: "Reset the current round to its start?",
  gmEndRound: "End the current round and start the next one?",
  gmEndTurn: "End the current turn?",
};

function sendGmAction(action: PhaseAction) {
  const message = gmActionConfirm[action];
  if (message && !confirm(message)) return;
  send({ type: "phaseAction", action });
}
</script>

<template>
  <div class="turn-order-panel">
    <header class="panel-header">
      <h2 v-if="round !== null" class="round-heading">Round {{ round }}</h2>
      <p v-else class="round-heading muted">—</p>
    </header>

    <div v-if="role === 'gm'" class="gm-controls">
      <label class="enforce-turns">
        <span class="enforce-label">Enforce turns</span>
        <button
          type="button"
          role="switch"
          class="toggle"
          :class="{ on: enforceTurns }"
          :aria-checked="enforceTurns"
          @click="setEnforceTurns(!enforceTurns)"
        >
          <span class="toggle-thumb" />
        </button>
      </label>
      <button type="button" class="control-btn" @click="sendGmAction('resetCombat')">
        Reset combat
      </button>
      <button type="button" class="control-btn" @click="sendGmAction('resetRound')">
        Reset round
      </button>
      <button type="button" class="control-btn" @click="sendGmAction('gmEndRound')">
        End round
      </button>
      <button type="button" class="control-btn" @click="sendGmAction('gmEndTurn')">
        End turn
      </button>
    </div>

    <div class="history">
      <p v-if="roundGroups.length === 0" class="empty">No turns recorded yet.</p>
      <section v-for="group in roundGroups" :key="group.round" class="round-group">
        <h3 class="round-label">Round {{ group.round }}</h3>
        <ol class="turn-list">
          <li v-for="(turn, i) in group.turns" :key="`${group.round}-${i}`" class="turn-item">
            {{ gameState ? formatTurnHolder(gameState, turn) : "—" }}
          </li>
        </ol>
      </section>
    </div>
  </div>
</template>

<style scoped>
.turn-order-panel {
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

.round-heading {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.round-heading.muted {
  color: #8b949e;
}

.gm-controls {
  flex-shrink: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid #30363d;
}

.enforce-turns {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-right: 0.25rem;
}

.enforce-label {
  font-size: 0.8rem;
  font-weight: 600;
  color: #e6edf3;
  white-space: nowrap;
}

.toggle {
  position: relative;
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
  width: 1rem;
  height: 1rem;
  border-radius: 50%;
  background: #e6edf3;
  transition: transform 0.15s;
}

.toggle.on .toggle-thumb {
  transform: translateX(1rem);
}

.control-btn {
  border: 1px solid #388bfd66;
  border-radius: 8px;
  background: #388bfd22;
  color: #58a6ff;
  padding: 0.35rem 0.65rem;
  cursor: pointer;
  font-size: 0.8rem;
  font-weight: 600;
}

.control-btn:hover {
  background: #388bfd33;
  border-color: #58a6ff;
}

.history {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0.75rem 1rem 1rem;
}

.empty {
  margin: 0;
  color: #8b949e;
  font-size: 0.9rem;
}

.round-group + .round-group {
  margin-top: 1rem;
}

.round-label {
  margin: 0 0 0.4rem;
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #8b949e;
}

.turn-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.turn-item {
  padding: 0.35rem 0.5rem;
  border-radius: 6px;
  font-size: 0.9rem;
  color: #e6edf3;
}

.turn-item:nth-child(odd) {
  background: #161b22;
}
</style>
