<script setup lang="ts">
import { computed } from "vue";

import { useBoardSelection } from "../composables/useBoardSelection.js";
import { useCharacterSheetSelection } from "../composables/useCharacterSheetSelection.js";
import { activeTab } from "../composables/useGameConsole.js";
import { useGameState } from "../composables/useGameState.js";
import { useInfoDataSelection } from "../composables/useInfoDataSelection.js";
import CharacterSheetPanel from "./CharacterSheetPanel.vue";
import EnemyInfoPanel from "./EnemyInfoPanel.vue";
import GameConsolePanel from "./GameConsolePanel.vue";
import GameDataDetailPanel from "./GameDataDetailPanel.vue";
import InfoSearchPanel from "./InfoSearchPanel.vue";
import PlayerBoardPanel from "./PlayerBoardPanel.vue";
import PlayerDataPanel from "./PlayerDataPanel.vue";
import ParacletusEnemiesPanel from "./ParacletusEnemiesPanel.vue";
import PatternsPanel from "./PatternsPanel.vue";
import TurnOrderPanel from "./TurnOrderPanel.vue";

const { selectedSheetId, rightPanelCollapsed } = useCharacterSheetSelection();
const { boardSelection } = useBoardSelection();
const { dataCategory, dataFocus, dataFocusReturnCategory } = useInfoDataSelection();
const { gameState } = useGameState();

const boardPlayerSheetId = computed(() => {
  if (boardSelection.value?.kind !== "player") return null;
  const player = gameState.value?.players.find((p) => p.id === boardSelection.value!.id);
  return player?.characterSheetId ?? null;
});

const activeSheetId = computed(() => boardPlayerSheetId.value ?? selectedSheetId.value);
</script>

<template>
  <aside class="right-panel" :class="{ collapsed: rightPanelCollapsed }">
    <button
      class="panel-toggle right-toggle"
      type="button"
      :title="rightPanelCollapsed ? 'Expand panel' : 'Collapse panel'"
      @click="rightPanelCollapsed = !rightPanelCollapsed"
    >
      {{ rightPanelCollapsed ? "◂" : "▸" }}
    </button>

    <template v-if="!rightPanelCollapsed">
      <div class="tabs">
        <button
          type="button"
          class="tab"
          :class="{ active: activeTab === 'console' }"
          title="Console"
          aria-label="Console"
          @click="activeTab = 'console'"
        >
          <svg class="tab-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <rect x="1.75" y="2.75" width="12.5" height="10.5" rx="1.5" stroke="currentColor" stroke-width="1.25" />
            <path d="M9.5 5.5L6.5 10.5" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" />
          </svg>
        </button>
        <button
          type="button"
          class="tab"
          :class="{ active: activeTab === 'info' }"
          title="Info"
          aria-label="Info"
          @click="activeTab = 'info'"
        >
          <svg class="tab-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.25" />
            <circle cx="8" cy="5.25" r="0.75" fill="currentColor" />
            <path d="M8 7.25v4" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" />
          </svg>
        </button>
        <button
          type="button"
          class="tab"
          :class="{ active: activeTab === 'turnOrder' }"
          title="Turn order"
          aria-label="Turn order"
          @click="activeTab = 'turnOrder'"
        >
          <svg class="tab-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M4 2.5h8M4 13.5h8" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" />
            <path
              d="M6 2.5v2.25l2 2.25-2 2.25v2.25M10 2.5v2.25l-2 2.25 2 2.25v2.25"
              stroke="currentColor"
              stroke-width="1.25"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </button>
      </div>

      <div class="tab-body">
        <GameConsolePanel v-show="activeTab === 'console'" />
        <div v-show="activeTab === 'info'" class="info-pane">
          <EnemyInfoPanel
            v-if="boardSelection?.kind === 'enemy'"
            :key="`board:${boardSelection.id}`"
            :enemy-id="boardSelection.id"
          />
          <PlayerBoardPanel
            v-else-if="boardSelection?.kind === 'player' && !boardPlayerSheetId"
            :key="boardSelection.id"
            :player-id="boardSelection.id"
          />
          <EnemyInfoPanel
            v-else-if="dataFocus?.kind === 'enemy'"
            :key="`bestiary:${dataFocus.name}`"
            :enemy-name="dataFocus.name"
            :show-back="dataFocusReturnCategory === 'paracletus'"
          />
          <GameDataDetailPanel
            v-else-if="dataFocus"
            :key="`${dataFocus.kind}:${dataFocus.name}`"
            :focus="dataFocus"
          />
          <PatternsPanel
            v-else-if="dataCategory === 'patterns'"
            key="patterns"
          />
          <ParacletusEnemiesPanel
            v-else-if="dataCategory === 'paracletus'"
            key="paracletus"
          />
          <PlayerDataPanel
            v-else-if="dataCategory"
            :key="dataCategory"
            :category="dataCategory"
          />
          <CharacterSheetPanel
            v-else-if="activeSheetId"
            :key="activeSheetId"
            :sheet-id="activeSheetId"
          />
          <InfoSearchPanel v-else />
        </div>
        <TurnOrderPanel v-show="activeTab === 'turnOrder'" />
      </div>
    </template>
  </aside>
</template>

<style scoped>
.right-panel {
  position: relative;
  display: flex;
  flex-direction: column;
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

.right-panel :deep(.panel) {
  flex: 1;
  min-height: 0;
}

.tabs {
  display: flex;
  flex-shrink: 0;
  border-bottom: 1px solid #30363d;
  padding: 0 0.5rem;
}

.tab {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: #8b949e;
  padding: 0.65rem 0.5rem;
  cursor: pointer;
  margin-bottom: -1px;
}

.tab-icon {
  width: 1rem;
  height: 1rem;
}

.tab:hover {
  color: #e6edf3;
}

.tab.active {
  color: #e6edf3;
  border-bottom-color: #388bfd;
}

.tab-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.info-pane {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
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

.right-toggle {
  left: -0.625rem;
  border-radius: 6px 0 0 6px;
}
</style>
