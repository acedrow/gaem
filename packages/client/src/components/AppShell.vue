<script setup lang="ts">
import type { PhaseAction } from "@gaem/shared";
import { isPlayerDowned, kataptyNeedsTargetPick, remainingPlayerIds, roundPhaseLabel, turnHolderLabel } from "@gaem/shared";
import { computed, onMounted } from "vue";
import { useRouter } from "vue-router";

import { useBoardActionMode } from "../composables/useBoardActionMode.js";
import { useBoardSelection } from "../composables/useBoardSelection.js";
import { useCharacterSheetSelection } from "../composables/useCharacterSheetSelection.js";
import { activeTab } from "../composables/useGameConsole.js";
import { useGameConnection } from "../composables/useGameConnection.js";
import { useGameState } from "../composables/useGameState.js";
import { useInfoDataSelection } from "../composables/useInfoDataSelection.js";
import { activeMainTab } from "../composables/useMainSectionTab.js";
import { useSession } from "../composables/useSession.js";
import { showToast } from "../composables/useToasts.js";
import { initUiPersistence } from "../composables/uiPersist.js";
import ActionBar from "./ActionBar.vue";
import BaseUpgradesPanel from "./BaseUpgradesPanel.vue";
import GmActionBar from "./GmActionBar.vue";
import ReversalPrompt from "./ReversalPrompt.vue";
import GameBoard from "./GameBoard.vue";
import RightPanel from "./RightPanel.vue";
import SideNav from "./SideNav.vue";

const router = useRouter();
const { role, playerProfile, clearSession } = useSession();
const { selectedSheetId, sheetsExpanded, selectSheet } = useCharacterSheetSelection();
const { boardSelection, selectBoardPlayer, clearBoardSelection, selectSheetFromNav } = useBoardSelection();
const { dataCategory, dataFocus, dataFocusReturnCategory, dataExpanded, clearDataCategory, selectDataCategory } =
  useInfoDataSelection();
const { connection } = useGameConnection();
const { gameState, yourPlayerId, send } = useGameState();
const { setMode } = useBoardActionMode();

onMounted(() => {
  initUiPersistence({
    boardSelection,
    selectedSheetId,
    dataCategory,
    dataFocus,
    dataFocusReturnCategory,
    activeTab,
    activeMainTab,
    sheetsExpanded,
    dataExpanded,
    gameState,
  });
  if (activeMainTab.value === "baseUpgrades") {
    openResourcesPanel();
  }
});

const mapName = computed(() => gameState.value?.mapName ?? gameState.value?.mapId ?? null);
const enforceTurns = computed(() => gameState.value?.enforceTurns !== false);

const centerHeaderTitle = computed(() =>
  activeMainTab.value === "baseUpgrades" ? "Base Upgrades" : mapName.value,
);

const roundStatus = computed(() => {
  const s = gameState.value;
  if (!s) return null;
  return {
    round: s.round,
    phase: roundPhaseLabel(s.roundPhase),
    turn: turnHolderLabel(s),
  };
});

const yourPlayer = computed(() => {
  const s = gameState.value;
  const id = yourPlayerId.value;
  if (!s || !id) return null;
  return s.players.find((p) => p.id === id) ?? null;
});

const phaseAction = computed((): { label: string; action: PhaseAction } | null => {
  const s = gameState.value;
  if (!s || !role.value || s.enforceTurns === false) return null;

  if (s.roundPhase === "deployment" && role.value === "gm") {
    return { label: "End deployment", action: "endDeployment" };
  }
  if (s.roundPhase === "startRoundEffects" && role.value === "gm") {
    return { label: "Do effects", action: "doEffects" };
  }
  if (
    s.roundPhase === "playersChoice" &&
    role.value === "player" &&
    yourPlayerId.value &&
    yourPlayer.value &&
    !isPlayerDowned(yourPlayer.value) &&
    !s.actedPlayerIds.includes(yourPlayerId.value)
  ) {
    return { label: "Take turn", action: "takeTurn" };
  }
  if (
    s.roundPhase === "playerTurn" &&
    role.value === "player" &&
    yourPlayerId.value &&
    s.turn?.role === "player" &&
    s.turn.playerId === yourPlayerId.value
  ) {
    return { label: "End turn", action: "endPlayerTurn" };
  }
  if (s.roundPhase === "gmTurn" && role.value === "gm") {
    if (remainingPlayerIds(s).length > 0) {
      return { label: "End turn", action: "endGmTurn" };
    }
    return { label: "Countdown tags", action: "countdownTags" };
  }
  if (s.roundPhase === "countdownTags" && role.value === "gm") {
    return { label: "End round", action: "endRound" };
  }
  return null;
});

