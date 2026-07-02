<script setup lang="ts">
import { getEnemyListingByName, getEnemyMaxHp } from "@gaem/shared";
import { computed } from "vue";

import { useBoardSelection } from "../composables/useBoardSelection.js";
import { useGameState } from "../composables/useGameState.js";
import { useInfoDataSelection } from "../composables/useInfoDataSelection.js";
import { useSession } from "../composables/useSession.js";

const props = defineProps<{
  enemyId?: string;
  enemyName?: string;
  showBack?: boolean;
}>();

const { role } = useSession();
const { gameState } = useGameState();
const { closeRightPanel } = useBoardSelection();
const { goBackFromDataFocus } = useInfoDataSelection();

const isGm = computed(() => role.value === "gm");

const activeEnemy = computed(() =>
  props.enemyId ? gameState.value?.enemies.find((e) => e.id === props.enemyId) : undefined,
);

const listing = computed(() =>
  getEnemyListingByName(activeEnemy.value?.name ?? props.enemyName),
);

const displayName = computed(() => listing.value?.name ?? activeEnemy.value?.name ?? props.enemyName ?? "Enemy");
const maxHp = computed(() =>
  activeEnemy.value ? getEnemyMaxHp(activeEnemy.value) : listing.value?.hp ?? 0,
);
const currentHp = computed(() => activeEnemy.value?.hp ?? 0);
const showHpBar = computed(() => isGm.value && !!activeEnemy.value);

const HP_MEDIUM_THRESHOLD = 0.5;
const HP_LOW_THRESHOLD = 0.25;

const hpPercent = computed(() => {
  if (maxHp.value <= 0) return 0;
  const hp = Math.min(currentHp.value, maxHp.value);
  return Math.max(0, Math.min(100, (hp / maxHp.value) * 100));
});

const hpBarLevel = computed(() => {
  if (maxHp.value <= 0) return "high";
  const ratio = Math.min(currentHp.value, maxHp.value) / maxHp.value;
  if (ratio < HP_LOW_THRESHOLD) return "low";
  if (ratio < HP_MEDIUM_THRESHOLD) return "medium";
  return "high";
});

const notFound = computed(() => !listing.value && !activeEnemy.value);
</script>

<template>
  <div class="panel">
    <div v-if="showBack" class="panel-toolbar">
      <button class="back-btn" type="button" title="Back to enemies" @click="goBackFromDataFocus">
        ←
      </button>
      <button class="close-btn" type="button" title="Close" @click="closeRightPanel">×</button>
    </div>
    <div class="panel-header" :class="{ 'with-toolbar': showBack }">
      <div class="title-block">
        <h2 class="panel-title">{{ displayName }}</h2>
        <p v-if="listing?.title" class="panel-subtitle">{{ listing.title }}</p>
      </div>
      <button
        v-if="!showBack"
        class="close-btn"
        type="button"
        title="Close"
        @click="closeRightPanel"
      >
        ×
      </button>
    </div>

    <div v-if="!notFound" class="panel-body">
      <template v-if="isGm">
        <div v-if="showHpBar" class="hp-bar-block">
          <div class="hp-bar-header">
            <span class="hp-bar-label">HP</span>
            <span class="hp-bar-values">
              <span class="hp-current">{{ currentHp }}</span>
              <span class="hp-max"> / {{ maxHp }}</span>
            </span>
          </div>
          <div class="hp-bar-track">
            <div class="hp-bar-fill" :class="hpBarLevel" :style="{ width: `${hpPercent}%` }" />
          </div>
        </div>

        <div v-if="listing" class="stats">
          <span v-if="!showHpBar" class="stat">HP: {{ listing.hp }}</span>
          <span v-if="listing.codename" class="stat">Codename: {{ listing.codename }}</span>
          <span v-if="listing.crown != null" class="stat">Crown: {{ listing.crown }}</span>
          <span v-if="listing.scale != null" class="stat">Scale: {{ listing.scale }}</span>
          <span v-if="listing.speed != null" class="stat">Speed: {{ listing.speed }}</span>
          <span v-if="listing.actions" class="stat">Actions: {{ listing.actions }}</span>
          <span v-if="listing.agnosiaHp != null" class="stat">Agnosia HP: {{ listing.agnosiaHp }}</span>
        </div>

        <div v-if="listing?.tags?.length" class="tags">
          <span v-for="tag in listing.tags" :key="tag" class="tag">{{ tag }}</span>
        </div>
      </template>

      <p v-if="listing?.description" class="description">{{ listing.description }}</p>
      <p v-else class="muted">No description available.</p>

      <div v-if="!isGm && listing?.speed != null" class="stats">
        <span class="stat">Speed {{ listing.speed }}</span>
      </div>

      <template v-if="isGm && listing">
        <p v-for="(attack, i) in listing.attacks" :key="i" class="ability">
          <span class="ability-label">Attack {{ i + 1 }}</span>
          {{ attack }}
        </p>
        <p v-if="listing.agnosia" class="ability">
          <span class="ability-label">Agnosia</span>
          {{ listing.agnosia }}
        </p>
        <p v-if="listing.special" class="ability">
          <span class="ability-label">Special</span>
          {{ listing.special }}
        </p>
        <p v-if="listing.stainwalk" class="ability">
          <span class="ability-label">Stainwalk</span>
          {{ listing.stainwalk }}
        </p>

        <p v-if="activeEnemy" class="position">Position ({{ activeEnemy.x }}, {{ activeEnemy.y }})</p>
      </template>
    </div>

    <p v-else class="muted">Enemy not found.</p>
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

