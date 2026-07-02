import { ref } from "vue";

import { useEnemySpawnSelection } from "./useEnemySpawnSelection.js";
import { usePatternSelection } from "./usePatternSelection.js";

export type DataCategory = "armor" | "classes" | "weapons" | "patterns" | "paracletus";
export type DataFocusKind = DataCategory | "enemy";

export type DataFocus = {
  kind: DataFocusKind;
  name: string;
};

const dataCategory = ref<DataCategory | null>(null);
const dataFocus = ref<DataFocus | null>(null);
const dataFocusReturnCategory = ref<DataCategory | null>(null);
const dataExpanded = ref(false);

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
