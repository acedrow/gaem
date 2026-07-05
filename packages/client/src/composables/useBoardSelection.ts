import { computed, ref } from "vue";
import { swarmGroupForEnemy } from "@gaem/shared";

import { readPersistedUi } from "./uiPersist.js";
import { useCharacterSheetSelection } from "./useCharacterSheetSelection.js";
import { activeTab } from "./useGameConsole.js";
import { useGameState } from "./useGameState.js";
import { useInfoDataSelection } from "./useInfoDataSelection.js";

export type BoardSelection =
  | { kind: "player"; id: string }
  | { kind: "enemy"; id: string; swarmMemberIds?: string[]; soloSwarmMember?: boolean };

const persisted = readPersistedUi();
const boardSelection = ref<BoardSelection | null>(persisted.boardSelection);

export function useBoardSelection() {
  const { selectSheet, cancelGearPick, gearPick } = useCharacterSheetSelection();
  const { gameState } = useGameState();
  const { clearDataCategory, dataCategory, dataFocus } = useInfoDataSelection();

  const selectedEnemyId = computed(() =>
    boardSelection.value?.kind === "enemy" ? boardSelection.value.id : null,
  );

  const selectedSwarmMemberIds = computed(() =>
    boardSelection.value?.kind === "enemy" ? boardSelection.value.swarmMemberIds : undefined,
  );

  const isSoloSwarmMemberSelected = computed(
    () =>
      boardSelection.value?.kind === "enemy" && boardSelection.value.soloSwarmMember === true,
  );

  function clearBoardSelection() {
    boardSelection.value = null;
  }

  function closeRightPanel() {
    if (gearPick.value) {
      cancelGearPick();
      return;
    }
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
  }

  function toggleBoardEnemy(enemyId: string) {
    const sel = boardSelection.value;
    if (sel?.kind === "enemy") {
      const members = sel.swarmMemberIds ?? [sel.id];
      if (members.includes(enemyId)) {
        clearBoardSelection();
        return;
      }
    }
    selectBoardEnemy(enemyId);
  }

  function selectBoardEnemy(enemyId: string) {
    clearDataCategory();
    const s = gameState.value;
    const group = s ? swarmGroupForEnemy(s, enemyId) : null;
    boardSelection.value = {
      kind: "enemy",
      id: group?.canonicalId ?? enemyId,
      swarmMemberIds: group && group.size > 1 ? group.memberIds : undefined,
    };
    activeTab.value = "info";
  }

  function selectBoardEnemyMember(enemyId: string) {
    clearDataCategory();
    const s = gameState.value;
    const group = s ? swarmGroupForEnemy(s, enemyId) : null;
    if (!group || group.size < 2) {
      selectBoardEnemy(enemyId);
      return;
    }
    boardSelection.value = {
      kind: "enemy",
      id: enemyId,
      swarmMemberIds: [enemyId],
      soloSwarmMember: true,
    };
    activeTab.value = "info";
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
    const sel = boardSelection.value;
    if (sel?.kind !== "enemy") return false;
    if (sel.soloSwarmMember) return sel.id === enemyId;
    if (sel.id === enemyId) return true;
    return sel.swarmMemberIds?.includes(enemyId) ?? false;
  }

  return {
    boardSelection,
    selectedEnemyId,
    selectedSwarmMemberIds,
    isSoloSwarmMemberSelected,
    clearBoardSelection,
    closeRightPanel,
    selectBoardPlayer,
    selectBoardEnemy,
    selectBoardEnemyMember,
    toggleBoardEnemy,
    selectSheetFromNav,
    isPlayerSelected,
    isEnemySelected,
  };
}
