import type { GaemRole, PlayerProfile } from "@gaem/shared";
import { computed, ref } from "vue";

const STORAGE_KEY = "gaem-session";

type StoredSession = {
  role: GaemRole;
  playerProfile: { id: string; name: string } | null;
};

function loadStored(): StoredSession | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    if (parsed.role !== "gm" && parsed.role !== "player") return null;
    return parsed;
  } catch {
    return null;
  }
}

const stored = loadStored();
const role = ref<GaemRole | null>(stored?.role ?? null);
const playerProfile = ref<{ id: string; name: string } | null>(
  stored?.playerProfile ?? null
);

function persist() {
  if (!role.value) {
    sessionStorage.removeItem(STORAGE_KEY);
    return;
  }
  sessionStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      role: role.value,
      playerProfile: playerProfile.value,
    } satisfies StoredSession)
  );
}

export function useSession() {
  const isActive = computed(() => role.value !== null);
  const isGm = computed(() => role.value === "gm");

  function startSession(r: GaemRole, profile: PlayerProfile | null) {
    role.value = r;
    playerProfile.value =
      r === "player" && profile ? { id: profile.id, name: profile.name } : null;
    persist();
  }

  function clearSession() {
    role.value = null;
    playerProfile.value = null;
    persist();
  }

  function apiHeaders(): Record<string, string> {
    if (!role.value) return {};
    const headers: Record<string, string> = { "X-Gaem-Role": role.value };
    if (role.value === "player" && playerProfile.value) {
      headers["X-Gaem-Player-Key"] = playerProfile.value.id;
    }
    return headers;
  }

  return {
    role,
    playerProfile,
    isActive,
    isGm,
    startSession,
    clearSession,
    apiHeaders,
  };
}
