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

import { useApi } from "../composables/useApi.js";
import { useBoardSelection } from "../composables/useBoardSelection.js";
import { useCharacterSheetSelection } from "../composables/useCharacterSheetSelection.js";
import { useGameState } from "../composables/useGameState.js";
import { useSession } from "../composables/useSession.js";

type PlayerProfileOption = PlayerProfile & { isActive?: boolean };
type EditableField = "name" | "class" | "armor" | "weapon" | "player";

const props = defineProps<{ sheetId: string }>();

const { apiFetch, fetchPortraitUrl } = useApi();
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
const editingHp = ref(false);
const hpDraft = ref(0);
const hpInputEl = ref<HTMLInputElement | null>(null);
const fieldInputEl = ref<HTMLInputElement | HTMLSelectElement | null>(null);

const canEdit = computed(() => {
  if (!sheet.value) return false;
  if (role.value === "gm") return true;
  return role.value === "player" && playerProfile.value?.id === sheet.value.player;
});

const boardPlayer = computed(() =>
  gameState.value?.players.find((p) => p.characterSheetId === props.sheetId)
);

const HP_MEDIUM_THRESHOLD = 0.5;
const HP_LOW_THRESHOLD = 0.25;

const maxHp = computed(() => getClassMaxHp(form.value.class));
const currentHp = computed(() => boardPlayer.value?.hp ?? 0);
const hpPercent = computed(() => {
  if (maxHp.value <= 0) return 0;
  const hp = Math.min(currentHp.value, maxHp.value);
  return Math.max(0, Math.min(100, (hp / maxHp.value) * 100));
});
const hpBarLevel = computed(() => {
  if (maxHp.value <= 0) return "high";
  const ratio = Math.min(currentHp.value, maxHp.value) / maxHp.value;
  if (ratio < HP_LOW_THRESHOLD) return "low";
  if (ratio < HP_MEDIUM_THRESHOLD) return "medium";
  return "high";
});

const selectedClass = computed(() => getClassByName(form.value.class));
const selectedArmor = computed(() => getArmorByName(form.value.armor));
const selectedWeapon = computed(() => getWeaponByName(form.value.weapon));
const selectedProfileName = computed(
  () => profiles.value.find((p) => p.id === form.value.player)?.name ?? form.value.player
);

