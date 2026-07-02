<script setup lang="ts">
import { listEnemyListings } from "@gaem/shared";
import { ref } from "vue";

import { useBoardSelection } from "../composables/useBoardSelection.js";
import { useEnemySpawnSelection } from "../composables/useEnemySpawnSelection.js";

const { closeRightPanel } = useBoardSelection();
const { selectedSpawnEnemyName, selectSpawnEnemy } = useEnemySpawnSelection();

const enemies = listEnemyListings();
const expanded = ref<Set<string>>(new Set());

function isExpanded(name: string): boolean {
  return expanded.value.has(name);
}

function toggle(name: string) {
  if (expanded.value.has(name)) expanded.value.delete(name);
  else expanded.value.add(name);
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
          class="list-card"
          :class="{ selected: selectedSpawnEnemyName === enemy.name }"
        >
          <button
            type="button"
            class="list-card-header"
            :class="{ expanded: isExpanded(enemy.name) }"
            @click="toggle(enemy.name)"
          >
            <span class="header-main">
              <span class="enemy-name">{{ enemy.name }}</span>
              <span v-if="enemy.tags?.length" class="enemy-tags">
                <span v-for="tag in enemy.tags" :key="tag" class="enemy-tag">{{ tag }}</span>
              </span>
            </span>
            <span class="chevron" aria-hidden="true">{{ isExpanded(enemy.name) ? "▾" : "▸" }}</span>
          </button>

          <div v-if="isExpanded(enemy.name)" class="list-card-body">
            <p v-if="enemy.summary" class="enemy-summary">{{ enemy.summary }}</p>

            <div class="stats">
              <span class="stat">HP: {{ enemy.hp }}</span>
              <span v-if="enemy.crown != null" class="stat">Crown: {{ enemy.crown }}</span>
              <span v-if="enemy.scale != null" class="stat">Scale: {{ enemy.scale }}</span>
              <span v-if="enemy.speed != null" class="stat">Speed: {{ enemy.speed }}</span>
              <span v-if="enemy.actions" class="stat">Actions: {{ enemy.actions }}</span>
              <span v-if="enemy.agnosiaHp != null" class="stat">Agnosia HP: {{ enemy.agnosiaHp }}</span>
            </div>

            <p v-if="enemy.title" class="enemy-title">{{ enemy.title }}</p>
            <p v-if="enemy.codename" class="codename"><em>{{ enemy.codename }}</em></p>
            <p v-if="enemy.description" class="item-description">{{ enemy.description }}</p>

            <p v-for="(attack, i) in enemy.attacks" :key="i" class="ability">
              <span class="ability-label">Attack {{ i + 1 }}</span>
              {{ attack }}
            </p>
            <p v-if="enemy.agnosia" class="ability">
              <span class="ability-label">Agnosia</span>
              {{ enemy.agnosia }}
            </p>
            <p v-if="enemy.special" class="ability">
              <span class="ability-label">Special</span>
              {{ enemy.special }}
            </p>
            <p v-if="enemy.stainwalk" class="ability">
              <span class="ability-label">Stainwalk</span>
              {{ enemy.stainwalk }}
            </p>

            <button
              type="button"
              class="spawn-btn"
              :class="{ active: selectedSpawnEnemyName === enemy.name }"
              @click="selectSpawnEnemy(enemy.name)"
            >
              {{ selectedSpawnEnemyName === enemy.name ? "Selected for spawn" : "Spawn on board" }}
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
  color: var(--color-muted);
  font-size: 1.4rem;
  line-height: 1;
  cursor: pointer;
  padding: 0 0.15rem;
}

.close-btn:hover {
  color: var(--color-text);
}

.spawn-hint {
  margin: 0 0 0.65rem;
  font-size: 0.8rem;
  color: var(--color-accent-bright);
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

.list-card.selected {
  border-color: var(--color-accent-muted);
}

.header-main {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
  flex: 1;
}

.enemy-name {
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
  color: var(--color-muted);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  padding: 0.1rem 0.35rem;
}

.chevron {
  flex-shrink: 0;
  color: var(--color-muted);
  font-size: 1.5rem;
  line-height: 1;
}

.enemy-summary {
  margin: 0 0 0.5rem;
  font-weight: 600;
  color: var(--color-text);
}

.stats {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem 0.75rem;
  margin-bottom: 0.5rem;
}

.stat {
  font-size: 0.8rem;
  color: var(--color-muted);
  font-weight: 600;
}

.enemy-title {
  margin: 0 0 0.35rem;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--color-text);
}

.codename {
  margin: 0 0 0.35rem;
  font-size: 0.85rem;
  color: var(--color-muted);
}

.ability {
  margin: 0.5rem 0 0;
  font-size: 0.82rem;
  line-height: 1.45;
  color: var(--color-text-secondary);
}

.spawn-btn {
  margin-top: 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-surface-raised);
  color: var(--color-text);
  font-family: inherit;
  font-size: 0.8rem;
  font-weight: 600;
  padding: 0.35rem 0.65rem;
  cursor: pointer;
}

.spawn-btn:hover {
  background: var(--color-surface-hover);
}

.spawn-btn.active {
  border-color: var(--color-accent-muted);
  color: var(--color-accent-bright);
}
</style>
