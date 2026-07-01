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

const { selectedSheetId, rightPanelCollapsed } = useCharacterSheetSelection();
const { boardSelection } = useBoardSelection();
const { dataCategory, dataFocus } = useInfoDataSelection();
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
          @click="activeTab = 'console'"
        >
          Console
        </button>
        <button
          type="button"
          class="tab"
          :class="{ active: activeTab === 'info' }"
          @click="activeTab = 'info'"
        >
          Info
        </button>
      </div>

      <div class="tab-body">
        <GameConsolePanel v-show="activeTab === 'console'" />
        <div v-show="activeTab === 'info'" class="info-pane">
          <EnemyInfoPanel
            v-if="boardSelection?.kind === 'enemy'"
            :key="boardSelection.id"
            :enemy-id="boardSelection.id"
          />
          <PlayerBoardPanel
            v-else-if="boardSelection?.kind === 'player' && !boardPlayerSheetId"
            :key="boardSelection.id"
            :player-id="boardSelection.id"
          />
          <GameDataDetailPanel
            v-else-if="dataFocus"
            :key="`${dataFocus.kind}:${dataFocus.name}`"
            :focus="dataFocus"
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
  border: none;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: #8b949e;
  padding: 0.6rem 0.5rem;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  margin-bottom: -1px;
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
