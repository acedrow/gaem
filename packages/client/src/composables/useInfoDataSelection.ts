import { ref } from "vue";

export type DataCategory = "armor" | "classes" | "weapons";
export type DataFocusKind = DataCategory | "enemy";

export type DataFocus = {
  kind: DataFocusKind;
  name: string;
};

const dataCategory = ref<DataCategory | null>(null);
const dataFocus = ref<DataFocus | null>(null);
const dataExpanded = ref(false);

export function useInfoDataSelection() {
  function selectDataCategory(category: DataCategory) {
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
