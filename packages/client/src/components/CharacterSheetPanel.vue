<script setup lang="ts">
import type { CharacterSheet, PlayerProfile } from "@gaem/shared";
import {
  getArmorByName,
  getClassByName,
  getClassMaxHp,
  getWeaponByName,
  PLAYER_ARMOR,
  PLAYER_CLASSES,
  PLAYER_WEAPONS,
} from "@gaem/shared";
import { computed, nextTick, onUnmounted, ref, watch } from "vue";

import CombatStrip from "./CombatStrip.vue";
import HpBar from "./HpBar.vue";
import SheetGearFieldRow from "./SheetGearFieldRow.vue";
import { useApi } from "../composables/useApi.js";
import { useBoardSelection } from "../composables/useBoardSelection.js";
import { useCharacterSheetSelection } from "../composables/useCharacterSheetSelection.js";
import { useGameState } from "../composables/useGameState.js";
import { useSession } from "../composables/useSession.js";

type PlayerProfileOption = PlayerProfile & { isActive?: boolean };
type EditableField = "name" | "class" | "armor" | "weapon" | "player";

const props = defineProps<{ sheetId: string }>();

const { apiFetch, fetchPortraitUrl, fetchPlayerProfiles } = useApi();
const { role, playerProfile } = useSession();
const { gameState, send } = useGameState();
const { selectSheet, notifySheetsChanged } = useCharacterSheetSelection();
const { closeRightPanel } = useBoardSelection();

const sheet = ref<CharacterSheet | null>(null);
const profiles = ref<PlayerProfileOption[]>([]);
const loading = ref(true);
const saving = ref(false);
const deleting = ref(false);
const uploading = ref(false);
const error = ref<string | null>(null);
const portraitUrl = ref<string | null>(null);

const form = ref({
  player: "",
  name: "",
  class: "",
  armor: "",
  weapon: "",
});
const editingField = ref<EditableField | null>(null);
const fieldInputEl = ref<HTMLInputElement | HTMLSelectElement | null>(null);
const classFieldEl = ref<InstanceType<typeof SheetGearFieldRow> | null>(null);
const armorFieldEl = ref<InstanceType<typeof SheetGearFieldRow> | null>(null);
const weaponFieldEl = ref<InstanceType<typeof SheetGearFieldRow> | null>(null);

const canEdit = computed(() => {
  if (!sheet.value) return false;
  if (role.value === "gm") return true;
  return role.value === "player" && playerProfile.value?.id === sheet.value.player;
});

const boardPlayer = computed(() =>
  gameState.value?.players.find((p) => p.characterSheetId === props.sheetId)
);

const maxHp = computed(() => getClassMaxHp(form.value.class));
const currentHp = computed(() => boardPlayer.value?.hp ?? 0);

const selectedClass = computed(() => getClassByName(form.value.class));
const selectedArmor = computed(() => getArmorByName(form.value.armor));
const selectedWeapon = computed(() => getWeaponByName(form.value.weapon));
const speed = computed(() => selectedArmor.value?.speed);
const selectedProfileName = computed(
  () => profiles.value.find((p) => p.id === form.value.player)?.name ?? form.value.player
);

async function loadProfiles() {
  if (role.value !== "gm") return;
  profiles.value = await fetchPlayerProfiles();
}

async function loadPortrait() {
  if (portraitUrl.value) {
    URL.revokeObjectURL(portraitUrl.value);
    portraitUrl.value = null;
  }
  if (!sheet.value?.portraitKey) return;
  portraitUrl.value = await fetchPortraitUrl(props.sheetId);
}

async function loadSheet() {
  loading.value = true;
  error.value = null;
  try {
    const res = await apiFetch(`/api/character-sheets/${props.sheetId}`);
    if (!res.ok) throw new Error("Character sheet not found");
    const data = (await res.json()) as { sheet: CharacterSheet };
    sheet.value = data.sheet;
    form.value = {
      player: data.sheet.player,
      name: data.sheet.name,
      class: data.sheet.class,
      armor: data.sheet.armor,
      weapon: data.sheet.weapon,
    };
    await loadPortrait();
  } catch {
    error.value = "Unable to load character sheet";
    sheet.value = null;
  } finally {
    loading.value = false;
  }
}

