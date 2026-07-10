import type { FactionId } from "@gaem/shared";
import { ref } from "vue";

import { readPersistedUi } from "./uiPersist.js";
import { boardSelection } from "./useBoardSelection.js";
import { useCharacterSheetSelection } from "./useCharacterSheetSelection.js";
import { activeTab } from "./useGameConsole.js";
import { useInfoDataSelection } from "./useInfoDataSelection.js";
import { selectedMapId } from "./useMapSelection.js";

const FACTION_IDS = new Set<FactionId>(["syncrasis", "autophyes", "paracletus"]);

const persisted = readPersistedUi();
export const selectedFactionId = ref<FactionId | null>(
  persisted.selectedFactionId && FACTION_IDS.has(persisted.selectedFactionId)
    ? persisted.selectedFactionId
    : null,
);
export const factionsExpanded = ref(persisted.factionsExpanded);

export function useFactionSelection() {
  const { selectSheet } = useCharacterSheetSelection();
  const { clearDataCategory } = useInfoDataSelection();

  function selectFaction(id: FactionId | null) {
    if (id) {
      boardSelection.value = null;
      selectSheet(null);
      selectedMapId.value = null;
      clearDataCategory();
      activeTab.value = "info";
    }
    selectedFactionId.value = id;
  }

  function clearFaction() {
    selectedFactionId.value = null;
  }

  return {
    selectedFactionId,
    factionsExpanded,
    selectFaction,
    clearFaction,
  };
}
