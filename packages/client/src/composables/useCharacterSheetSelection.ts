import { ref } from "vue";

import { activeTab } from "./useGameConsole.js";

const selectedSheetId = ref<string | null>(null);
const sheetsExpanded = ref(false);
const sheetsVersion = ref(0);
const sidebarCollapsed = ref(false);
const rightPanelCollapsed = ref(false);

export function useCharacterSheetSelection() {
  function selectSheet(id: string | null) {
    selectedSheetId.value = id;
    if (id) {
      rightPanelCollapsed.value = false;
      activeTab.value = "info";
    }
  }

  function notifySheetsChanged() {
    sheetsVersion.value++;
  }

  return {
    selectedSheetId,
    sheetsExpanded,
    sheetsVersion,
    sidebarCollapsed,
    rightPanelCollapsed,
    selectSheet,
    notifySheetsChanged,
  };
}
