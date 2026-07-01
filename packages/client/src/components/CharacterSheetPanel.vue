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
import { useCharacterSheetSelection } from "../composables/useCharacterSheetSelection.js";
import { useGameState } from "../composables/useGameState.js";
import { useSession } from "../composables/useSession.js";

type PlayerProfileOption = PlayerProfile & { isActive?: boolean };

const props = defineProps<{ sheetId: string }>();

const { apiFetch, fetchPortraitUrl } = useApi();
const { role, playerProfile } = useSession();
const { gameState, send } = useGameState();
const { selectSheet, notifySheetsChanged } = useCharacterSheetSelection();

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
const editingHp = ref(false);
const hpDraft = ref(0);
const hpInputEl = ref<HTMLInputElement | null>(null);

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
  if (!sheet.value) return;
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
    <div class="panel-header">
      <h2 class="panel-title">{{ form.name || "Character sheet" }}</h2>
      <button class="close-btn" type="button" title="Close" @click="selectSheet(null)">×</button>
    </div>

    <p v-if="loading" class="muted">Loading…</p>
    <p v-else-if="error && !sheet" class="error">{{ error }}</p>

    <template v-else-if="sheet">
      <p v-if="error" class="error">{{ error }}</p>

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

      <div class="layout">
        <div class="portrait-block">
          <div class="portrait-frame">
            <img v-if="portraitUrl" :src="portraitUrl" alt="Portrait" class="portrait" />
            <span v-else class="portrait-placeholder">No portrait</span>
          </div>
          <label class="upload-btn" v-if="canEdit">
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              hidden
              :disabled="uploading"
              @change="onPortraitSelected"
            />
            {{ uploading ? "Uploading…" : "Upload portrait" }}
          </label>
        </div>

        <form class="form" @submit.prevent="saveSheet">
          <label v-if="role === 'gm'" class="field">
            <span>Player profile</span>
            <select v-model="form.player" class="input" :disabled="!canEdit">
              <option v-for="p in profiles" :key="p.id" :value="p.id">{{ p.name }}</option>
            </select>
          </label>

          <label class="field">
            <span>Name</span>
            <input v-model="form.name" class="input" type="text" required :disabled="!canEdit" />
          </label>

          <label class="field">
            <span>Class</span>
            <select v-model="form.class" class="input" required :disabled="!canEdit">
              <option value="" disabled>Select class</option>
              <option v-for="c in PLAYER_CLASSES" :key="c.name" :value="c.name">
                {{ c.name }}
              </option>
            </select>
          </label>

          <label class="field">
            <span>Armor</span>
            <select v-model="form.armor" class="input" required :disabled="!canEdit">
              <option value="" disabled>Select armor</option>
              <option v-for="a in PLAYER_ARMOR" :key="a.name" :value="a.name">
                {{ a.name }}
              </option>
            </select>
          </label>

          <label class="field">
            <span>Weapon</span>
            <select v-model="form.weapon" class="input" required :disabled="!canEdit">
              <option value="" disabled>Select weapon</option>
              <option v-for="w in PLAYER_WEAPONS" :key="w.name" :value="w.name">
                {{ w.name }}
              </option>
            </select>
          </label>

          <div v-if="canEdit" class="form-actions">
            <button class="cta" type="submit" :disabled="saving">
              {{ saving ? "Saving…" : "Save" }}
            </button>
            <button class="cta danger" type="button" :disabled="deleting" @click="deleteSheet">
              {{ deleting ? "Deleting…" : "Delete" }}
            </button>
          </div>
        </form>
      </div>

      <section v-if="selectedClass" class="detail-section">
        <h3 class="section-title">{{ selectedClass.name }}</h3>
        <p class="summary">{{ selectedClass.summary }}</p>
        <p class="body-text">{{ selectedClass.description }}</p>
      </section>

      <section v-if="selectedArmor" class="detail-section">
        <h3 class="section-title">{{ selectedArmor.name }}</h3>
        <p class="summary">{{ selectedArmor.summary }}</p>
      </section>

      <section v-if="selectedWeapon" class="detail-section">
        <h3 class="section-title">{{ selectedWeapon.name }}</h3>
        <p class="body-text">{{ selectedWeapon.description }}</p>
      </section>
    </template>
  </div>
</template>

<style scoped>
.panel {
  height: 100%;
  overflow-y: auto;
  padding: 1rem;
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

.hp-bar-block {
  margin-bottom: 1rem;
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

.input:disabled {
  opacity: 0.75;
  cursor: default;
}

.layout {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-bottom: 1.25rem;
}

.portrait-block {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.portrait-frame {
  width: 120px;
  height: 120px;
  border: 1px solid #30363d;
  border-radius: 10px;
  overflow: hidden;
  background: #161b22;
  display: grid;
  place-items: center;
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

.upload-btn {
  width: fit-content;
  border: 1px solid #30363d;
  border-radius: 8px;
  background: #161b22;
  color: #e6edf3;
  padding: 0.45rem 0.55rem;
  font-size: 0.85rem;
  cursor: pointer;
}

.upload-btn:hover {
  background: #1f2937;
}

.form {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.85rem;
  color: #8b949e;
}

.input {
  border: 1px solid #30363d;
  border-radius: 8px;
  background: #0d1117;
  color: #e6edf3;
  padding: 0.5rem 0.6rem;
  font-size: 0.9rem;
}

.form-actions {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin-top: 0.25rem;
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

.detail-section {
  margin-top: 1rem;
  padding-top: 0.85rem;
  border-top: 1px solid #30363d;
}

.section-title {
  margin: 0 0 0.35rem;
  font-size: 0.95rem;
}

.summary {
  color: #8b949e;
  margin: 0 0 0.5rem;
  font-size: 0.85rem;
}

.body-text {
  margin: 0;
  font-size: 0.85rem;
  line-height: 1.5;
}

.muted {
  color: #8b949e;
}

.error {
  color: #f85149;
}
</style>