.panel-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.panel-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.65rem;
  flex-shrink: 0;
}

.panel-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 1rem;
  flex-shrink: 0;
}

.panel-header.with-toolbar {
  margin-bottom: 1rem;
}

.back-btn {
  border: none;
  background: transparent;
  color: #8b949e;
  font-size: 1.25rem;
  line-height: 1;
  cursor: pointer;
  padding: 0 0.15rem;
}

.back-btn:hover {
  color: #e6edf3;
}

.title-block {
  min-width: 0;
}

.panel-title {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 700;
  line-height: 1.3;
}

.panel-subtitle {
  margin: 0.2rem 0 0;
  font-size: 0.75rem;
  color: #8b949e;
  text-transform: uppercase;
  letter-spacing: 0.04em;
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

.hp-bar-block {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.hp-bar-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: 0.85rem;
}

.hp-bar-label {
  color: #8b949e;
  font-weight: 600;
  text-transform: uppercase;
  font-size: 0.72rem;
  letter-spacing: 0.04em;
}

.hp-current {
  font-weight: 700;
  color: #e6edf3;
}

.hp-max {
  color: #8b949e;
}

.hp-bar-track {
  height: 8px;
  border-radius: 999px;
  background: #21262d;
  overflow: hidden;
}

.hp-bar-fill {
  height: 100%;
  border-radius: 999px;
  transition: width 0.2s ease;
}

.hp-bar-fill.high { background: #3fb950; }
.hp-bar-fill.medium { background: #d29922; }
.hp-bar-fill.low { background: #f85149; }

.description {
  margin: 0;
  font-size: 0.9rem;
  line-height: 1.5;
  color: #c9d1d9;
}

.stat {
  font-size: 0.8rem;
  color: #8b949e;
  font-weight: 600;
}

.stats {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  gap: 0.35rem 0.75rem;
}

.ability {
  margin: 0;
  font-size: 0.82rem;
  line-height: 1.45;
  color: #c9d1d9;
}

.ability-label {
  display: block;
  margin-bottom: 0.15rem;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #8b949e;
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.tag {
  padding: 0.15rem 0.45rem;
  border-radius: 999px;
  background: #21262d;
  border: 1px solid #30363d;
  font-size: 0.72rem;
  color: #8b949e;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.position {
  margin: 0;
  font-size: 0.8rem;
  color: #8b949e;
}

.muted {
  color: #8b949e;
  font-size: 0.9rem;
}
</style>