async function loadProfiles() {
  if (role.value !== "gm") return;
  const res = await fetch(
    import.meta.env.DEV
      ? `http://${location.hostname}:3001/api/player-profiles`
      : "/api/player-profiles"
  );
  if (res.ok) {
    const data = (await res.json()) as { profiles: PlayerProfileOption[] };
    profiles.value = data.profiles;
  }
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
    fieldInputEl.value?.focus();
    if (fieldInputEl.value instanceof HTMLInputElement) fieldInputEl.value.select();
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

function startHpEdit() {
  if (!canEdit.value || !boardPlayer.value) return;
  hpDraft.value = currentHp.value;
  editingHp.value = true;
  nextTick(() => {
    hpInputEl.value?.focus();
    hpInputEl.value?.select();
  });
}

function commitHpEdit() {
  if (!editingHp.value) return;
  editingHp.value = false;
  if (!canEdit.value || !boardPlayer.value) return;
  const hp = Math.trunc(hpDraft.value);
  if (!Number.isFinite(hp)) return;
  if (hp === currentHp.value) return;
  send({ type: "setPlayerHp", playerId: boardPlayer.value.id, hp });
}

function cancelHpEdit() {
  editingHp.value = false;
  hpDraft.value = currentHp.value;
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

          <div class="hp-bar-block">
            <div class="hp-bar-header">
              <span class="hp-bar-label">HP</span>
              <span class="hp-bar-values">
                <input
                  v-if="editingHp"
                  ref="hpInputEl"
                  v-model.number="hpDraft"
                  class="hp-inline-input"
                  type="number"
                  min="0"
                  :max="maxHp"
                  @blur="commitHpEdit"
                  @keydown.enter.prevent="commitHpEdit"
                  @keydown.esc.prevent="cancelHpEdit"
                />
                <button
                  v-else-if="canEdit && boardPlayer"
                  type="button"
                  class="hp-current hp-editable"
                  @click="startHpEdit"
                >
                  {{ currentHp }}
                </button>
                <span v-else class="hp-current">{{ currentHp }}</span>
                <span class="hp-max"> / {{ maxHp }}</span>
              </span>
            </div>
            <div class="hp-bar-track">
              <div class="hp-bar-fill" :class="hpBarLevel" :style="{ width: `${hpPercent}%` }" />
            </div>
          </div>
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

          <div class="field-row">
            <template v-if="editingField !== 'class'">
              <span class="field-label">Class:</span>
              <span class="field-value-wrap">
                <span class="field-value">{{ form.class || "—" }}</span>
                <div v-if="selectedClass" class="field-tooltip">
                  <p v-if="selectedClass.summary" class="tooltip-summary">{{ selectedClass.summary }}</p>
                  <p class="tooltip-body">{{ selectedClass.description }}</p>
                </div>
              </span>
              <button
                v-if="canEdit"
                type="button"
                class="edit-btn"
                aria-label="Edit class"
                @click="startFieldEdit('class')"
              >
                <svg class="icon"><use href="#icon-pencil" /></svg>
              </button>
            </template>
            <template v-else>
              <span class="field-label">Class:</span>
              <select
                ref="fieldInputEl"
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
          </div>

          <div class="field-row">
            <template v-if="editingField !== 'armor'">
              <span class="field-label">Armor:</span>
              <span class="field-value-wrap">
                <span class="field-value">{{ form.armor || "—" }}</span>
                <div v-if="selectedArmor" class="field-tooltip">
                  <p v-if="selectedArmor.summary" class="tooltip-summary">{{ selectedArmor.summary }}</p>
                  <p class="tooltip-body">{{ selectedArmor.description }}</p>
                </div>
              </span>
              <button
                v-if="canEdit"
                type="button"
                class="edit-btn"
                aria-label="Edit armor"
                @click="startFieldEdit('armor')"
              >
                <svg class="icon"><use href="#icon-pencil" /></svg>
              </button>
            </template>
            <template v-else>
              <span class="field-label">Armor:</span>
              <select
                ref="fieldInputEl"
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
          </div>

          <div class="field-row">
            <template v-if="editingField !== 'weapon'">
              <span class="field-label">Weapon:</span>
              <span class="field-value-wrap">
                <span class="field-value">{{ form.weapon || "—" }}</span>
                <div v-if="selectedWeapon" class="field-tooltip">
                  <p class="tooltip-body">{{ selectedWeapon.description }}</p>
                </div>
              </span>
              <button
                v-if="canEdit"
                type="button"
                class="edit-btn"
                aria-label="Edit weapon"
                @click="startFieldEdit('weapon')"
              >
                <svg class="icon"><use href="#icon-pencil" /></svg>
              </button>
            </template>
            <template v-else>
              <span class="field-label">Weapon:</span>
              <select
                ref="fieldInputEl"
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
          </div>
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

.hp-bar-block {
  width: 120px;
}

.hp-bar-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 0.35rem;
}

.hp-bar-label {
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #8b949e;
}

.hp-bar-values {
  display: inline-flex;
  align-items: baseline;
  font-size: 0.85rem;
  font-weight: 600;
}

.hp-current {
  color: #e6edf3;
}

.hp-editable {
  border: none;
  background: transparent;
  color: #e6edf3;
  font: inherit;
  font-weight: 600;
  padding: 0;
  cursor: pointer;
  border-bottom: 1px dashed #388bfd66;
}

.hp-editable:hover {
  color: #58a6ff;
  border-bottom-color: #58a6ff;
}

.hp-max {
  color: #8b949e;
  font-weight: 500;
}

.hp-inline-input {
  width: 2.75rem;
  border: 1px solid #388bfd;
  border-radius: 4px;
  background: #0d1117;
  color: #e6edf3;
  font: inherit;
  font-weight: 600;
  padding: 0 0.2rem;
  text-align: right;
  -moz-appearance: textfield;
}

.hp-inline-input::-webkit-outer-spin-button,
.hp-inline-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.hp-bar-track {
  height: 0.55rem;
  border-radius: 999px;
  background: #21262d;
  overflow: hidden;
}

.hp-bar-fill {
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, #238636, #3fb950);
  transition: width 0.2s ease, background 0.2s ease;
}

.hp-bar-fill.medium {
  background: linear-gradient(90deg, #9e6a03, #d29922);
}

.hp-bar-fill.low {
  background: linear-gradient(90deg, #8b1e1e, #f85149);
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

.field-value-wrap {
  position: relative;
  min-width: 0;
}

.field-value-wrap:hover .field-tooltip {
  display: block;
}

.field-value {
  color: #e6edf3;
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.field-tooltip {
  display: none;
  position: absolute;
  left: 0;
  top: calc(100% + 4px);
  z-index: 10;
  min-width: 180px;
  max-width: 280px;
  padding: 0.45rem 0.55rem;
  border-radius: 6px;
  border: 1px solid #30363d;
  background: #0d1117;
  color: #e6edf3;
  font-size: 0.78rem;
  line-height: 1.45;
  white-space: normal;
  box-shadow: 0 4px 12px #01040966;
  pointer-events: none;
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

.tooltip-summary {
  margin: 0 0 0.35rem;
  color: #8b949e;
  font-size: 0.75rem;
}

.tooltip-body {
  margin: 0;
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
