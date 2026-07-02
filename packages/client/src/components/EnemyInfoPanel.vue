<script setup lang="ts">
import type { PatternDirection } from "@gaem/shared";
import {
  getEnemyBossActionBudget,
  getEnemyListingByName,
  getEnemyMaxHp,
  getEnemyScale,
  nextPatternDirection,
  parseEnemyAttackString,
  previewEnemyAttack,
  unexhaustedEnemies,
} from "@gaem/shared";
import { computed, ref } from "vue";

import { useBoardSelection } from "../composables/useBoardSelection.js";
import { useCombatActions } from "../composables/useCombatActions.js";
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
const { showGmCombatUi } = useCombatActions();
const { gameState, send } = useGameState();
const { closeRightPanel } = useBoardSelection();
const { goBackFromDataFocus } = useInfoDataSelection();

const attackIndex = ref(0);
const attackDirection = ref<PatternDirection>("n");
const targetPlayerId = ref("");
const damageOverride = ref<number | "">("");
const hpDraft = ref<number | "">("");

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

const parsedAttacks = computed(() =>
  (listing.value?.attacks ?? []).map((text) => parseEnemyAttackString(text)),
);

const selectedAttack = computed(() => parsedAttacks.value[attackIndex.value]);

const attackPreviewKeys = computed(() => {
  const s = gameState.value;
  const enemy = activeEnemy.value;
  if (!s || !enemy || !selectedAttack.value?.patternId) return new Set<string>();
  const tiles = previewEnemyAttack(s, enemy.id, attackIndex.value, attackDirection.value);
  return new Set(tiles.map((t) => `${t.x},${t.y}`));
});

const bossBudget = computed(() => {
  const s = gameState.value;
  const enemy = activeEnemy.value;
  if (!s || !enemy) return null;
  return getEnemyBossActionBudget(s, enemy.id);
});

const queue = computed(() => {
  const s = gameState.value;
  if (!s) return [];
  return unexhaustedEnemies(s);
});

function rotateDirection() {
  attackDirection.value = nextPatternDirection(attackDirection.value);
}

function runAttack() {
  const enemy = activeEnemy.value;
  if (!enemy) return;
  send({
    type: "gmEnemyAction",
    action: {
      action: "attack",
      enemyId: enemy.id,
      attackIndex: attackIndex.value,
      direction: attackDirection.value,
      targetPlayerId: targetPlayerId.value || undefined,
      damage: damageOverride.value === "" ? undefined : Number(damageOverride.value),
    },
  });
}

function exhaustEnemy() {
  const enemy = activeEnemy.value;
  if (!enemy) return;
  send({ type: "gmEnemyAction", action: { action: "exhaust", enemyId: enemy.id } });
}

function setHp() {
  const enemy = activeEnemy.value;
  if (!enemy || hpDraft.value === "") return;
  send({ type: "setEnemyHp", enemyId: enemy.id, hp: Number(hpDraft.value) });
}
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

        <div v-if="activeEnemy" class="hp-edit">
          <input v-model="hpDraft" type="number" min="0" :max="maxHp" class="hp-input" placeholder="HP" />
          <button type="button" class="action-btn" @click="setHp">Set HP</button>
        </div>

        <div v-if="listing" class="stats">
          <span v-if="!showHpBar" class="stat">HP: {{ listing.hp }}</span>
          <span v-if="listing.crown != null" class="stat">Crown: {{ listing.crown }}</span>
          <span v-if="listing.scale != null || activeEnemy" class="stat">Scale: {{ enemyScale }}</span>
          <span v-if="listing.speed != null" class="stat">Speed: {{ listing.speed }}</span>
          <span v-if="listing.actions" class="stat">Actions: {{ listing.actions }}</span>
          <span v-if="bossBudget != null" class="stat">Boss budget: {{ bossBudget }}</span>
          <span v-if="activeEnemy?.exhausted" class="stat exhausted">Exhausted</span>
          <span v-if="listing.agnosiaHp != null" class="stat">Agnosia HP: {{ listing.agnosiaHp }}</span>
        </div>

        <div v-if="listing?.tags?.length" class="tags">
          <span v-for="tag in listing.tags" :key="tag" class="tag">{{ tag }}</span>
        </div>

        <div v-if="showGmCombatUi && activeEnemy" class="gm-actions panel">
          <h4 class="section-title">Enemy turn</h4>
          <label class="field">
            Attack
            <select v-model="attackIndex" class="select">
              <option v-for="(_, i) in listing?.attacks ?? []" :key="i" :value="i">
                Attack {{ i + 1 }}
              </option>
            </select>
          </label>
          <p v-if="listing?.attacks?.[attackIndex]" class="attack-text">
            {{ listing.attacks[attackIndex] }}
          </p>
          <p v-if="selectedAttack?.patternId" class="parsed">
            Pattern {{ selectedAttack.patternId }}:{{ selectedAttack.size }}
            <span v-if="selectedAttack.damage"> · {{ selectedAttack.damage }} dmg</span>
          </p>
          <button v-if="selectedAttack?.patternId" type="button" class="action-btn" @click="rotateDirection">
            Aim {{ attackDirection.toUpperCase() }}
          </button>
          <label class="field">
            Target player
            <select v-model="targetPlayerId" class="select">
              <option value="">—</option>
              <option v-for="p in gameState?.players ?? []" :key="p.id" :value="p.id">
                {{ p.nickname ?? p.id }}
              </option>
            </select>
          </label>
          <label class="field">
            Damage override
            <input v-model="damageOverride" type="number" min="0" class="hp-input" />
          </label>
          <div class="gm-btns">
            <button type="button" class="action-btn" @click="runAttack">Use attack</button>
            <button type="button" class="action-btn" @click="exhaustEnemy">Exhaust</button>
          </div>
        </div>

        <div v-if="showGmCombatUi && queue.length" class="queue">
          <span class="queue-label">Active queue:</span>
          <span v-for="e in queue" :key="e.id" class="queue-item">{{ e.name ?? e.id }}</span>
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

.stat.exhausted {
  color: #f85149;
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
}

.ability-label {
  display: block;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-muted);
  margin-bottom: 0.15rem;
}

.position {
  margin: 0;
  font-size: 0.78rem;
  color: var(--color-muted);
}

.muted {
  color: var(--color-muted);
  font-size: 0.85rem;
}

.gm-actions {
  padding: 0.65rem;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.section-title {
  margin: 0;
  font-size: 0.82rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  font-size: 0.72rem;
  color: var(--color-muted);
}

.select,
.hp-input {
  padding: 0.25rem 0.4rem;
  border-radius: 4px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text);
}

.attack-text,
.parsed {
  margin: 0;
  font-size: 0.75rem;
  color: var(--color-muted);
  line-height: 1.4;
}

.gm-btns,
.hp-edit {
  display: flex;
  gap: 0.35rem;
  align-items: center;
}

.action-btn {
  font-size: 0.75rem;
  padding: 0.25rem 0.5rem;
  border-radius: 6px;
  border: 1px solid var(--color-border);
  background: var(--color-surface-raised);
  color: var(--color-text);
  cursor: pointer;
}

.queue {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  align-items: center;
  font-size: 0.72rem;
}

.queue-label {
  color: var(--color-muted);
  font-weight: 600;
}

.queue-item {
  padding: 0.1rem 0.35rem;
  border-radius: 4px;
  background: var(--color-surface-raised);
  border: 1px solid var(--color-border);
}
</style>
