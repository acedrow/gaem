import type { FactionId } from "@gaem/shared";
import { ref } from "vue";

import { readPersistedUi } from "./uiPersist.js";
import { selectedFactionId } from "./useFactionSelection.js";
import { useEnemySpawnSelection } from "./useEnemySpawnSelection.js";
import { activeTab } from "./useGameConsole.js";
import { usePatternSelection } from "./usePatternSelection.js";
import { selectedTableId } from "./useTableSelection.js";

export type DataCategory = "armor" | "classes" | "weapons" | "equipment" | "gear" | "resources" | "effects" | "terrain" | "patterns" | "paracletus";
export type DataFocusKind = DataCategory | "enemy";

export type DataFocus = {
  kind: DataFocusKind;
  name: string;
};

const persisted = readPersistedUi();
const dataCategory = ref<DataCategory | null>(persisted.dataCategory);
const dataFocus = ref<DataFocus | null>(persisted.dataFocus);
const dataFocusReturnCategory = ref<DataCategory | null>(persisted.dataFocusReturnCategory);
const dataCategoryReturnFactionId = ref<FactionId | null>(persisted.dataCategoryReturnFactionId);
const dataExpanded = ref(persisted.dataExpanded);

export function useInfoDataSelection() {
  const { clearPatternSelection } = usePatternSelection();
  const { clearSpawnEnemySelection } = useEnemySpawnSelection();

  function selectDataCategory(category: DataCategory, options?: { returnToFaction?: FactionId }) {
    if (category !== "patterns") clearPatternSelection();
    if (category !== "paracletus") clearSpawnEnemySelection();
    selectedFactionId.value = null;
    selectedTableId.value = null;
    dataCategory.value = category;
    dataFocus.value = null;
    dataFocusReturnCategory.value = null;
    dataCategoryReturnFactionId.value = options?.returnToFaction ?? null;
  }

  function selectDataFocus(focus: DataFocus, options?: { returnTo?: DataCategory }) {
    selectedFactionId.value = null;
    selectedTableId.value = null;
    dataFocus.value = focus;
    dataCategory.value = focus.kind === "enemy" ? null : focus.kind;
    dataFocusReturnCategory.value = options?.returnTo ?? null;
    dataCategoryReturnFactionId.value = null;
  }

  function goBackFromDataFocus() {
    const returnTo = dataFocusReturnCategory.value;
    if (!returnTo) return;
    selectDataCategory(returnTo);
  }

  function goBackFromDataCategory() {
    const returnTo = dataCategoryReturnFactionId.value;
    if (!returnTo) return;
    clearDataCategory();
    selectedFactionId.value = returnTo;
    activeTab.value = "info";
  }

  function clearDataCategory() {
    dataCategory.value = null;
    dataFocus.value = null;
    dataFocusReturnCategory.value = null;
    dataCategoryReturnFactionId.value = null;
    clearPatternSelection();
    clearSpawnEnemySelection();
  }

  return {
    dataCategory,
    dataFocus,
    dataFocusReturnCategory,
    dataCategoryReturnFactionId,
    dataExpanded,
    selectDataCategory,
    selectDataFocus,
    goBackFromDataFocus,
    goBackFromDataCategory,
    clearDataCategory,
  };
}
