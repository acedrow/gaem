<script setup lang="ts">
import type { CharacterSheet, PlayerProfile } from "@gaem/shared";
import { computed, ref, watch } from "vue";

import { useApi } from "../composables/useApi.js";
import { useBoardSelection } from "../composables/useBoardSelection.js";
import { useCharacterSheetSelection } from "../composables/useCharacterSheetSelection.js";
import { activeTab } from "../composables/useGameConsole.js";
import type { DataCategory } from "../composables/useInfoDataSelection.js";
import { useInfoDataSelection } from "../composables/useInfoDataSelection.js";
import { useSession } from "../composables/useSession.js";
import CharacterSheetFormFields from "./CharacterSheetFormFields.vue";
import ModalDialog from "./ModalDialog.vue";

type PlayerProfileOption = PlayerProfile & { isActive?: boolean };

const { apiFetch, fetchPlayerProfiles } = useApi();
const { role } = useSession();
const { selectedSheetId, sheetsExpanded, sheetsVersion, selectSheet } =
  useCharacterSheetSelection();
const { clearBoardSelection, selectSheetFromNav } = useBoardSelection();
const { dataCategory, dataExpanded, selectDataCategory } = useInfoDataSelection();

const sheets = ref<CharacterSheet[]>([]);
const profiles = ref<PlayerProfileOption[]>([]);
const loading = ref(false);
const loadError = ref<string | null>(null);
const showCreate = ref(false);
const creating = ref(false);
const createError = ref<string | null>(null);

const createForm = ref({
  player: "",
  name: "",
  class: "",
  armor: "",
  weapon: "",
});

const profileNameById = computed(() => {
  const map = new Map<string, string>();
  for (const p of profiles.value) map.set(p.id, p.name);
  return map;
});

async function loadSheets() {
  loading.value = true;
  loadError.value = null;
  try {
    const [sheetsRes, profilesList] = await Promise.all([
      apiFetch("/api/character-sheets"),
      fetchPlayerProfiles(),
    ]);
    if (!sheetsRes.ok) throw new Error("Failed to load character sheets");
    const sheetsData = (await sheetsRes.json()) as { sheets: CharacterSheet[] };
    sheets.value = sheetsData.sheets;
    profiles.value = profilesList;
  } catch {
    loadError.value = "Unable to load sheets";
  } finally {
    loading.value = false;
  }
}

function toggleSheets() {
  sheetsExpanded.value = !sheetsExpanded.value;
}

function toggleData() {
  dataExpanded.value = !dataExpanded.value;
}

function onSelectSheet(sheetId: string) {
  selectSheetFromNav(sheetId);
}

function onSelectData(category: DataCategory) {
  clearBoardSelection();
  selectSheet(null);
  selectDataCategory(category);
  activeTab.value = "info";
}

function openCreate() {
  createForm.value = { player: "", name: "", class: "", armor: "", weapon: "" };
  createError.value = null;
  showCreate.value = true;
}

async function createSheet() {
  creating.value = true;
  createError.value = null;
  try {
    const res = await apiFetch("/api/character-sheets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(createForm.value),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(data?.error ?? "Failed to create sheet");
    }
    const data = (await res.json()) as { sheet: CharacterSheet };
    showCreate.value = false;
    await loadSheets();
    selectSheetFromNav(data.sheet.id);
  } catch (e) {
    createError.value = e instanceof Error ? e.message : "Unable to create sheet";
  } finally {
    creating.value = false;
  }
}

watch(sheetsExpanded, (expanded) => {
  if (expanded && sheets.value.length === 0 && !loading.value) loadSheets();
});

watch(sheetsVersion, () => {
  if (sheetsExpanded.value) loadSheets();
});
</script>

