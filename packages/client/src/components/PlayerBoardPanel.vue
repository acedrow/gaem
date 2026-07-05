<script setup lang="ts">
import { getPlayerMaxHp } from "@gaem/shared";
import { computed } from "vue";

import { useBoardSelection } from "../composables/useBoardSelection.js";
import { useGameState } from "../composables/useGameState.js";

const props = defineProps<{ playerId: string }>();

const { gameState } = useGameState();
const { closeRightPanel } = useBoardSelection();

const player = computed(() => gameState.value?.players.find((p) => p.id === props.playerId));
const displayName = computed(() => player.value?.nickname ?? player.value?.id ?? "Player");
const maxHp = computed(() => (player.value ? getPlayerMaxHp(player.value) : 0));
const currentHp = computed(() => player.value?.hp ?? 0);
</script>

<template>
  <div class="panel">
    <div class="panel-header">
      <h2 class="panel-title">{{ displayName }}</h2>
      <button class="close-btn" type="button" title="Close" @click="closeRightPanel">×</button>
    </div>

    <div v-if="player" class="panel-body">
      <p v-if="player.class" class="meta">Class: {{ player.class }}</p>
      <p class="meta">HP {{ currentHp }} / {{ maxHp }}</p>
      <p class="meta">Position ({{ player.x }}, {{ player.y }})</p>
      <p class="muted">No character sheet linked.</p>
    </div>

    <p v-else class="muted">Player not found.</p>
  </div>
</template>

<style scoped>
.panel-body {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.panel-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.panel-title {
  margin: 0;
}

.close-btn {
  flex-shrink: 0;
  border: none;
  background: transparent;
  color: var(--color-muted);
  font-size: 1.4rem;
  line-height: 1;
  cursor: pointer;
  padding: 0 0.15rem;
}

.close-btn:hover {
  color: var(--color-text);
}

.meta {
  margin: 0;
  font-size: 0.9rem;
  color: var(--color-text-secondary);
}

.muted {
  margin: 0.5rem 0 0;
  color: var(--color-muted);
  font-size: 0.85rem;
}
</style>