function leave() {
  clearSession();
  router.push("/");
}

function onPhaseAction() {
  if (!phaseAction.value) return;
  const action = phaseAction.value.action;
  if (action === "takeTurn" && yourPlayerId.value) {
    const player = gameState.value?.players.find((p) => p.id === yourPlayerId.value);
    if (player) selectBoardPlayer(player.id, player.characterSheetId);
  }
  if (
    action === "endPlayerTurn" &&
    yourPlayerId.value &&
    gameState.value &&
    kataptyNeedsTargetPick(gameState.value, yourPlayerId.value)
  ) {
    setMode("kataptyPick");
    showToast("Select exactly 3 Katapty targets, then end turn again");
    return;
  }
  send({ type: "phaseAction", action });
}

function openResourcesPanel() {
  clearBoardSelection();
  selectSheet(null);
  selectDataCategory("resources");
  activeTab.value = "info";
}

function openTaccomInfoPanel() {
  if (role.value === "gm") {
    clearBoardSelection();
    selectSheet(null);
    clearDataCategory();
    activeTab.value = "info";
    return;
  }
  if (role.value === "player" && yourPlayerId.value) {
    const player = gameState.value?.players.find((p) => p.id === yourPlayerId.value);
    if (player?.characterSheetId) {
      selectSheetFromNav(player.characterSheetId);
    }
  }
}

function selectMainTab(tab: "taccom" | "baseUpgrades") {
  activeMainTab.value = tab;
  if (tab === "baseUpgrades") {
    openResourcesPanel();
  } else {
    openTaccomInfoPanel();
  }
}

function onOverworldClick() {
  showToast("Work in progress", "info");
}
</script>

<template>
  <div class="app-shell">
    <aside class="sidebar">
      <div class="sidebar-content">
        <SideNav />
        <div class="sidebar-footer">
          <div class="session-info">
            <span class="role-tag">{{ role === "gm" ? "GM" : "Player" }}</span>
            <span v-if="role === 'player'">{{ playerProfile?.name ?? "—" }}</span>
            <span>Status: <span :class="['status-pill', connection]">{{ connection }}</span></span>
          </div>
          <button class="leave-btn" type="button" @click="leave">
            Leave game
          </button>
        </div>
      </div>
    </aside>

    <main class="main">
      <header v-if="role" class="center-header">
        <div class="center-tabs chrome-tabs">
          <button
            type="button"
            class="chrome-tab"
            :class="{ active: activeMainTab === 'taccom' }"
            data-tooltip="TACCOM"
            aria-label="TACCOM"
            @click="selectMainTab('taccom')"
          >
            <svg class="chrome-tab-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <circle cx="8" cy="8" r="5.5" stroke="currentColor" stroke-width="1.25" />
              <path d="M8 2.5v2M8 11.5v2M2.5 8h2M11.5 8h2" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" />
              <circle cx="8" cy="8" r="1.25" fill="currentColor" />
            </svg>
          </button>
          <button
            type="button"
            class="chrome-tab"
            data-tooltip="Overworld"
            aria-label="Overworld"
            @click="onOverworldClick"
          >
            <svg class="chrome-tab-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M2.5 4.5h11v8a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-8z"
                stroke="currentColor"
                stroke-width="1.25"
                stroke-linejoin="round"
              />
              <path d="M5.5 4.5V3a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1.5" stroke="currentColor" stroke-width="1.25" />
              <path d="M2.5 7.5h11" stroke="currentColor" stroke-width="1.25" />
              <circle cx="6" cy="10" r="0.75" fill="currentColor" />
            </svg>
          </button>
          <button
            type="button"
            class="chrome-tab"
            :class="{ active: activeMainTab === 'baseUpgrades' }"
            data-tooltip="Base Upgrades"
            aria-label="Base Upgrades"
            @click="selectMainTab('baseUpgrades')"
          >
            <svg class="chrome-tab-icon chrome-tab-icon-beaker" viewBox="0.5 0.25 15 15.25" fill="none" aria-hidden="true">
              <path
                d="M5.25 5V1.75H10.75V5L12.25 13.25H3.75L5.25 5"
                stroke="currentColor"
                stroke-width="1.25"
                stroke-linejoin="round"
              />
              <path
                d="M4.25 2.5H5.25M4.25 3.1H5.25M4.25 3.7H5.25"
                stroke="currentColor"
                stroke-width="1.25"
                stroke-linecap="round"
              />
              <path
                d="M4.75 9.5Q6.25 10.1 8 9.5T11.25 9.5"
                stroke="currentColor"
                stroke-width="1.25"
                stroke-linecap="round"
              />
            </svg>
          </button>
        </div>
        <h1 class="map-title">{{ centerHeaderTitle }}</h1>
        <p v-if="activeMainTab === 'taccom' && enforceTurns && roundStatus" class="round-status">
          Round {{ roundStatus.round }} · {{ roundStatus.phase }} · {{ roundStatus.turn }}
        </p>
        <button
          v-if="activeMainTab === 'taccom' && phaseAction"
          class="phase-action-btn"
          type="button"
          @click="onPhaseAction"
        >
          {{ phaseAction.label }}
        </button>
      </header>
      <ReversalPrompt v-show="activeMainTab === 'taccom'" />
      <ActionBar v-show="activeMainTab === 'taccom'" />
      <GmActionBar v-show="activeMainTab === 'taccom'" />
      <GameBoard
        v-if="role"
        v-show="activeMainTab === 'taccom'"
        :role="role"
        :player-profile="playerProfile"
      />
      <BaseUpgradesPanel v-show="activeMainTab === 'baseUpgrades'" />
    </main>

    <RightPanel v-if="role" />

  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  height: 100vh;
  max-width: none;
}

