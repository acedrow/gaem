import { computed, ref } from "vue";

import { useCharacterSheetSelection } from "./useCharacterSheetSelection.js";
import { activeTab } from "./useGameConsole.js";

export type BoardSelection =
  | { kind: "player"; id: string }
  | { kind: "enemy"; id: string };

const boardSelection = ref<BoardSelection | null>(null);

export function useBoardSelection() {
  const { selectSheet, rightPanelCollapsed } = useCharacterSheetSelection();

  const selectedEnemyId = computed(() =>
    boardSelection.value?.kind === "enemy" ? boardSelection.value.id : null,
  );

  function clearBoardSelection() {
    boardSelection.value = null;
  }

  function closeRightPanel() {
    if (boardSelection.value) clearBoardSelection();
    else selectSheet(null);
  }

  function selectBoardPlayer(playerId: string, characterSheetId?: string) {
    boardSelection.value = { kind: "player", id: playerId };
    activeTab.value = "info";
    if (characterSheetId) {
      selectSheet(characterSheetId);
      return;
    }
    rightPanelCollapsed.value = false;
  }

  function selectBoardEnemy(enemyId: string) {
    boardSelection.value = { kind: "enemy", id: enemyId };
    activeTab.value = "info";
    rightPanelCollapsed.value = false;
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
    isPlayerSelected,
    isEnemySelected,
  };
}