async function saveSheet() {
  if (!sheet.value || !canEdit.value) return;
  saving.value = true;
  error.value = null;
  try {
    const body: Record<string, string> = {
      name: form.value.name,
      class: form.value.class,
      armor: form.value.armor,
      weapon: form.value.weapon,
    };
    if (role.value === "gm") body.player = form.value.player;

    const res = await apiFetch(`/api/character-sheets/${props.sheetId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(data?.error ?? "Failed to save");
    }
    const data = (await res.json()) as { sheet: CharacterSheet };
    sheet.value = data.sheet;
    notifySheetsChanged();
    if (boardPlayer.value) {
      send({
        type: "syncPlayerSheet",
        characterSheetId: props.sheetId,
        class: form.value.class,
        armor: form.value.armor,
        weapon: form.value.weapon,
      });
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Unable to save";
  } finally {
    saving.value = false;
  }
}

function resetFormFromSheet() {
  if (!sheet.value) return;
  form.value = {
    player: sheet.value.player,
    name: sheet.value.name,
    class: sheet.value.class,
    armor: sheet.value.armor,
    weapon: sheet.value.weapon,
  };
}

function startFieldEdit(field: EditableField) {
  if (!canEdit.value) return;
  editingField.value = field;
  nextTick(() => {
    const el =
      field === "class"
        ? classFieldEl.value?.fieldInputEl
        : field === "armor"
          ? armorFieldEl.value?.fieldInputEl
          : field === "weapon"
            ? weaponFieldEl.value?.fieldInputEl
            : fieldInputEl.value;
    el?.focus();
    if (el instanceof HTMLInputElement) el.select();
  });
}

async function commitFieldEdit() {
  if (!editingField.value) return;
  editingField.value = null;
  await saveSheet();
}

function cancelFieldEdit() {
  editingField.value = null;
  resetFormFromSheet();
}

async function deleteSheet() {
  if (!sheet.value || !confirm("Delete this character sheet?")) return;
  deleting.value = true;
  error.value = null;
  try {
    const res = await apiFetch(`/api/character-sheets/${props.sheetId}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error("Failed to delete");
    notifySheetsChanged();
    closeRightPanel();
    selectSheet(null);
  } catch {
    error.value = "Unable to delete character sheet";
  } finally {
    deleting.value = false;
  }
}

async function onPortraitSelected(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file || !sheet.value) return;

  uploading.value = true;
  error.value = null;
  try {
    const res = await apiFetch(`/api/character-sheets/${props.sheetId}/portrait`, {
      method: "PUT",
      headers: { "Content-Type": file.type },
      body: file,
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(data?.error ?? "Failed to upload portrait");
    }
    const data = (await res.json()) as { sheet: CharacterSheet };
    sheet.value = data.sheet;
    await loadPortrait();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Unable to upload portrait";
  } finally {
    uploading.value = false;
    input.value = "";
  }
}

function commitHp(hp: number) {
  if (!canEdit.value || !boardPlayer.value) return;
  send({ type: "setPlayerHp", playerId: boardPlayer.value.id, hp });
}

watch(
  () => props.sheetId,
  async (id) => {
    if (!id) return;
    editingField.value = null;
    await loadProfiles();
    await loadSheet();
  },
  { immediate: true }
);

onUnmounted(() => {
  if (portraitUrl.value) URL.revokeObjectURL(portraitUrl.value);
});
</script>

<template>
  <div class="panel">
    <svg aria-hidden="true" class="icon-defs">
      <symbol id="icon-pencil" viewBox="0 0 16 16">
        <path
          d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.387 8.387L2.5 14.5l1.126-3.666 8.387-8.387z"
        />
      </symbol>
    </svg>

    <div class="panel-header">
      <h2 class="panel-title">{{ form.name || "Character sheet" }}</h2>
      <button class="close-btn" type="button" title="Close" @click="closeRightPanel">×</button>
    </div>

    <p v-if="loading" class="muted">Loading…</p>
    <p v-else-if="error && !sheet" class="error">{{ error }}</p>

    <div v-else-if="sheet" class="panel-body">
      <CombatStrip v-if="boardPlayer" :player-id="boardPlayer.id" />
      <p v-if="error" class="error">{{ error }}</p>

      <div class="layout">
        <div class="portrait-column">
          <div class="portrait-frame" :class="{ editable: canEdit }">
            <img v-if="portraitUrl" :src="portraitUrl" alt="Portrait" class="portrait" />
            <span v-else class="portrait-placeholder">No portrait</span>
            <label v-if="canEdit" class="portrait-edit-btn" :class="{ uploading }">
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                hidden
                :disabled="uploading"
                @change="onPortraitSelected"
              />
              <svg class="icon"><use href="#icon-pencil" /></svg>
            </label>
          </div>

          <HpBar
            class="portrait-hp-bar"
            :current-hp="currentHp"
            :max-hp="maxHp"
            :editable="canEdit && !!boardPlayer"
            @commit="commitHp"
          />

          <p v-if="speed != null" class="speed-stat">Speed {{ speed }}</p>
        </div>

        <div class="fields">
          <div v-if="role === 'gm'" class="field-row">
            <template v-if="editingField !== 'player'">
              <span class="field-label">Player:</span>
              <span class="field-value">{{ selectedProfileName || "—" }}</span>
              <button
                v-if="canEdit"
                type="button"
                class="edit-btn"
                aria-label="Edit player"
                @click="startFieldEdit('player')"
              >
                <svg class="icon"><use href="#icon-pencil" /></svg>
              </button>
            </template>
            <template v-else>
              <span class="field-label">Player:</span>
              <select
                ref="fieldInputEl"
                v-model="form.player"
                class="field-input"
                @change="commitFieldEdit"
                @blur="commitFieldEdit"
                @keydown.esc.prevent="cancelFieldEdit"
              >
                <option v-for="p in profiles" :key="p.id" :value="p.id">{{ p.name }}</option>
              </select>
            </template>
          </div>

          <div class="field-row">
            <template v-if="editingField !== 'name'">
              <span class="field-label">Name:</span>
              <span class="field-value">{{ form.name || "—" }}</span>
              <button
                v-if="canEdit"
                type="button"
                class="edit-btn"
                aria-label="Edit name"
                @click="startFieldEdit('name')"
              >
                <svg class="icon"><use href="#icon-pencil" /></svg>
              </button>
            </template>
            <template v-else>
              <span class="field-label">Name:</span>
              <input
                ref="fieldInputEl"
                v-model="form.name"
                class="field-input"
                type="text"
                required
                @blur="commitFieldEdit"
                @keydown.enter.prevent="commitFieldEdit"
                @keydown.esc.prevent="cancelFieldEdit"
              />
            </template>
          </div>

          <SheetGearFieldRow
            ref="classFieldEl"
            label="Class"
            :value="form.class"
            kind="classes"
            :item="selectedClass"
            :editing="editingField === 'class'"
            :can-edit="canEdit"
            @start-edit="startFieldEdit('class')"
          >
            <template #edit-icon>
              <svg class="icon"><use href="#icon-pencil" /></svg>
            </template>
            <template #input="{ inputEl }">
              <select
                :ref="inputEl"
                v-model="form.class"
                class="field-input"
                required
                @change="commitFieldEdit"
                @blur="commitFieldEdit"
                @keydown.esc.prevent="cancelFieldEdit"
              >
                <option value="" disabled>Select class</option>
                <option v-for="c in PLAYER_CLASSES" :key="c.name" :value="c.name">
                  {{ c.name }}
                </option>
              </select>
            </template>
          </SheetGearFieldRow>

          <SheetGearFieldRow
            ref="armorFieldEl"
            label="Armor"
            :value="form.armor"
            kind="armor"
            :item="selectedArmor"
            :editing="editingField === 'armor'"
            :can-edit="canEdit"
            @start-edit="startFieldEdit('armor')"
          >
            <template #edit-icon>
              <svg class="icon"><use href="#icon-pencil" /></svg>
            </template>
            <template #input="{ inputEl }">
              <select
                :ref="inputEl"
                v-model="form.armor"
                class="field-input"
                required
                @change="commitFieldEdit"
                @blur="commitFieldEdit"
                @keydown.esc.prevent="cancelFieldEdit"
              >
                <option value="" disabled>Select armor</option>
                <option v-for="a in PLAYER_ARMOR" :key="a.name" :value="a.name">
                  {{ a.name }}
                </option>
              </select>
            </template>
          </SheetGearFieldRow>

          <SheetGearFieldRow
            ref="weaponFieldEl"
            label="Weapon"
            :value="form.weapon"
            kind="weapons"
            :item="selectedWeapon"
            :editing="editingField === 'weapon'"
            :can-edit="canEdit"
            @start-edit="startFieldEdit('weapon')"
          >
            <template #edit-icon>
              <svg class="icon"><use href="#icon-pencil" /></svg>
            </template>
            <template #input="{ inputEl }">
              <select
                :ref="inputEl"
                v-model="form.weapon"
                class="field-input"
                required
                @change="commitFieldEdit"
                @blur="commitFieldEdit"
                @keydown.esc.prevent="cancelFieldEdit"
              >
                <option value="" disabled>Select weapon</option>
                <option v-for="w in PLAYER_WEAPONS" :key="w.name" :value="w.name">
                  {{ w.name }}
                </option>
              </select>
            </template>
          </SheetGearFieldRow>
        </div>
      </div>
    </div>

    <div v-if="canEdit && sheet" class="panel-footer">
      <button class="cta danger" type="button" :disabled="deleting || saving" @click="deleteSheet">
        {{ deleting ? "Deleting…" : "Delete" }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 1rem;
}

.panel-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-right: 0.75rem;
}