<template>
  <nav class="side-nav">
    <button class="nav-link nav-toggle" :class="{ expanded: sheetsExpanded }" type="button" @click="toggleSheets">
      Character Sheets
      <span class="chevron" aria-hidden="true">{{ sheetsExpanded ? "▾" : "▸" }}</span>
    </button>

    <div v-if="sheetsExpanded" class="sheet-sublist">
      <p v-if="loading" class="sublist-muted">Loading…</p>
      <p v-else-if="loadError" class="sublist-error">{{ loadError }}</p>
      <template v-else>
        <button v-for="sheet in sheets" :key="sheet.id" class="sheet-item"
          :class="{ selected: selectedSheetId === sheet.id }" type="button" @click="onSelectSheet(sheet.id)">
          <span class="sheet-name">{{ sheet.name }}</span>
          <span class="sheet-meta">
            {{ profileNameById.get(sheet.player) ?? sheet.player }}
          </span>
        </button>
        <p v-if="sheets.length === 0" class="sublist-muted">No sheets yet.</p>
      </template>
      <button v-if="role === 'gm'" class="new-sheet-btn" type="button" @click="openCreate">+ New sheet</button>
    </div>

    <button class="nav-link nav-toggle" :class="{ expanded: dataExpanded }" type="button" @click="toggleData">
      Data
      <span class="chevron" aria-hidden="true">{{ dataExpanded ? "▾" : "▸" }}</span>
    </button>

    <div v-if="dataExpanded" class="sheet-sublist">
      <button
        class="sheet-item"
        :class="{ selected: dataCategory === 'armor' }"
        type="button"
        @click="onSelectData('armor')"
      >
        <span class="sheet-name">Armor</span>
      </button>
      <button
        class="sheet-item"
        :class="{ selected: dataCategory === 'classes' }"
        type="button"
        @click="onSelectData('classes')"
      >
        <span class="sheet-name">Classes</span>
      </button>
      <button
        class="sheet-item"
        :class="{ selected: dataCategory === 'weapons' }"
        type="button"
        @click="onSelectData('weapons')"
      >
        <span class="sheet-name">Weapons</span>
      </button>
      <button
        class="sheet-item"
        :class="{ selected: dataCategory === 'effects' }"
        type="button"
        @click="onSelectData('effects')"
      >
        <span class="sheet-name">Effects</span>
      </button>
      <button
        class="sheet-item"
        :class="{ selected: dataCategory === 'patterns' }"
        type="button"
        @click="onSelectData('patterns')"
      >
        <span class="sheet-name">Patterns</span>
      </button>
      <button
        v-if="role === 'gm'"
        class="sheet-item"
        :class="{ selected: dataCategory === 'paracletus' }"
        type="button"
        @click="onSelectData('paracletus')"
      >
        <span class="sheet-name">Enemies — Paracletus</span>
      </button>
    </div>

    <ModalDialog :open="showCreate" title="New character sheet" @close="showCreate = false">
      <CharacterSheetFormFields
        v-model="createForm"
        :profiles="profiles"
        show-player
      />

      <p v-if="createError" class="sublist-error">{{ createError }}</p>

      <template #actions>
        <button class="cta secondary" type="button" @click="showCreate = false">Cancel</button>
        <button
          class="cta"
          type="button"
          :disabled="creating || !createForm.player || !createForm.name || !createForm.class || !createForm.armor || !createForm.weapon"
          @click="createSheet"
        >
          {{ creating ? "Creating…" : "Create" }}
        </button>
      </template>
    </ModalDialog>
  </nav>
</template>

<style scoped>
.side-nav {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  min-width: 10rem;
  padding: 0 0.75rem 1rem;
}

.nav-link {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0.65rem;
  border-radius: 0;
  color: #8b949e;
  text-decoration: none;
  font-weight: 600;
  font-size: 0.9rem;
  border: 1px solid transparent;
}

.nav-link.active {
  color: #e6edf3;
  background: #161b22;
  border-color: #30363d;
}

.nav-toggle {
  width: 100%;
  text-align: left;
  background: transparent;
  cursor: pointer;
  font-family: inherit;
}

.nav-toggle:hover,
.nav-toggle.expanded {
  color: #e6edf3;
  background: #161b22;
}

.chevron {
  font-size: 1.5rem;
  color: #8b949e;
}

.sheet-sublist {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  padding-left: 0.5rem;
  margin-bottom: 0.25rem;
}

.sheet-item {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  padding: 0.4rem 0.55rem;
  border: 1px solid transparent;
  border-radius: 0;
  background: transparent;
  color: #8b949e;
  text-align: left;
  cursor: pointer;
  font-family: inherit;
  font-size: 0.85rem;
}

.sheet-item:hover {
  color: #e6edf3;
  background: #161b22;
}

.sheet-item.selected {
  color: #e6edf3;
  background: #161b22;
  border-color: #30363d;
}

.sheet-name {
  font-weight: 600;
}

.sheet-meta {
  font-size: 0.75rem;
  color: #6e7681;
}

.sublist-muted {
  margin: 0;
  padding: 0.25rem 0.55rem;
  font-size: 0.8rem;
  color: #6e7681;
}

.sublist-error {
  margin: 0;
  padding: 0.25rem 0.55rem;
  font-size: 0.8rem;
  color: #f85149;
}

.new-sheet-btn {
  margin-top: 0.25rem;
  padding: 0.35rem 0.55rem;
  border: 1px dashed #30363d;
  border-radius: 0;
  background: transparent;
  color: #8b949e;
  font-size: 0.8rem;
  cursor: pointer;
  font-family: inherit;
  text-align: left;
}

.new-sheet-btn:hover {
  color: #e6edf3;
  border-color: #388bfd;
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: grid;
  place-items: center;
  padding: 1rem;
  z-index: 100;
}

.modal {
  width: min(480px, 100%);
  background: #0f1419;
  border: 1px solid #30363d;
  border-radius: 12px;
  padding: 1rem;
}

.modal-title {
  margin: 0 0 0.75rem;
  font-size: 1.1rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  margin-bottom: 0.75rem;
  font-size: 0.85rem;
  color: #8b949e;
}

.input {
  border: 1px solid #30363d;
  border-radius: 0;
  background: #0d1117;
  color: #e6edf3;
  padding: 0.55rem 0.65rem;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

.cta {
  border: 1px solid #30363d;
  border-radius: 10px;
  background: #161b22;
  color: #e6edf3;
  padding: 0.55rem 0.85rem;
  cursor: pointer;
  font-weight: 600;
}

.cta:hover {
  background: #1f2937;
}

.cta:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.secondary {
  background: #0d1117;
}
</style>
