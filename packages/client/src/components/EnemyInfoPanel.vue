<script setup lang="ts">
import { getEnemyListingByName, getEnemyMaxHp } from "@gaem/shared";
import { computed } from "vue";

import { useBoardSelection } from "../composables/useBoardSelection.js";
import { useGameState } from "../composables/useGameState.js";
import { useSession } from "../composables/useSession.js";

const props = defineProps<{ enemyId: string }>();

const { role } = useSession();
const { gameState, send } = useGameState();
const { closeRightPanel } = useBoardSelection();

const enemy = computed(() => gameState.value?.enemies.find((e) => e.id === props.enemyId));
const listing = computed(() => getEnemyListingByName(enemy.value?.name));
const displayName = computed(() => enemy.value?.name ?? listing.value?.name ?? "Enemy");
const maxHp = computed(() => (enemy.value ? getEnemyMaxHp(enemy.value) : listing.value?.hp ?? 0));
const currentHp = computed(() => enemy.value?.hp ?? 0);

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

function removeEnemy() {
  if (!enemy.value) return;
  send({ type: "removeEnemy", enemyId: enemy.value.id });
  closeRightPanel();
}
</script>

<template>
  <div class="panel">
    <div class="panel-header">
      <div class="title-block">
        <h2 class="panel-title">{{ displayName }}</h2>
        <p v-if="listing?.title" class="panel-subtitle">{{ listing.title }}</p>
      </div>
      <button class="close-btn" type="button" title="Close" @click="closeRightPanel">×</button>
    </div>

    <div v-if="enemy" class="panel-body">
      <div class="hp-bar-block">
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

      <p v-if="listing?.description" class="description">{{ listing.description }}</p>
      <p v-else class="muted">No description available.</p>

      <div v-if="listing?.tags?.length" class="tags">
        <span v-for="tag in listing.tags" :key="tag" class="tag">{{ tag }}</span>
      </div>

      <p class="position">Position ({{ enemy.x }}, {{ enemy.y }})</p>

      <button
        v-if="role === 'gm'"
        class="remove-btn"
        type="button"
        @click="removeEnemy"
      >
        Remove enemy
      </button>
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

.panel-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 1rem;
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

.remove-btn {
  margin-top: auto;
  border: 1px solid #f8514966;
  border-radius: 8px;
  background: #f8514922;
  color: #f85149;
  padding: 0.45rem 0.75rem;
  font-size: 0.85rem;
  cursor: pointer;
}

.remove-btn:hover {
  background: #f8514933;
  border-color: #f85149;
}

.muted {
  color: #8b949e;
  font-size: 0.9rem;
}
</style>
