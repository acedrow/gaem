<script setup lang="ts">
import { getEnemyListingByName, getEnemyMaxHp, getEnemyScale } from "@gaem/shared";
import { computed } from "vue";

import { useBoardSelection } from "../composables/useBoardSelection.js";
import { useGameState } from "../composables/useGameState.js";
import { useInfoDataSelection } from "../composables/useInfoDataSelection.js";
import { useSession } from "../composables/useSession.js";
import HpBar from "./HpBar.vue";
import PanelShell from "./PanelShell.vue";

const props = defineProps<{
  enemyId?: string;
  enemyName?: string;
  showBack?: boolean;
}>();

const { isGm } = useSession();
const { gameState } = useGameState();
const { closeRightPanel } = useBoardSelection();
const { goBackFromDataFocus } = useInfoDataSelection();

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

const enemyScale = computed(() => {
  if (activeEnemy.value) return getEnemyScale(activeEnemy.value);
  return listing.value?.scale ?? 1;
});

const notFound = computed(() => !listing.value && !activeEnemy.value);
</script>

<template>
  <PanelShell
    :title="displayName"
    :subtitle="listing?.title"
    :show-back="showBack"
    @close="closeRightPanel"
    @back="goBackFromDataFocus"
  >
    <div v-if="!notFound" class="panel-body">
      <template v-if="isGm">
        <HpBar v-if="showHpBar" :current-hp="currentHp" :max-hp="maxHp" />

        <div v-if="listing" class="stats">
          <span v-if="!showHpBar" class="stat">HP: {{ listing.hp }}</span>
          <span v-if="listing.crown != null" class="stat">Crown: {{ listing.crown }}</span>
          <span v-if="listing.scale != null || activeEnemy" class="stat">Scale: {{ enemyScale }}</span>
          <span v-if="listing.speed != null" class="stat">Speed: {{ listing.speed }}</span>
          <span v-if="listing.actions" class="stat">Actions: {{ listing.actions }}</span>
          <span v-if="listing.agnosiaHp != null" class="stat">Agnosia HP: {{ listing.agnosiaHp }}</span>
        </div>

        <div v-if="listing?.tags?.length" class="tags">
          <span v-for="tag in listing.tags" :key="tag" class="tag">{{ tag }}</span>
        </div>
      </template>

      <p v-if="listing?.codename" class="codename"><em>{{ listing.codename }}</em></p>
      <p v-if="listing?.description" class="description"><em>{{ listing.description }}</em></p>
      <p v-else-if="!listing?.codename" class="muted">No description available.</p>

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

        <p v-if="activeEnemy" class="position">
          Position ({{ activeEnemy.x }}, {{ activeEnemy.y }}){{ enemyScale > 1 ? ` · ${enemyScale}×${enemyScale}` : "" }}
        </p>
      </template>
    </div>

    <p v-else class="muted">Enemy not found.</p>
  </PanelShell>
</template>

<style scoped>
.panel-body {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.codename {
  margin: 0;
  font-size: 0.85rem;
  color: var(--color-muted);
}

.description {
  margin: 0;
  font-size: 0.9rem;
  line-height: 1.5;
  color: #c9d1d9;
}

.stat {
  font-size: 0.8rem;
  color: var(--color-muted);
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

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.tag {
  padding: 0.15rem 0.45rem;
  border-radius: 999px;
  background: var(--color-surface-raised);
  border: 1px solid var(--color-border);
  font-size: 0.72rem;
  color: var(--color-muted);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.position {
  margin: 0;
  font-size: 0.8rem;
  color: var(--color-muted);
}
</style>
