<script setup lang="ts">
import type { CharacterSheet } from "@gaem/shared";
import { computed, onMounted, ref, watch } from "vue";

import { useApi } from "../composables/useApi.js";
import { useBoardSelection } from "../composables/useBoardSelection.js";
import { useCharacterSheetSelection } from "../composables/useCharacterSheetSelection.js";
import { useInfoDataSelection } from "../composables/useInfoDataSelection.js";
import { useSession } from "../composables/useSession.js";
import {
  kindLabel,
  searchGameData,
  type GameDataSearchResult,
} from "../lib/game-data-search.js";

const query = ref("");
const sheets = ref<CharacterSheet[]>([]);

const { apiFetch } = useApi();
const { role } = useSession();
const { clearBoardSelection } = useBoardSelection();
const { selectDataFocus } = useInfoDataSelection();
const { rightPanelCollapsed, selectSheet, sheetsVersion } = useCharacterSheetSelection();

const isGm = computed(() => role.value === "gm");

const results = computed(() =>
  searchGameData(query.value, {
    includeEnemies: isGm.value,
    characterSheets: sheets.value,
  }),
);

const placeholder = computed(() =>
  isGm.value
    ? "Classes, armor, weapons, enemies, character sheets…"
    : "Classes, armor, weapons, character sheets…",
);

const hint = computed(() =>
  isGm.value
    ? "Search classes, armor, weapons, enemies, and character sheets by name or keyword."
    : "Search classes, armor, weapons, and character sheets by name or keyword.",
);

async function loadSheets() {
  try {
    const res = await apiFetch("/api/character-sheets");
    if (!res.ok) return;
    const data = (await res.json()) as { sheets: CharacterSheet[] };
    sheets.value = data.sheets;
  } catch {
    sheets.value = [];
  }
}

function onSelect(result: GameDataSearchResult) {
  if (result.kind === "characterSheet" && result.sheetId) {
    clearBoardSelection();
    selectSheet(result.sheetId);
  } else if (result.kind !== "characterSheet") {
    selectDataFocus({ kind: result.kind, name: result.name });
  }
  rightPanelCollapsed.value = false;
}

onMounted(loadSheets);
watch(sheetsVersion, loadSheets);
</script>

<template>
  <div class="search-panel">
    <label class="search-label">
      <span class="search-label-text">Search game data</span>
      <input
        v-model="query"
        class="search-input"
        type="search"
        :placeholder="placeholder"
        autocomplete="off"
        spellcheck="false"
      />
    </label>

    <ul v-if="query.trim() && results.length" class="results">
      <li v-for="result in results" :key="`${result.kind}:${result.sheetId ?? result.name}`">
        <button class="result-btn" type="button" @click="onSelect(result)">
          <span class="result-name">{{ result.name }}</span>
          <span class="result-meta">
            <span class="result-kind">{{ kindLabel(result.kind) }}</span>
            <span v-if="result.subtitle" class="result-subtitle">{{ result.subtitle }}</span>
          </span>
        </button>
      </li>
    </ul>

    <p v-else-if="query.trim()" class="empty">No matches for “{{ query.trim() }}”.</p>
    <p v-else class="hint">{{ hint }}</p>
  </div>
</template>

<style scoped>
.search-panel {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1rem;
  height: 100%;
  min-height: 0;
}

.search-label {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  flex-shrink: 0;
}

.search-label-text {
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #8b949e;
}

.search-input {
  width: 100%;
  border: 1px solid #30363d;
  border-radius: 8px;
  background: #0d1117;
  color: #e6edf3;
  padding: 0.6rem 0.75rem;
  font-size: 0.9rem;
  font-family: inherit;
}

.search-input:focus {
  outline: none;
  border-color: #388bfd;
}

.search-input::placeholder {
  color: #6e7681;
}

.results {
  list-style: none;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.result-btn {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  padding: 0.55rem 0.65rem;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: #e6edf3;
  text-align: left;
  cursor: pointer;
  font-family: inherit;
}

.result-btn:hover {
  background: #161b22;
  border-color: #30363d;
}

.result-name {
  font-size: 0.9rem;
  font-weight: 600;
}

.result-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  align-items: baseline;
}

.result-kind {
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: #388bfd;
}

.result-subtitle {
  font-size: 0.78rem;
  color: #8b949e;
}

.hint,
.empty {
  margin: 0;
  font-size: 0.85rem;
  line-height: 1.5;
  color: #6e7681;
}

.empty {
  color: #8b949e;
}
</style>
