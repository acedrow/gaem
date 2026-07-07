<script setup lang="ts">
import type { PlayerProfile } from "@gaem/shared";
import { computed, ref } from "vue";
import { useRouter } from "vue-router";

import { useApi } from "../composables/useApi.js";
import { useSession } from "../composables/useSession.js";
import ModalDialog from "../components/ModalDialog.vue";

type PlayerProfileOption = PlayerProfile & { isActive?: boolean };

const router = useRouter();
const { startSession } = useSession();
const { apiFetch } = useApi();

const showProfileModal = ref(false);
const profiles = ref<PlayerProfileOption[]>([]);
const selectedProfileId = ref<string | null>(null);
const newProfileName = ref("");
const loadingProfiles = ref(false);
const creatingProfile = ref(false);
const profileError = ref<string | null>(null);

const selectedProfile = computed(() => {
  if (!selectedProfileId.value) return null;
  return profiles.value.find((p) => p.id === selectedProfileId.value) ?? null;
});

async function loadProfiles() {
  loadingProfiles.value = true;
  profileError.value = null;
  try {
    const res = await apiFetch("/api/player-profiles");
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
    const res = await apiFetch("/api/player-profiles", {
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

function joinAsGm() {
  startSession("gm", null);
  router.push("/game");
}

function joinAsSelectedPlayer() {
  if (!selectedProfile.value || selectedProfile.value.isActive) return;
  showProfileModal.value = false;
  startSession("player", selectedProfile.value);
  router.push("/game");
}
</script>

<template>
  <div class="landing">
    <p class="subtitle">Choose how you want to join the game.</p>
    <div class="actions">
      <button class="cta" @click="joinAsGm">Join game as GM</button>
      <button class="cta" @click="openPlayerModal">Join game as player</button>
    </div>
  </div>

  <ModalDialog
    :open="showProfileModal"
    title="Select player profile"
    wide
    ok-label="Join game as player"
    :ok-disabled="loadingProfiles || !selectedProfile || !!selectedProfile?.isActive"
    @close="showProfileModal = false"
    @confirm="joinAsSelectedPlayer"
  >
    <p class="subtitle">Choose an existing profile or create a new one.</p>

    <p v-if="loadingProfiles" class="loading-row">
      <span class="spinner" aria-hidden="true" />
      <span class="muted">Loading profiles…</span>
    </p>
    <p v-else-if="profiles.length === 0" class="muted">No profiles yet.</p>

    <div v-if="profiles.length > 0" class="profile-list">
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
      />
      <button
        class="cta"
        :disabled="loadingProfiles || creatingProfile || !newProfileName.trim()"
        @click="createProfile"
      >
        {{ creatingProfile ? "Adding..." : "Add new player profile" }}
      </button>
    </div>
  </ModalDialog>
</template>

<style scoped>
.title {
  margin: 0;
  font-size: 1.75rem;
  font-weight: 700;
  letter-spacing: -0.03em;
  margin-bottom: 0.5rem;
}

.landing {
  padding: 1.5rem;
  margin-top: 2rem;
}
.subtitle { color: var(--color-muted); margin-bottom: 1.25rem; }
.actions { display: flex; gap: 0.75rem; flex-wrap: wrap; }
.cta {
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: var(--color-surface);
  color: var(--color-text);
  padding: 0.65rem 1rem;
  cursor: pointer;
  font-weight: 600;
}
.cta:hover { background: var(--color-surface-alt); }
.cta:disabled { opacity: 0.6; cursor: not-allowed; }

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
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text);
  border-radius: 0;
  padding: 0.5rem 0.65rem;
  cursor: pointer;
}

.profile-item.active {
  border-color: var(--color-accent);
}

.profile-item.inactive {
  opacity: 0.6;
}

.tag {
  font-size: 0.72rem;
  color: var(--color-warning);
  border: 1px solid var(--color-border);
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
  border: 1px solid var(--color-border);
  border-radius: 0;
  background: var(--color-bg);
  color: var(--color-text);
  padding: 0.55rem 0.65rem;
}

.secondary {
  background: var(--color-bg);
}

.error { color: var(--color-danger); margin: 0.5rem 0; }

.loading-row {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}

.spinner {
  width: 0.9rem;
  height: 0.9rem;
  border-radius: 50%;
  border: 2px solid var(--color-border);
  border-top-color: var(--color-success);
  animation: spin 0.7s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
