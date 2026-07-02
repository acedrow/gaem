import { ref } from "vue";

import { usePatternSelection } from "./usePatternSelection.js";

export type DataCategory = "armor" | "classes" | "weapons" | "patterns";
export type DataFocusKind = DataCategory | "enemy";

export type DataFocus = {
  kind: DataFocusKind;
  name: string;
};

const dataCategory = ref<DataCategory | null>(null);
const dataFocus = ref<DataFocus | null>(null);
const dataExpanded = ref(false);

export function useInfoDataSelection() {
  const { clearPatternSelection } = usePatternSelection();

  function selectDataCategory(category: DataCategory) {
    if (category !== "patterns") clearPatternSelection();
    dataCategory.value = category;
    dataFocus.value = null;
  }

  function selectDataFocus(focus: DataFocus) {
    dataFocus.value = focus;
    dataCategory.value = focus.kind === "enemy" ? null : focus.kind;
  }

  function clearDataCategory() {
    dataCategory.value = null;
    dataFocus.value = null;
    clearPatternSelection();
  }

  return {
    dataCategory,
    dataFocus,
    dataExpanded,
    selectDataCategory,
    selectDataFocus,
    clearDataCategory,
  };
}
