<script setup lang="ts">
import { nextTick, ref, watch } from "vue";

import { useGameConsole } from "../composables/useGameConsole.js";

const { entries } = useGameConsole();
const listEl = ref<HTMLElement | null>(null);

function formatTime(at: number): string {
  const d = new Date(at);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${mm}/${dd} ${hh}:${min}`;
}

watch(
  () => entries.value.length,
  async () => {
    await nextTick();
    if (listEl.value) listEl.value.scrollTop = listEl.value.scrollHeight;
  },
);
</script>

<template>
  <div class="console-panel">
    <div v-if="entries.length === 0" class="empty">No game events yet.</div>
    <ul v-else ref="listEl" class="log">
      <li v-for="entry in entries" :key="entry.id" class="entry">
        <time class="time">{{ formatTime(entry.at) }}</time>
        <span class="message">
          <span class="actor" :class="entry.actor.role">{{ entry.actor.name }}</span>
          {{ " " + entry.message }}
        </span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.console-panel {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.empty {
  padding: 1rem;
  color: #8b949e;
  font-size: 0.85rem;
}

.log {
  list-style: none;
  margin: 0;
  padding: 0.5rem 0.75rem 0.75rem;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}

.entry {
  display: flex;
  gap: 0.5rem;
  padding: 0.35rem 0;
  font-size: 0.8rem;
  line-height: 1.4;
  border-bottom: 1px solid #21262d;
}

.entry:last-child {
  border-bottom: none;
}

.time {
  flex-shrink: 0;
  color: #6e7681;
  font-size: 0.72rem;
  font-variant-numeric: tabular-nums;
  padding-top: 0.1rem;
}

.message {
  color: #c9d1d9;
  min-width: 0;
}

.actor {
  font-weight: 600;
}

.actor.gm {
  color: #3fb950;
}

.actor.player {
  color: #388bfd;
}
</style>
