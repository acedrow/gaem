<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from "vue";

import { useApi } from "../composables/useApi.js";
import { useGameConsole } from "../composables/useGameConsole.js";
import NumberStepper from "./NumberStepper.vue";
import SegmentedControl from "./SegmentedControl.vue";

const { entries, activeTab } = useGameConsole();
const { apiFetch } = useApi();

const listEl = ref<HTMLElement | null>(null);
const quantity = ref(1);
const diceMax = ref<6 | 10>(6);
const bonus = ref(0);
const rolling = ref(false);

function formatTime(at: number): string {
  const d = new Date(at);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${mm}/${dd} ${hh}:${min}`;
}

function clampQuantity(value: number): number {
  return Math.max(1, Math.min(100, value));
}

async function rollDice() {
  if (rolling.value) return;
  rolling.value = true;
  try {
    const res = await apiFetch("/api/random-integers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        n: quantity.value,
        min: 1,
        max: diceMax.value,
        bonus: bonus.value,
      }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(data?.error ?? "Roll failed");
    }
  } catch {
    // console sync handles successful rolls; errors stay silent in UI for now
  } finally {
    rolling.value = false;
  }
}

async function scrollLogToBottom() {
  await nextTick();
  if (listEl.value) listEl.value.scrollTop = listEl.value.scrollHeight;
}

watch(() => entries.value.length, scrollLogToBottom);

watch(activeTab, (tab) => {
  if (tab === "console") void scrollLogToBottom();
});

onMounted(() => {
  if (activeTab.value === "console") void scrollLogToBottom();
});
</script>

<template>
  <div class="console-panel">
    <div class="log-area">
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

    <form class="dice-bar" @submit.prevent="rollDice">
      <NumberStepper
        v-model="quantity"
        :min="1"
        :max="100"
        :disabled="rolling"
        :clamp="clampQuantity"
      />

      <SegmentedControl
        v-model="diceMax"
        :disabled="rolling"
        :options="[
          { value: 6, label: 'd6' },
          { value: 10, label: 'd10' },
        ]"
      />

      <span class="plus-icon" aria-hidden="true">+</span>

      <NumberStepper v-model="bonus" :disabled="rolling" />

      <button type="submit" class="roll-btn" :disabled="rolling">
        {{ rolling ? "…" : "Roll" }}
      </button>
    </form>
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

.log-area {
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

.dice-bar {
  flex-shrink: 0;
  display: flex;
  flex-wrap: wrap;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  row-gap: 0.5rem;
  padding: 0.6rem 0.75rem;
  border-top: 1px solid #30363d;
  background: #161b22;
}

.stepper {
  display: flex;
  align-items: center;
  gap: 0;
  flex-shrink: 0;
}

.step-btn {
  width: 1.75rem;
  height: 1.75rem;
  padding: 0;
  border: 1px solid #30363d;
  background: #21262d;
  color: #c9d1d9;
  font-size: 1rem;
  line-height: 1;
  cursor: pointer;
}

.step-btn:first-child {
  border-radius: 6px 0 0 6px;
}

.step-btn:last-child {
  border-radius: 0 6px 6px 0;
}

.step-btn:hover:not(:disabled) {
  background: #30363d;
  color: #e6edf3;
}

.step-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.step-input {
  width: 2.25rem;
  height: 1.75rem;
  padding: 0;
  border: 1px solid #30363d;
  border-left: none;
  border-right: none;
  background: #0d1117;
  color: #e6edf3;
  font-size: 0.85rem;
  text-align: center;
  font-variant-numeric: tabular-nums;
  -moz-appearance: textfield;
  appearance: textfield;
}

.step-input::-webkit-outer-spin-button,
.step-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.step-input:disabled {
  opacity: 0.5;
}

.dice-type {
  display: flex;
  gap: 0;
  flex-shrink: 0;
}

.dice-btn {
  padding: 0.3rem 0.55rem;
  border: 1px solid #30363d;
  background: #21262d;
  color: #8b949e;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
}

.dice-btn:first-child {
  border-radius: 6px 0 0 6px;
}

.dice-btn:last-child {
  border-radius: 0 6px 6px 0;
  border-left: none;
}

.dice-btn:hover:not(:disabled) {
  color: #e6edf3;
  background: #30363d;
}

.dice-btn.active {
  background: #388bfd;
  border-color: #388bfd;
  color: #fff;
}

.dice-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.plus-icon {
  flex-shrink: 0;
  font-size: 1.35rem;
  font-weight: 300;
  color: #6e7681;
  line-height: 1;
  user-select: none;
  pointer-events: none;
}

.roll-btn {
  margin-left: auto;
  padding: 0.35rem 0.85rem;
  border: 1px solid #238636;
  border-radius: 6px;
  background: #238636;
  color: #fff;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  flex-grow: 1;
}

.roll-btn:hover:not(:disabled) {
  background: #2ea043;
  border-color: #2ea043;
}

.roll-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