.panel-footer {
  flex-shrink: 0;
  padding-top: 1rem;
}

.icon-defs {
  position: absolute;
  width: 0;
  height: 0;
  overflow: hidden;
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
  font-size: 1.1rem;
  font-weight: 700;
  line-height: 1.3;
}

.close-btn {
  flex-shrink: 0;
  border: none;
  background: transparent;
  color: #8b949e;
  font-size: 1.4rem;
  line-height: 1;
  cursor: pointer;
  padding: 0 0.15rem;
}

.close-btn:hover {
  color: #e6edf3;
}

.layout {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.portrait-column {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.portrait-frame {
  position: relative;
  width: 120px;
  height: 120px;
  border: 1px solid #30363d;
  border-radius: 10px;
  overflow: hidden;
  background: #161b22;
  display: grid;
  place-items: center;
}

.portrait-frame.editable:hover .portrait-edit-btn,
.portrait-frame.editable:focus-within .portrait-edit-btn {
  opacity: 1;
}

.portrait {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.portrait-placeholder {
  color: #8b949e;
  font-size: 0.85rem;
}

.portrait-edit-btn {
  position: absolute;
  top: 4px;
  right: 4px;
  display: grid;
  place-items: center;
  width: 1.65rem;
  height: 1.65rem;
  border-radius: 6px;
  border: 1px solid #30363d;
  background: #0d1117dd;
  color: #e6edf3;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.portrait-edit-btn:hover {
  background: #161b22;
  color: #58a6ff;
}

.portrait-edit-btn.uploading {
  opacity: 1;
  cursor: wait;
}

.portrait-edit-btn .icon {
  width: 0.85rem;
  height: 0.85rem;
  fill: currentColor;
}

.portrait-hp-bar {
  width: 120px;
}

.speed-stat {
  margin: 0;
  font-size: 0.8rem;
  font-weight: 600;
  color: #8b949e;
}

.fields {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.field-row {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.9rem;
  line-height: 1.4;
  min-height: 1.75rem;
}

.field-label {
  flex-shrink: 0;
  color: #8b949e;
  font-weight: 500;
}

.field-value {
  color: #e6edf3;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.field-input {
  flex: 1;
  min-width: 0;
  border: 1px solid #388bfd;
  border-radius: 6px;
  background: #0d1117;
  color: #e6edf3;
  padding: 0.2rem 0.45rem;
  font: inherit;
  font-size: 0.9rem;
}

.edit-btn {
  flex-shrink: 0;
  display: grid;
  place-items: center;
  width: 1.4rem;
  height: 1.4rem;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: #8b949e;
  cursor: pointer;
  padding: 0;
}

.edit-btn:hover {
  color: #58a6ff;
  background: #21262d;
}

.edit-btn .icon {
  width: 0.75rem;
  height: 0.75rem;
  fill: currentColor;
}

.cta {
  border: 1px solid #30363d;
  border-radius: 8px;
  background: #161b22;
  color: #e6edf3;
  padding: 0.45rem 0.75rem;
  cursor: pointer;
  font-weight: 600;
  font-size: 0.85rem;
}

.cta:hover {
  background: #1f2937;
}

.cta:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.danger {
  border-color: #f8514966;
  color: #f85149;
}

.muted {
  color: #8b949e;
}

.error {
  color: #f85149;
}
</style>
