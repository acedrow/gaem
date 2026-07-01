<script setup lang="ts">
import { useRouter } from "vue-router";

import { useCharacterSheetSelection } from "../composables/useCharacterSheetSelection.js";
import { useGameConnection } from "../composables/useGameConnection.js";
import { useSession } from "../composables/useSession.js";
import CharacterSheetPanel from "./CharacterSheetPanel.vue";
import GameBoard from "./GameBoard.vue";
import SideNav from "./SideNav.vue";

const router = useRouter();
const { role, playerProfile, clearSession } = useSession();
const { selectedSheetId, sidebarCollapsed, rightPanelCollapsed } = useCharacterSheetSelection();
const { connection } = useGameConnection();

function leave() {
  clearSession();
  router.push("/");
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
      <GameBoard
        v-if="role"
        :role="role"
        :player-profile="playerProfile"
      />
    </main>

    <aside
      v-if="selectedSheetId"
      class="right-panel"
      :class="{ collapsed: rightPanelCollapsed }"
    >
      <button
        class="panel-toggle right-toggle"
        type="button"
        :title="rightPanelCollapsed ? 'Expand panel' : 'Collapse panel'"
        @click="rightPanelCollapsed = !rightPanelCollapsed"
      >
        {{ rightPanelCollapsed ? "◂" : "▸" }}
      </button>
      <CharacterSheetPanel
        v-show="!rightPanelCollapsed"
        :key="selectedSheetId"
        :sheet-id="selectedSheetId"
      />
    </aside>
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
  padding: 1.25rem 1.5rem;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.right-panel {
  position: relative;
  width: 22rem;
  flex-shrink: 0;
  border-left: 1px solid #30363d;
  background: #0d1117;
  overflow: hidden;
  transition: width 0.2s ease;
}

.right-panel.collapsed {
  width: 1.75rem;
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

.right-toggle {
  left: -0.625rem;
  border-radius: 6px 0 0 6px;
}
</style>
