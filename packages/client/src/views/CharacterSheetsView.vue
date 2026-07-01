<script setup lang="ts">
import type { CharacterSheet, PlayerProfile } from "@gaem/shared";
import { PLAYER_ARMOR, PLAYER_CLASSES, PLAYER_WEAPONS } from "@gaem/shared";
import { computed, onMounted, ref } from "vue";
import { RouterLink, useRouter } from "vue-router";

import { useApi } from "../composables/useApi.js";
import { useSession } from "../composables/useSession.js";

type PlayerProfileOption = PlayerProfile & { isActive?: boolean };

const router = useRouter();
const { apiFetch } = useApi();
const { role, playerProfile } = useSession();

const sheets = ref<CharacterSheet[]>([]);
const profiles = ref<PlayerProfileOption[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const showCreate = ref(false);
const creating = ref(false);

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

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const [sheetsRes, profilesRes] = await Promise.all([
      apiFetch("/api/character-sheets"),
      fetch(
        import.meta.env.DEV
          ? `http://${location.hostname}:3001/api/player-profiles`
          : "/api/player-profiles"
      ),
    ]);
    if (!sheetsRes.ok) throw new Error("Failed to load character sheets");
    const sheetsData = (await sheetsRes.json()) as { sheets: CharacterSheet[] };
    sheets.value = sheetsData.sheets;

    if (profilesRes.ok) {
      const profilesData = (await profilesRes.json()) as { profiles: PlayerProfileOption[] };
      profiles.value = profilesData.profiles;
    }
  } catch {
    error.value = "Unable to load character sheets";
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  createForm.value = {
    player: role.value === "player" && playerProfile.value ? playerProfile.value.id : "",
    name: "",
    class: "",
    armor: "",
    weapon: "",
  };
  showCreate.value = true;
}

async function createSheet() {
  creating.value = true;
  error.value = null;
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
    await router.push(`/character-sheets/${data.sheet.id}`);
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Unable to create sheet";
  } finally {
    creating.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="page">
    <div class="header">
      <h1 class="title">Character Sheets</h1>
      <button class="cta" type="button" @click="openCreate">New sheet</button>
    </div>

    <p v-if="loading" class="muted">Loading…</p>
    <p v-else-if="error" class="error">{{ error }}</p>
    <p v-else-if="sheets.length === 0" class="muted">No character sheets yet.</p>

    <div v-else class="sheet-list">
      <RouterLink
        v-for="sheet in sheets"
        :key="sheet.id"
        class="sheet-item"
        :to="`/character-sheets/${sheet.id}`"
      >
        <span class="sheet-name">{{ sheet.name }}</span>
        <span class="sheet-meta">
          {{ sheet.class }}
          <template v-if="role === 'gm'">
            · {{ profileNameById.get(sheet.player) ?? sheet.player }}
          </template>
        </span>
      </RouterLink>
    </div>

    <div v-if="showCreate" class="modal-backdrop" @click.self="showCreate = false">
      <div class="modal">
        <h2 class="modal-title">New character sheet</h2>
        <p class="hint">Fill in the required fields. You can add a portrait on the next screen.</p>

        <label v-if="role === 'gm'" class="field">
          <span>Player profile</span>
          <select v-model="createForm.player" class="input">
            <option value="" disabled>Select player</option>
            <option v-for="p in profiles" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
        </label>

        <label class="field">
          <span>Name</span>
          <input v-model="createForm.name" class="input" type="text" />
        </label>

        <label class="field">
          <span>Class</span>
          <select v-model="createForm.class" class="input">
            <option value="" disabled>Select class</option>
            <option v-for="c in PLAYER_CLASSES" :key="c.name" :value="c.name">
              {{ c.name }}
            </option>
          </select>
        </label>

        <label class="field">
          <span>Armor</span>
          <select v-model="createForm.armor" class="input">
            <option value="" disabled>Select armor</option>
            <option v-for="a in PLAYER_ARMOR" :key="a.name" :value="a.name">
              {{ a.name }}
            </option>
          </select>
        </label>

        <label class="field">
          <span>Weapon</span>
          <select v-model="createForm.weapon" class="input">
            <option value="" disabled>Select weapon</option>
            <option v-for="w in PLAYER_WEAPONS" :key="w.name" :value="w.name">
              {{ w.name }}
            </option>
          </select>
        </label>

        <div class="modal-actions">
          <button class="cta secondary" type="button" @click="showCreate = false">Cancel</button>
          <button
            class="cta"
            type="button"
            :disabled="creating || !createForm.name || !createForm.class || !createForm.armor || !createForm.weapon || (role === 'gm' && !createForm.player)"
            @click="createSheet"
          >
            {{ creating ? "Creating…" : "Create" }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page { max-width: 640px; }
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;
}
.title {
  margin: 0;
  font-size: 1.35rem;
  font-weight: 700;
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
.cta:hover { background: #1f2937; }
.cta:disabled { opacity: 0.6; cursor: not-allowed; }
.secondary { background: #0d1117; }
.muted { color: #8b949e; }
.error { color: #f85149; }
.sheet-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.sheet-item {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  padding: 0.65rem 0.75rem;
  border: 1px solid #30363d;
  border-radius: 8px;
  background: #161b22;
  color: #e6edf3;
  text-decoration: none;
}
.sheet-item:hover { border-color: #388bfd; }
.sheet-name { font-weight: 600; }
.sheet-meta { font-size: 0.85rem; color: #8b949e; }
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: grid;
  place-items: center;
  padding: 1rem;
}
.modal {
  width: min(480px, 100%);
  background: #0f1419;
  border: 1px solid #30363d;
  border-radius: 12px;
  padding: 1rem;
}
.modal-title { margin: 0 0 0.25rem; font-size: 1.1rem; }
.hint { color: #8b949e; font-size: 0.9rem; margin-bottom: 1rem; }
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
  border-radius: 8px;
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
</style>
