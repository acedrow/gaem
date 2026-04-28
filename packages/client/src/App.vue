<script setup lang="ts">
import type { PlayerProfile } from "@gaem/shared";
import { computed, ref } from "vue";
import GameBoard from "./components/GameBoard.vue";

type PlayerProfileOption = PlayerProfile & { isActive?: boolean };

const mode = ref<"gm" | "player" | null>(null);
const showProfileModal = ref(false);
const profiles = ref<PlayerProfileOption[]>([]);
const selectedProfileId = ref<string | null>(null);
const newProfileName = ref("");
const loadingProfiles = ref(false);
const creatingProfile = ref(false);
const profileError = ref<string | null>(null);

const apiBase = computed(() =>
  import.meta.env.DEV ? `http://${location.hostname}:3001` : ""
);

const selectedProfile = computed(() => {
  if (!selectedProfileId.value) return null;
  return profiles.value.find((p) => p.id === selectedProfileId.value) ?? null;
});

async function loadProfiles() {
  loadingProfiles.value = true;
  profileError.value = null;
  try {
    const res = await fetch(`${apiBase.value}/api/player-profiles`);
    if (!res.ok) throw new Error("Failed to load profiles");
    const data = (await res.json()) as { profiles: PlayerProfileOption[] };
    profiles.value = data.profiles;
    if (!selectedProfileId.value && profiles.value.length > 0) {
      const firstAvailable = profiles.value.find((p) => !p.isActive);
      selectedProfileId.value = firstAvailable?.id ?? null;
    }
  } catch {
    profileError.value = "Unable to load player profiles";
  } finally {
    loadingProfiles.value = false;
  }
}

async function openPlayerModal() {
  showProfileModal.value = true;
  await loadProfiles();
}

async function createProfile() {
  const name = newProfileName.value.trim();
  if (!name) return;
  creatingProfile.value = true;
  profileError.value = null;
  try {
    const res = await fetch(`${apiBase.value}/api/player-profiles`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) throw new Error("Failed to create profile");
    const data = (await res.json()) as { profile: PlayerProfile };
    profiles.value = [...profiles.value, { ...data.profile, isActive: false }];
    selectedProfileId.value = data.profile.id;
    newProfileName.value = "";
  } catch {
    profileError.value = "Unable to create player profile";
  } finally {
    creatingProfile.value = false;
  }
}

function joinAsSelectedPlayer() {
  if (!selectedProfile.value || selectedProfile.value.isActive) return;
  showProfileModal.value = false;
  mode.value = "player";
}
</script>

<template>
  <div v-if="mode === null" class="landing">
    <h1 class="title">Gaem</h1>
    <p class="subtitle">Choose how you want to join the game.</p>
    <div class="actions">
      <button class="cta" @click="mode = 'gm'">Join game as GM</button>
      <button class="cta" @click="openPlayerModal">Join game as player</button>
    </div>
  </div>
  <GameBoard v-else :role="mode" :player-profile="selectedProfile" />

  <div v-if="showProfileModal" class="modal-backdrop" @click.self="showProfileModal = false">
    <div class="modal">
      <h2 class="modal-title">Select player profile</h2>
      <p class="subtitle">Choose an existing profile or create a new one.</p>

      <p v-if="loadingProfiles" class="loading-row">
        <span class="spinner" aria-hidden="true" />
        <span class="muted">Loading profiles…</span>
      </p>
      <p v-else-if="profiles.length === 0" class="muted">No profiles yet.</p>

      <div class="profile-list" v-if="profiles.length > 0">
        <button
          v-for="p in profiles"
          :key="p.id"
          type="button"
          class="profile-item"
          :disabled="loadingProfiles"
          :class="{ active: selectedProfileId === p.id, inactive: p.isActive }"
          @click="!p.isActive && (selectedProfileId = p.id)"
        >
          {{ p.name }}
          <span v-if="p.isActive" class="tag">In game</span>
        </button>
      </div>

      <p v-if="profileError" class="error">{{ profileError }}</p>

      <div class="create-row">
        <input
          v-model="newProfileName"
          class="name-input"
          type="text"
          placeholder="New player name"
          :disabled="loadingProfiles || creatingProfile"
          @keyup.enter="createProfile"
        />
        <button
          class="cta"
          :disabled="loadingProfiles || creatingProfile || !newProfileName.trim()"
          @click="createProfile"
        >
          {{ creatingProfile ? "Adding..." : "Add new player profile" }}
        </button>
      </div>

      <div class="modal-actions">
        <button class="cta secondary" :disabled="loadingProfiles" @click="showProfileModal = false">
          Cancel
        </button>
        <button
          class="cta"
          :disabled="loadingProfiles || !selectedProfile || !!selectedProfile.isActive"
          @click="joinAsSelectedPlayer"
        >
          Join game as player
        </button>
      </div>
    </div>
  </div>
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
.cta:disabled { opacity: 0.6; cursor: not-allowed; }

.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: grid;
  place-items: center;
  padding: 1rem;
}

.modal {
  width: min(560px, 100%);
  background: #0f1419;
  border: 1px solid #30363d;
  border-radius: 12px;
  padding: 1rem;
}

.modal-title {
  margin: 0 0 0.25rem;
  font-size: 1.1rem;
}

.profile-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin: 0 0 1rem;
  max-height: 220px;
  overflow: auto;
}

.profile-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  text-align: left;
  border: 1px solid #30363d;
  background: #161b22;
  color: #e6edf3;
  border-radius: 8px;
  padding: 0.5rem 0.65rem;
  cursor: pointer;
}

.profile-item.active {
  border-color: #388bfd;
}

.profile-item.inactive {
  opacity: 0.6;
}

.tag {
  font-size: 0.72rem;
  color: #d29922;
  border: 1px solid #30363d;
  border-radius: 999px;
  padding: 0.1rem 0.45rem;
}

.create-row {
  display: flex;
  gap: 0.6rem;
  flex-wrap: wrap;
  margin-top: 0.75rem;
}

.name-input {
  flex: 1 1 220px;
  border: 1px solid #30363d;
  border-radius: 8px;
  background: #0d1117;
  color: #e6edf3;
  padding: 0.55rem 0.65rem;
}

.modal-actions {
  margin-top: 0.9rem;
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}

.secondary {
  background: #0d1117;
}

.muted { color: #8b949e; }
.error { color: #f85149; margin: 0.5rem 0; }

.loading-row {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}

.spinner {
  width: 0.9rem;
  height: 0.9rem;
  border-radius: 50%;
  border: 2px solid #30363d;
  border-top-color: #3fb950;
  animation: spin 0.7s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
