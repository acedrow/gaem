import { ref } from "vue";

import { readPersistedUi } from "./uiPersist.js";
import { useEnemySpawnSelection } from "./useEnemySpawnSelection.js";
import { usePatternSelection } from "./usePatternSelection.js";

export type DataCategory = "armor" | "classes" | "weapons" | "equipment" | "gear" | "resources" | "effects" | "patterns" | "paracletus";
export type DataFocusKind = DataCategory | "enemy";

export type DataFocus = {
  kind: DataFocusKind;
  name: string;
};

const persisted = readPersistedUi();
const dataCategory = ref<DataCategory | null>(persisted.dataCategory);
const dataFocus = ref<DataFocus | null>(persisted.dataFocus);
const dataFocusReturnCategory = ref<DataCategory | null>(persisted.dataFocusReturnCategory);
const dataExpanded = ref(persisted.dataExpanded);

export function useInfoDataSelection() {
  const { clearPatternSelection } = usePatternSelection();
  const { clearSpawnEnemySelection } = useEnemySpawnSelection();

  function selectDataCategory(category: DataCategory) {
    if (category !== "patterns") clearPatternSelection();
    if (category !== "paracletus") clearSpawnEnemySelection();
    dataCategory.value = category;
    dataFocus.value = null;
    dataFocusReturnCategory.value = null;
  }

  function selectDataFocus(focus: DataFocus, options?: { returnTo?: DataCategory }) {
    dataFocus.value = focus;
    dataCategory.value = focus.kind === "enemy" ? null : focus.kind;
    dataFocusReturnCategory.value = options?.returnTo ?? null;
  }

  function goBackFromDataFocus() {
    const returnTo = dataFocusReturnCategory.value;
    if (!returnTo) return;
    selectDataCategory(returnTo);
  }

  function clearDataCategory() {
    dataCategory.value = null;
    dataFocus.value = null;
    dataFocusReturnCategory.value = null;
    clearPatternSelection();
    clearSpawnEnemySelection();
  }

  return {
    dataCategory,
    dataFocus,
    dataFocusReturnCategory,
    dataExpanded,
    selectDataCategory,
    selectDataFocus,
    goBackFromDataFocus,
    clearDataCategory,
  };
}
