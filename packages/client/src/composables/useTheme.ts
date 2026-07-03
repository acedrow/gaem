import { ref, watch } from "vue";

export type ThemeId = "default" | "midnight" | "ember";

export type ThemeOption = {
  id: ThemeId;
  label: string;
  swatch: [string, string, string];
};

export const THEMES: ThemeOption[] = [
  { id: "default", label: "Default", swatch: ["#0d1117", "#161b22", "#388bfd"] },
  { id: "midnight", label: "Midnight", swatch: ["#070a10", "#0f1520", "#4d9fff"] },
  { id: "ember", label: "Ember", swatch: ["#12100e", "#1c1814", "#e8956a"] },
];

const STORAGE_KEY = "gaem-theme";
const DEFAULT_THEME: ThemeId = "default";

function isThemeId(value: string): value is ThemeId {
  return THEMES.some((theme) => theme.id === value);
}

function readStoredTheme(): ThemeId {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw && isThemeId(raw)) return raw;
  } catch {
    // ignore private browsing
  }
  return DEFAULT_THEME;
}

export function applyTheme(theme: ThemeId) {
  if (theme === DEFAULT_THEME) delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}

function writeStoredTheme(theme: ThemeId) {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // ignore quota / private browsing
  }
}

const theme = ref<ThemeId>(readStoredTheme());

watch(theme, (next) => {
  applyTheme(next);
  writeStoredTheme(next);
});

export function initTheme() {
  applyTheme(theme.value);
}

export function useTheme() {
  return { theme, themes: THEMES };
}
