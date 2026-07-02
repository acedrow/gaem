import { watch, type Ref } from "vue";

import type { BoardSelection } from "./useBoardSelection.js";
import type { DataCategory, DataFocus } from "./useInfoDataSelection.js";
import type { RightPanelTab } from "./useGameConsole.js";

const STORAGE_KEY = "gaem-ui";

const DATA_CATEGORIES = new Set<DataCategory>([
  "armor",
  "classes",
  "weapons",
  "effects",
  "patterns",
  "paracletus",
]);

const RIGHT_PANEL_TABS = new Set<RightPanelTab>(["console", "info", "turnOrder", "settings"]);

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
      sheetsExpanded: parsed.sheetsExpanded === true,
      dataExpanded: parsed.dataExpanded === true,
      viewport: isViewport(parsed.viewport) ? parsed.viewport : null,
    };
  } catch {
    return { ...DEFAULT_UI };
  }
}

let cached: PersistedUi | null = null;

export function readPersistedUi(): PersistedUi {
  if (cached) return cached;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    cached = raw ? parsePersistedUi(raw) : { ...DEFAULT_UI };
  } catch {
    cached = { ...DEFAULT_UI };
  }
  return cached;
}

export function writePersistedUi(patch: Partial<PersistedUi>) {
  const next = { ...readPersistedUi(), ...patch };
  cached = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
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

export function initUiPersistence(opts: {
  boardSelection: Ref<BoardSelection | null>;
  selectedSheetId: Ref<string | null>;
  dataCategory: Ref<DataCategory | null>;
  dataFocus: Ref<DataFocus | null>;
  dataFocusReturnCategory: Ref<DataCategory | null>;
  activeTab: Ref<RightPanelTab>;
  sheetsExpanded: Ref<boolean>;
  dataExpanded: Ref<boolean>;
  rightPanelCollapsed: Ref<boolean>;
  gameState: Ref<{ players: { id: string }[]; enemies: { id: string }[] } | null>;
}) {
  const {
    boardSelection,
    selectedSheetId,
    dataCategory,
    dataFocus,
    dataFocusReturnCategory,
    activeTab,
    sheetsExpanded,
    dataExpanded,
    rightPanelCollapsed,
    gameState,
  } = opts;

  const hasPanelContent = () =>
    !!(
      boardSelection.value ||
      dataCategory.value ||
      dataFocus.value ||
      selectedSheetId.value
    );

  if (hasPanelContent()) {
    rightPanelCollapsed.value = false;
  }

  watch(
    gameState,
    (s) => {
      const sel = boardSelection.value;
      if (!s || !sel) return;
      if (sel.kind === "player" && !s.players.some((p) => p.id === sel.id)) {
        boardSelection.value = null;
      } else if (sel.kind === "enemy" && !s.enemies.some((e) => e.id === sel.id)) {
        boardSelection.value = null;
      }
    },
    { immediate: true },
  );

  watch(
    [
      boardSelection,
      selectedSheetId,
      dataCategory,
      dataFocus,
      dataFocusReturnCategory,
      activeTab,
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
        sheetsExpanded: sheetsExpanded.value,
        dataExpanded: dataExpanded.value,
      }));
    },
    { deep: true },
  );
}
