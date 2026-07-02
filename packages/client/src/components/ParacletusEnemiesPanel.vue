<script setup lang="ts">
import { listEnemyListings } from "@gaem/shared";

import { useBoardSelection } from "../composables/useBoardSelection.js";
import { useCharacterSheetSelection } from "../composables/useCharacterSheetSelection.js";
import { useEnemySpawnSelection } from "../composables/useEnemySpawnSelection.js";
import { useInfoDataSelection } from "../composables/useInfoDataSelection.js";

const { clearBoardSelection, closeRightPanel } = useBoardSelection();
const { rightPanelCollapsed } = useCharacterSheetSelection();
const { selectedSpawnEnemyName, selectSpawnEnemy } = useEnemySpawnSelection();
const { selectDataFocus } = useInfoDataSelection();

const enemies = listEnemyListings();

function viewEnemyDetails(name: string) {
  clearBoardSelection();
  selectDataFocus({ kind: "enemy", name }, { returnTo: "paracletus" });
  rightPanelCollapsed.value = false;
}
</script>

<template>
  <div class="panel">
    <div class="panel-header">
      <h2 class="panel-title">Enemies — Paracletus</h2>
      <button class="close-btn" type="button" title="Close" @click="closeRightPanel">×</button>
    </div>

    <p v-if="selectedSpawnEnemyName" class="spawn-hint">
      Click an empty walkable tile to spawn {{ selectedSpawnEnemyName }}.
    </p>

    <div class="panel-scroll">
      <div class="list-block">
        <article
          v-for="enemy in enemies"
          :key="enemy.name"
          class="enemy-item"
          :class="{ selected: selectedSpawnEnemyName === enemy.name }"
        >
          <button
            type="button"
            class="enemy-header"
            @click="selectSpawnEnemy(enemy.name)"
          >
            <span class="enemy-name">{{ enemy.name }}</span>
            <span v-if="enemy.tags?.length" class="enemy-tags">
              <span v-for="tag in enemy.tags" :key="tag" class="enemy-tag">{{ tag }}</span>
            </span>
          </button>
          <div v-if="selectedSpawnEnemyName === enemy.name" class="enemy-body">
            <p v-if="enemy.description" class="enemy-description">{{ enemy.description }}</p>
            <button
              type="button"
              class="view-details-btn"
              @click.stop="viewEnemyDetails(enemy.name)"
            >
              View details
            </button>
          </div>
        </article>
      </div>
    </div>
  </div>
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 1rem;
  height: 100%;
}

.panel-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
  flex-shrink: 0;
}

.panel-title {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 700;
  line-height: 1.3;
}

.close-btn {
  flex-shrink: 0;
  border: none;
  background: transparent;
  color: #8b949e;
  font-size: 1.4rem;
  line-height: 1;
  cursor: pointer;
  padding: 0 0.15rem;
}

.close-btn:hover {
  color: #e6edf3;
}

.spawn-hint {
  margin: 0 0 0.65rem;
  font-size: 0.8rem;
  color: #58a6ff;
  flex-shrink: 0;
}

.panel-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.list-block {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.enemy-item {
  border: 1px solid #21262d;
  border-radius: 8px;
}

.enemy-item.selected {
  border-color: #388bfd66;
}

.enemy-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  width: 100%;
  padding: 0.55rem 0.65rem;
  border: none;
  background: #161b22;
  color: #e6edf3;
  text-align: left;
  cursor: pointer;
  font-family: inherit;
}

.enemy-item.selected .enemy-header {
  background: #1c2128;
}

.enemy-header:hover {
  background: #1c2128;
}

.enemy-name {
  font-size: 0.9rem;
  font-weight: 700;
  line-height: 1.3;
}

.enemy-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  flex-shrink: 0;
}

.enemy-tag {
  font-size: 0.65rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #8b949e;
  border: 1px solid #30363d;
  border-radius: 4px;
  padding: 0.1rem 0.35rem;
}

.enemy-body {
  padding: 0.65rem 0.75rem 0.75rem;
  border-top: 1px solid #21262d;
}

.enemy-description {
  margin: 0 0 0.5rem;
  font-size: 0.82rem;
  line-height: 1.45;
  color: #c9d1d9;
}

.view-details-btn {
  border: none;
  background: transparent;
  padding: 0;
  font-family: inherit;
  font-size: 0.8rem;
  font-weight: 600;
  color: #58a6ff;
  cursor: pointer;
}

.view-details-btn:hover {
  text-decoration: underline;
}
</style>
