import { computed, ref } from "vue";

import { readPersistedUi } from "./uiPersist.js";
import { useCharacterSheetSelection } from "./useCharacterSheetSelection.js";
import { activeTab } from "./useGameConsole.js";
import { useGameState } from "./useGameState.js";
import { useInfoDataSelection } from "./useInfoDataSelection.js";

export type BoardSelection =
  | { kind: "player"; id: string }
  | { kind: "enemy"; id: string };

const persisted = readPersistedUi();
const boardSelection = ref<BoardSelection | null>(persisted.boardSelection);

export function useBoardSelection() {
  const { selectSheet, rightPanelCollapsed } = useCharacterSheetSelection();
  const { gameState } = useGameState();
  const { clearDataCategory, dataCategory, dataFocus } = useInfoDataSelection();

  const selectedEnemyId = computed(() =>
    boardSelection.value?.kind === "enemy" ? boardSelection.value.id : null,
  );

  function clearBoardSelection() {
    boardSelection.value = null;
  }

  function closeRightPanel() {
    if (boardSelection.value) clearBoardSelection();
    else if (dataCategory.value || dataFocus.value) clearDataCategory();
    else selectSheet(null);
  }

  function selectBoardPlayer(playerId: string, characterSheetId?: string) {
    clearDataCategory();
    boardSelection.value = { kind: "player", id: playerId };
    activeTab.value = "info";
    if (characterSheetId) {
      selectSheet(characterSheetId);
      return;
    }
    rightPanelCollapsed.value = false;
  }

  function selectBoardEnemy(enemyId: string) {
    clearDataCategory();
    boardSelection.value = { kind: "enemy", id: enemyId };
    activeTab.value = "info";
    rightPanelCollapsed.value = false;
  }

  function selectSheetFromNav(sheetId: string) {
    clearDataCategory();
    selectSheet(sheetId);
    const player = gameState.value?.players.find((p) => p.characterSheetId === sheetId);
    boardSelection.value = player ? { kind: "player", id: player.id } : null;
  }

  function isPlayerSelected(playerId: string): boolean {
    return boardSelection.value?.kind === "player" && boardSelection.value.id === playerId;
  }

  function isEnemySelected(enemyId: string): boolean {
    return boardSelection.value?.kind === "enemy" && boardSelection.value.id === enemyId;
  }

  return {
    boardSelection,
    selectedEnemyId,
    clearBoardSelection,
    closeRightPanel,
    selectBoardPlayer,
    selectBoardEnemy,
    selectSheetFromNav,
    isPlayerSelected,
    isEnemySelected,
  };
}
