import { ref, watch } from "vue";

import { useSession } from "./useSession.js";

type PlayerSettings = {
  showHealthBars: boolean;
  showConnectionsInConsole: boolean;
};

const DEFAULT_SETTINGS: PlayerSettings = {
  showHealthBars: true,
  showConnectionsInConsole: true,
};

function settingsKey(role: "gm" | "player" | null, playerId: string | null): string | null {
  if (role === "gm") return "gaem-settings:gm";
  if (role === "player" && playerId) return `gaem-settings:player:${playerId}`;
  return null;
}

function parseSettings(raw: string): PlayerSettings {
  try {
    const parsed = JSON.parse(raw) as Partial<PlayerSettings>;
    return {
      showHealthBars: parsed.showHealthBars !== false,
      showConnectionsInConsole: parsed.showConnectionsInConsole !== false,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function readSettings(key: string | null): PlayerSettings {
  if (!key) return { ...DEFAULT_SETTINGS };
  try {
    const raw = localStorage.getItem(key);
    return raw ? parseSettings(raw) : { ...DEFAULT_SETTINGS };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function writeSettings(key: string | null, settings: PlayerSettings) {
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify(settings));
  } catch {
    // ignore quota / private browsing
  }
}

const { role, playerProfile } = useSession();
let currentKey = settingsKey(role.value, playerProfile.value?.id ?? null);

const showHealthBars = ref(readSettings(currentKey).showHealthBars);
const showConnectionsInConsole = ref(readSettings(currentKey).showConnectionsInConsole);

let persistTimer: ReturnType<typeof setTimeout> | null = null;

function schedulePersist() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    writeSettings(currentKey, {
      showHealthBars: showHealthBars.value,
      showConnectionsInConsole: showConnectionsInConsole.value,
    });
  }, 150);
}

watch([showHealthBars, showConnectionsInConsole], schedulePersist);

watch(
  [role, playerProfile],
  () => {
    const key = settingsKey(role.value, playerProfile.value?.id ?? null);
    if (key === currentKey) return;
    currentKey = key;
    const next = readSettings(key);
    showHealthBars.value = next.showHealthBars;
    showConnectionsInConsole.value = next.showConnectionsInConsole;
  },
  { deep: true },
);

export function usePlayerSettings() {
  return {
    showHealthBars,
    showConnectionsInConsole,
  };
}
