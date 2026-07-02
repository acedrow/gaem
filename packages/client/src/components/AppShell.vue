<script setup lang="ts">
import type { PhaseAction } from "@gaem/shared";
import { remainingPlayerIds, roundPhaseLabel, turnHolderLabel } from "@gaem/shared";
import { computed } from "vue";
import { useRouter } from "vue-router";

import { useCharacterSheetSelection } from "../composables/useCharacterSheetSelection.js";
import { useGameConnection } from "../composables/useGameConnection.js";
import { useGameState } from "../composables/useGameState.js";
import { useSession } from "../composables/useSession.js";
import GameBoard from "./GameBoard.vue";
import RightPanel from "./RightPanel.vue";
import SideNav from "./SideNav.vue";

const router = useRouter();
const { role, playerProfile, clearSession } = useSession();
const { sidebarCollapsed } = useCharacterSheetSelection();
const { connection } = useGameConnection();
const { gameState, yourPlayerId, send } = useGameState();

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
  send({ type: "phaseAction", action: phaseAction.value.action });
}
</script>

<template>
  <div class="app-shell">
    <aside class="sidebar" :class="{ collapsed: sidebarCollapsed }">
      <div v-show="!sidebarCollapsed" class="sidebar-content">
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
      <button
        class="panel-toggle sidebar-toggle"
        type="button"
        :title="sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'"
        @click="sidebarCollapsed = !sidebarCollapsed"
      >
        {{ sidebarCollapsed ? "▸" : "◂" }}
      </button>
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
  border-right: 1px solid #30363d;
  background: #0d1117;
  transition: width 0.2s ease;
}

.sidebar.collapsed {
  width: 1.75rem;
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
  font-weight: 700;
  font-size: 1.1rem;
  letter-spacing: -0.03em;
}

.sidebar-footer {
  margin-top: auto;
  border-top: 1px solid #30363d;
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
  color: #8b949e;
}

.role-tag {
  font-size: 0.72rem;
  color: #d29922;
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
  background: #3d444d;
  color: #d29922;
}

.status-pill.connected {
  background: #23863633;
  color: #3fb950;
}

.status-pill.disconnected {
  background: #f8514933;
  color: #f85149;
}

.leave-btn {
  border: 1px solid #f8514966;
  border-radius: 8px;
  background: #f8514922;
  color: #f85149;
  padding: 0.4rem 0.55rem;
  cursor: pointer;
  font-size: 0.85rem;
}

.leave-btn:hover {
  background: #f8514933;
  border-color: #f85149;
}

.main {
  flex: 1;
  padding: 0.75rem 0.75rem;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.center-header {
  min-height: 25px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 1rem;
}

.map-title {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 700;
  line-height: 1.3;
  letter-spacing: -0.02em;
  flex-shrink: 0;
}

.round-status {
  margin: 0;
  flex: 1;
  font-size: 0.9rem;
  color: #8b949e;
  text-align: center;
}

.phase-action-btn {
  margin-left: auto;
  flex-shrink: 0;
  border: 1px solid #388bfd66;
  border-radius: 8px;
  background: #388bfd22;
  color: #58a6ff;
  padding: 0.2rem 0.75rem;
  cursor: pointer;
  font-size: 0.85rem;
  font-weight: 600;
}

.phase-action-btn:hover {
  background: #388bfd33;
  border-color: #58a6ff;
}

.panel-toggle {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  z-index: 1;
  width: 1.25rem;
  height: 2.5rem;
  padding: 0;
  border: 1px solid #30363d;
  background: #161b22;
  color: #8b949e;
  font-size: 0.65rem;
  line-height: 1;
  cursor: pointer;
}

.panel-toggle:hover {
  color: #e6edf3;
  background: #1f2937;
}

.sidebar-toggle {
  right: -0.625rem;
  border-radius: 0 6px 6px 0;
}
</style>
