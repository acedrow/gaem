<script setup lang="ts">
import { ref } from "vue";
import GameBoard from "./components/GameBoard.vue";

const mode = ref<"gm" | "player" | null>(null);
</script>

<template>
  <div v-if="mode === null" class="landing">
    <h1 class="title">Gaem</h1>
    <p class="subtitle">Choose how you want to join the game.</p>
    <div class="actions">
      <button class="cta" @click="mode = 'gm'">Join game as GM</button>
      <button class="cta" @click="mode = 'player'">Join game as player</button>
    </div>
  </div>
  <GameBoard v-else :role="mode" />
</template>

<style scoped>
.title {
  margin: 0;
  font-size: 1.75rem;
  font-weight: 700;
  letter-spacing: -0.03em;
  margin-bottom: 0.5rem;
}

.landing { margin-top: 2rem; }
.subtitle { color: #8b949e; margin-bottom: 1.25rem; }
.actions { display: flex; gap: 0.75rem; flex-wrap: wrap; }
.cta {
  border: 1px solid #30363d;
  border-radius: 10px;
  background: #161b22;
  color: #e6edf3;
  padding: 0.65rem 1rem;
  cursor: pointer;
  font-weight: 600;
}
.cta:hover { background: #1f2937; }
</style>