.sidebar {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 12rem;
  flex-shrink: 0;
  border-right: 1px solid var(--color-border);
  background: var(--color-bg);
}

.sidebar-content {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.brand {
  padding: 1rem 0.75rem 0.5rem;
}

.sidebar-footer {
  margin-top: auto;
  border-top: 1px solid var(--color-border);
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.session-info {
  display: flex;
  flex-direction: row;
  gap: 0.75rem;
  flex-wrap: wrap;
  font-size: 0.85rem;
  color: var(--color-muted);
}

.role-tag {
  font-size: 0.72rem;
  color: var(--color-warning);
  text-transform: uppercase;
  font-weight: 700;
}

.status-pill {
  display: inline-block;
  width: fit-content;
  padding: 0.1rem 0.45rem;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: capitalize;
}

.status-pill.connecting {
  background: var(--color-warning-bg);
  color: var(--color-warning);
}

.status-pill.connected {
  background: var(--color-success-muted-bg);
  color: var(--color-success);
}

.status-pill.disconnected {
  background: var(--color-danger-hover-bg);
  color: var(--color-danger);
}

.leave-btn {
  border: 1px solid var(--color-danger-muted-border);
  border-radius: 8px;
  background: var(--color-danger-subtle-bg);
  color: var(--color-danger);
  padding: 0.4rem 0.55rem;
  cursor: pointer;
  font-size: 0.85rem;
}

.leave-btn:hover {
  background: var(--color-danger-hover-bg);
  border-color: var(--color-danger);
}

.main {
  flex: 1;
  padding: 0 0.75rem 0.75rem;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  background: var(--color-bg);
}

.center-header {
  box-sizing: border-box;
  min-height: var(--chrome-header-height);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 1rem;
  margin: 0 -0.75rem;
  padding: 0 0.75rem;
  border-bottom: 1px solid var(--color-border);
}

.center-tabs {
  position: relative;
  z-index: 2;
  flex-shrink: 0;
  margin-bottom: -1px;
}

.chrome-tab-icon-beaker {
  width: 1.15rem;
  height: 1.15rem;
}

.map-title {
  margin: 0;
  flex-shrink: 0;
}

.round-status {
  margin: 0;
  flex: 1;
  font-size: 0.9rem;
  color: var(--color-muted);
  text-align: center;
}

.phase-action-btn {
  margin-left: auto;
  flex-shrink: 0;
  border: 1px solid var(--color-accent-muted);
  border-radius: 8px;
  background: var(--color-accent-subtle-bg);
  color: var(--color-accent-bright);
  padding: 0.2rem 0.75rem;
  cursor: pointer;
  font-size: 0.85rem;
  font-weight: 600;
}

.phase-action-btn:hover {
  background: var(--color-accent-hover-bg);
  border-color: var(--color-accent-bright);
}
</style>
