import { watch, type Ref } from "vue";
import type { GaemRole } from "@gaem/shared";

import type { BoardSelection } from "./useBoardSelection.js";
import type { DataCategory, DataFocus } from "./useInfoDataSelection.js";
import type { RightPanelTab } from "./useGameConsole.js";
import type { MainSectionTab } from "./useMainSectionTab.js";
import { useSession } from "./useSession.js";

const LEGACY_STORAGE_KEY = "gaem-ui";

const DATA_CATEGORIES = new Set<DataCategory>([
  "armor",
  "classes",
  "weapons",
  "equipment",
  "gear",
  "resources",
  "effects",
  "terrain",
  "patterns",
  "paracletus",
]);

const RIGHT_PANEL_TABS = new Set<RightPanelTab>(["console", "info", "turnOrder", "settings"]);
const MAIN_SECTION_TABS = new Set<MainSectionTab>(["taccom", "baseUpgrades"]);

export type PersistedViewport = {
  boardKey: string;
  scale: number;
  panX: number;
  panY: number;
};

export type PersistedUi = {
  boardSelection: BoardSelection | null;
  selectedSheetId: string | null;
  dataCategory: DataCategory | null;
  dataFocus: DataFocus | null;
  dataFocusReturnCategory: DataCategory | null;
  activeTab: RightPanelTab;
  activeMainTab: MainSectionTab;
  sheetsExpanded: boolean;
  dataExpanded: boolean;
  viewport: PersistedViewport | null;
};

const DEFAULT_UI: PersistedUi = {
  boardSelection: null,
  selectedSheetId: null,
  dataCategory: null,
  dataFocus: null,
  dataFocusReturnCategory: null,
  activeTab: "info",
  activeMainTab: "taccom",
  sheetsExpanded: false,
  dataExpanded: false,
  viewport: null,
};

function isBoardSelection(value: unknown): value is BoardSelection {
  if (!value || typeof value !== "object") return false;
  const v = value as { kind?: unknown; id?: unknown };
  return (
    (v.kind === "player" || v.kind === "enemy") &&
    typeof v.id === "string" &&
    v.id.length > 0
  );
}

function isDataFocus(value: unknown): value is DataFocus {
  if (!value || typeof value !== "object") return false;
  const v = value as { kind?: unknown; name?: unknown };
  return (
    (v.kind === "enemy" || DATA_CATEGORIES.has(v.kind as DataCategory)) &&
    typeof v.name === "string" &&
    v.name.length > 0
  );
}

function isViewport(value: unknown): value is PersistedViewport {
  if (!value || typeof value !== "object") return false;
  const v = value as PersistedViewport;
  return (
    typeof v.boardKey === "string" &&
    v.boardKey.length > 0 &&
    Number.isFinite(v.scale) &&
    Number.isFinite(v.panX) &&
    Number.isFinite(v.panY)
  );
}

function parsePersistedUi(raw: string): PersistedUi {
  try {
    const parsed = JSON.parse(raw) as Partial<PersistedUi>;
    return {
      boardSelection: isBoardSelection(parsed.boardSelection) ? parsed.boardSelection : null,
      selectedSheetId:
        typeof parsed.selectedSheetId === "string" ? parsed.selectedSheetId : null,
      dataCategory:
        parsed.dataCategory && DATA_CATEGORIES.has(parsed.dataCategory)
          ? parsed.dataCategory
          : null,
      dataFocus: isDataFocus(parsed.dataFocus) ? parsed.dataFocus : null,
      dataFocusReturnCategory:
        parsed.dataFocusReturnCategory &&
        DATA_CATEGORIES.has(parsed.dataFocusReturnCategory)
          ? parsed.dataFocusReturnCategory
          : null,
      activeTab:
        parsed.activeTab && RIGHT_PANEL_TABS.has(parsed.activeTab)
          ? parsed.activeTab
          : DEFAULT_UI.activeTab,
      activeMainTab:
        parsed.activeMainTab && MAIN_SECTION_TABS.has(parsed.activeMainTab)
          ? parsed.activeMainTab
          : DEFAULT_UI.activeMainTab,
      sheetsExpanded: parsed.sheetsExpanded === true,
      dataExpanded: parsed.dataExpanded === true,
      viewport: isViewport(parsed.viewport) ? parsed.viewport : null,
    };
  } catch {
    return { ...DEFAULT_UI };
  }
}

function uiStorageKey(role: GaemRole | null, playerId: string | null): string | null {
  if (role === "gm") return "gaem-ui:gm";
  if (role === "player" && playerId) return `gaem-ui:player:${playerId}`;
  return null;
}

