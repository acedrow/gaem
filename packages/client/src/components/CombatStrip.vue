<script setup lang="ts">
import { computed } from "vue";

import { getClassMaxHp, getEffectSummary } from "@gaem/shared";

import { useCombatActions } from "../composables/useCombatActions.js";
import { useCampaignUnlocks } from "../composables/useCampaignUnlocks.js";
import HpBar from "./HpBar.vue";

const props = defineProps<{
  playerId?: string;
}>();

const { hasReversals } = useCampaignUnlocks();
const showReversals = computed(() => hasReversals.value);

const {
  activePlayer,
  showPlayerActionBar,
  budget,
  effectPills,
  pendingReaction,
  triggerReversal,
  declineReversal,
} = useCombatActions(() => props.playerId ?? null);

const maxHp = computed(() => getClassMaxHp(activePlayer.value?.class));
const pills = computed(() => (activePlayer.value ? effectPills(activePlayer.value) : []));

function pillTitle(token: string) {
  const id = token.split(":")[0] ?? token;
  return getEffectSummary(id) ?? token;
}
</script>

<template>
  <div v-if="activePlayer && showPlayerActionBar" class="combat-strip">
    <HpBar
      v-if="activePlayer.hp != null"
      :current-hp="activePlayer.hp"
      :max-hp="maxHp"
    />
    <div class="stats">
      <span v-if="activePlayer.speed != null" class="stat">Speed {{ budget?.movementRemaining ?? activePlayer.speed }}/{{ activePlayer.speed }}</span>
      <span v-if="showReversals && activePlayer.reversalCharges != null" class="stat">
        Reversal {{ activePlayer.reversalCharges }}
      </span>
      <span v-if="activePlayer.equipmentUses != null" class="stat">
        Equip {{ activePlayer.equipmentUses ? "●" : "○" }}
      </span>
    </div>
    <div v-if="pills.length" class="effects">
      <span
        v-for="pill in pills"
        :key="pill"
        class="effect-pill"
        :title="pillTitle(pill)"
      >
        {{ pill }}
      </span>
    </div>
    <div v-if="showReversals && pendingReaction" class="reversal-prompt panel">
      <p class="reversal-label">{{ pendingReaction.label }}?</p>
      <p class="reversal-trigger">{{ pendingReaction.trigger }}</p>
      <div class="reversal-actions">
        <button type="button" class="action-btn" @click="triggerReversal">Use</button>
        <button type="button" class="action-btn" @click="declineReversal">Decline</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.combat-strip {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.65rem 0.75rem;
  border-top: 1px solid var(--color-border);
}

.stats {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.stat {
  font-size: 0.75rem;
  color: var(--color-muted);
  font-weight: 600;
}

.effects {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}

.effect-pill {
  font-size: 0.7rem;
  padding: 0.12rem 0.4rem;
  border-radius: 999px;
  background: var(--color-danger-tint-bg);
  border: 1px solid var(--color-danger-tint-border);
  color: var(--color-danger-light);
}

.reversal-prompt {
  padding: 0.5rem;
  border-radius: 8px;
  background: var(--color-accent-tint-bg-faint);
  border: 1px solid var(--color-accent-tint-border);
}

.reversal-label {
  margin: 0;
  font-size: 0.82rem;
  font-weight: 600;
}

.reversal-trigger {
  margin: 0.25rem 0 0.5rem;
  font-size: 0.72rem;
  color: var(--color-muted);
}

.reversal-actions {
  display: flex;
  gap: 0.35rem;
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
</style>
