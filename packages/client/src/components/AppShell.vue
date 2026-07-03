<script setup lang="ts">
import type { PhaseAction } from "@gaem/shared";
import { remainingPlayerIds, roundPhaseLabel, turnHolderLabel } from "@gaem/shared";
import { computed, onMounted } from "vue";
import { useRouter } from "vue-router";

import { useBoardSelection } from "../composables/useBoardSelection.js";
import { useCharacterSheetSelection } from "../composables/useCharacterSheetSelection.js";
import { activeTab } from "../composables/useGameConsole.js";
import { useGameConnection } from "../composables/useGameConnection.js";
import { useGameState } from "../composables/useGameState.js";
import { useInfoDataSelection } from "../composables/useInfoDataSelection.js";
import { useSession } from "../composables/useSession.js";
import { initUiPersistence } from "../composables/uiPersist.js";
import ActionBar from "./ActionBar.vue";
import GmActionBar from "./GmActionBar.vue";
import GameBoard from "./GameBoard.vue";
import RightPanel from "./RightPanel.vue";
import SideNav from "./SideNav.vue";

const router = useRouter();
const { role, playerProfile, clearSession } = useSession();
const { selectedSheetId, sheetsExpanded } = useCharacterSheetSelection();
const { boardSelection, selectBoardPlayer } = useBoardSelection();
const { dataCategory, dataFocus, dataFocusReturnCategory, dataExpanded } = useInfoDataSelection();
const { connection } = useGameConnection();
const { gameState, yourPlayerId, send } = useGameState();

onMounted(() => {
  initUiPersistence({
    boardSelection,
    selectedSheetId,
    dataCategory,
    dataFocus,
    dataFocusReturnCategory,
    activeTab,
    sheetsExpanded,
    dataExpanded,
    gameState,
  });
});

const mapName = computed(() => gameState.value?.mapName ?? gameState.value?.mapId ?? null);

const roundStatus = computed(() => {
  const s = gameState.value;
  if (!s) return null;
  return {
    round: s.round,
    phase: roundPhaseLabel(s.roundPhase),
    turn: turnHolderLabel(s),
  };
});

const phaseAction = computed((): { label: string; action: PhaseAction } | null => {
  const s = gameState.value;
  if (!s || !role.value) return null;

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
  send({ type: "phaseAction", action });
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
      <header v-if="gameState" class="center-header">
        <h1 class="map-title">{{ mapName }}</h1>
        <p v-if="roundStatus" class="round-status">
          Round {{ roundStatus.round }} · {{ roundStatus.phase }} · {{ roundStatus.turn }}
        </p>
        <button
          v-if="phaseAction"
          class="phase-action-btn"
          type="button"
          @click="onPhaseAction"
        >
          {{ phaseAction.label }}
        </button>
      </header>
      <ActionBar />
      <GmActionBar />
      <GameBoard
        v-if="role"
        :role="role"
        :player-profile="playerProfile"
      />
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
