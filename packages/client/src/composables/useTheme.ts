import { ref, watch } from "vue";

import { useSession } from "./useSession.js";

export type ThemeId = "hellpiercers" | "infernum" | "paracletus" | "hades" | "divinity";

export type ThemeOption = {
  id: ThemeId;
  label: string;
  swatch: [string, string, string];
};

export const THEMES: ThemeOption[] = [
  { id: "hellpiercers", label: "Hellpiercers", swatch: ["#0d1117", "#161b22", "#388bfd"] },
  { id: "infernum", label: "Infernum", swatch: ["#070a10", "#0f1520", "#4d9fff"] },
  { id: "paracletus", label: "Paracletus", swatch: ["#12100e", "#1c1814", "#e8956a"] },
  { id: "hades", label: "Hades", swatch: ["#120c0c", "#1c1414", "#e05a5a"] },
  { id: "divinity", label: "Divinity", swatch: ["#faf8f5", "#ffffff", "#b8860b"] },
];

const LEGACY_STORAGE_KEY = "gaem-theme";
const DEFAULT_THEME: ThemeId = "hellpiercers";

const LEGACY_THEME_IDS: Record<string, ThemeId> = {
  default: "hellpiercers",
  midnight: "infernum",
  ember: "paracletus",
};

function themeKey(role: "gm" | "player" | null, playerId: string | null): string | null {
  if (role === "gm") return "gaem-theme:gm";
  if (role === "player" && playerId) return `gaem-theme:player:${playerId}`;
  return null;
}

function isThemeId(value: string): value is ThemeId {
  return THEMES.some((theme) => theme.id === value);
}

function normalizeThemeId(value: string): ThemeId | null {
  if (isThemeId(value)) return value;
  return LEGACY_THEME_IDS[value] ?? null;
}

function readStoredTheme(key: string | null): ThemeId {
  if (!key) return DEFAULT_THEME;
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const theme = normalizeThemeId(raw);
      if (theme) {
        if (theme !== raw) localStorage.setItem(key, theme);
        return theme;
      }
    }
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy) {
      const theme = normalizeThemeId(legacy);
      if (theme) {
        localStorage.setItem(key, theme);
        localStorage.removeItem(LEGACY_STORAGE_KEY);
        return theme;
      }
    }
  } catch {
    // ignore private browsing
  }
  return DEFAULT_THEME;
}

export function applyTheme(theme: ThemeId) {
  if (theme === DEFAULT_THEME) delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}

function writeStoredTheme(key: string | null, theme: ThemeId) {
  if (!key) return;
  try {
    localStorage.setItem(key, theme);
  } catch {
    // ignore quota / private browsing
  }
}

const { role, playerProfile } = useSession();
let currentKey = themeKey(role.value, playerProfile.value?.id ?? null);

const theme = ref<ThemeId>(readStoredTheme(currentKey));

watch(theme, (next) => {
  applyTheme(next);
  writeStoredTheme(currentKey, next);
});

watch(
  [role, playerProfile],
  () => {
    const key = themeKey(role.value, playerProfile.value?.id ?? null);
    if (key === currentKey) return;
    currentKey = key;
    const next = readStoredTheme(key);
    theme.value = next;
    applyTheme(next);
  },
  { deep: true },
);

export function initTheme() {
  applyTheme(theme.value);
}

export function useTheme() {
  return { theme, themes: THEMES };
}