const { role, playerProfile } = useSession();

function readFromStorage(key: string | null): PersistedUi {
  if (!key) return { ...DEFAULT_UI };
  try {
    let raw = localStorage.getItem(key);
    if (!raw && key === "gaem-ui:gm") {
      const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (legacy) {
        localStorage.setItem(key, legacy);
        raw = legacy;
      }
    }
    return raw ? parsePersistedUi(raw) : { ...DEFAULT_UI };
  } catch {
    return { ...DEFAULT_UI };
  }
}

let cached: PersistedUi | null = null;
let cachedKey: string | null = null;

function invalidateCache() {
  cached = null;
  cachedKey = null;
}

export function readPersistedUi(): PersistedUi {
  const key = uiStorageKey(role.value, playerProfile.value?.id ?? null);
  if (cached && cachedKey === key) return cached;
  cachedKey = key;
  cached = readFromStorage(key);
  return cached;
}

export function writePersistedUi(patch: Partial<PersistedUi>) {
  const key = uiStorageKey(role.value, playerProfile.value?.id ?? null);
  if (!key) return;
  const next = { ...readPersistedUi(), ...patch };
  cached = next;
  cachedKey = key;
  try {
    localStorage.setItem(key, JSON.stringify(next));
  } catch {
    // ignore quota / private browsing
  }
}

export function readPersistedViewport(boardKey: string): PersistedViewport | null {
  const viewport = readPersistedUi().viewport;
  return viewport?.boardKey === boardKey ? viewport : null;
}

export function writePersistedViewport(boardKey: string, scale: number, panX: number, panY: number) {
  writePersistedUi({ viewport: { boardKey, scale, panX, panY } });
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;

function schedulePersist(snapshot: () => Partial<PersistedUi>) {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => writePersistedUi(snapshot()), 150);
}

export type UiPersistRefs = {
  boardSelection: Ref<BoardSelection | null>;
  selectedSheetId: Ref<string | null>;
  dataCategory: Ref<DataCategory | null>;
  dataFocus: Ref<DataFocus | null>;
  dataFocusReturnCategory: Ref<DataCategory | null>;
  activeTab: Ref<RightPanelTab>;
  activeMainTab: Ref<MainSectionTab>;
  sheetsExpanded: Ref<boolean>;
  dataExpanded: Ref<boolean>;
};

export function applyPersistedUiState(refs: UiPersistRefs, persisted: PersistedUi = readPersistedUi()) {
  refs.boardSelection.value = persisted.boardSelection;
  refs.selectedSheetId.value = persisted.selectedSheetId;
  refs.dataCategory.value = persisted.dataCategory;
  refs.dataFocus.value = persisted.dataFocus;
  refs.dataFocusReturnCategory.value = persisted.dataFocusReturnCategory;
  refs.activeTab.value = persisted.activeTab;
  refs.activeMainTab.value = persisted.activeMainTab;
  refs.sheetsExpanded.value = persisted.sheetsExpanded;
  refs.dataExpanded.value = persisted.dataExpanded;
}

export function initUiPersistence(opts: UiPersistRefs) {
  const {
    boardSelection,
    selectedSheetId,
    dataCategory,
    dataFocus,
    dataFocusReturnCategory,
    activeTab,
    activeMainTab,
    sheetsExpanded,
    dataExpanded,
  } = opts;

  const refs: UiPersistRefs = {
    boardSelection,
    selectedSheetId,
    dataCategory,
    dataFocus,
    dataFocusReturnCategory,
    activeTab,
    activeMainTab,
    sheetsExpanded,
    dataExpanded,
  };

  watch(
    [role, playerProfile],
    () => {
      invalidateCache();
      applyPersistedUiState(refs);
    },
    { deep: true },
  );

  watch(
    [
      boardSelection,
      selectedSheetId,
      dataCategory,
      dataFocus,
      dataFocusReturnCategory,
      activeTab,
      activeMainTab,
      sheetsExpanded,
      dataExpanded,
    ],
    () => {
      schedulePersist(() => ({
        boardSelection: boardSelection.value,
        selectedSheetId: selectedSheetId.value,
        dataCategory: dataCategory.value,
        dataFocus: dataFocus.value,
        dataFocusReturnCategory: dataFocusReturnCategory.value,
        activeTab: activeTab.value,
        activeMainTab: activeMainTab.value,
        sheetsExpanded: sheetsExpanded.value,
        dataExpanded: dataExpanded.value,
      }));
    },
    { deep: true },
  );
}
