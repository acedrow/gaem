<script setup lang="ts">
import { computed, ref, watch } from "vue";

import { useCombatActions } from "../composables/useCombatActions.js";

const { pendingClassReaction, activePlayer, sendPlayerAction, canSupport } = useCombatActions();

const pullDistance = ref(1);
const pullToward = ref<"self" | "weapon">("self");

const isHarpePull = computed(() => pendingClassReaction.value?.kind === "harpe_trap_pull");
const isBorrowFollowUp = computed(() => pendingClassReaction.value?.kind === "borrowing_follow_up");

const borrowTargetCount = computed(() => {
  const r = pendingClassReaction.value;
  if (r?.kind !== "borrowing_follow_up") return 0;
  return r.extraEnemyIds.length;
});

const borrowMaxDamage = computed(() => {
  const r = pendingClassReaction.value;
  if (r?.kind !== "borrowing_follow_up") return 0;
  return r.maxDamage;
});

function confirmHarpePull() {
  sendPlayerAction({
    action: "resolveClassReaction",
    pullDistance: pullDistance.value,
    pullToward: pullToward.value,
  });
}

function confirmBorrowFollowUp() {
  sendPlayerAction({ action: "resolveClassReaction", accept: true });
}

function skipBorrowFollowUp() {
  sendPlayerAction({ action: "resolveClassReaction", accept: false });
}

watch(pendingClassReaction, (r) => {
  if (r?.kind === "harpe_trap_pull") {
    pullDistance.value = 1;
    pullToward.value = "self";
  }
});
</script>

<template>
  <div v-if="pendingClassReaction" class="class-reaction-banner">
    <div v-if="isHarpePull" class="class-reaction-inner">
      <strong>Weapon Trap — choose pull</strong>
      <p class="class-reaction-detail">
        {{ pendingClassReaction.damageDealt }} damage dealt. Pull toward you or your weapon?
      </p>
      <div class="class-reaction-controls">
        <label>
          Distance
          <input v-model.number="pullDistance" type="number" min="0" max="6" class="pull-input" />
        </label>
        <label>
          <input v-model="pullToward" type="radio" value="self" />
          Toward {{ activePlayer?.nickname ?? "you" }}
        </label>
        <label>
          <input v-model="pullToward" type="radio" value="weapon" />
          Toward weapon
        </label>
        <button type="button" class="btn-confirm" @click="confirmHarpePull">Confirm pull</button>
      </div>
    </div>

    <div v-else-if="isBorrowFollowUp" class="class-reaction-inner">
      <strong>Borrowing This — Support follow-up</strong>
      <p class="class-reaction-detail">
        Deal max damage ({{ borrowMaxDamage }}) to {{ borrowTargetCount }}
        {{ borrowTargetCount === 1 ? "enemy" : "enemies" }} outside your weapon pattern?
      </p>
      <div class="class-reaction-controls">
        <button
          type="button"
          class="btn-confirm"
          :disabled="!canSupport"
          @click="confirmBorrowFollowUp"
        >
          Confirm (Support)
        </button>
        <button type="button" class="btn-skip" @click="skipBorrowFollowUp">Skip</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.class-reaction-banner {
  position: fixed;
  bottom: 5rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 50;
  max-width: 28rem;
  width: calc(100% - 2rem);
}

.class-reaction-inner {
  background: var(--color-panel-bg, #1c2128);
  border: 1px solid var(--color-accent, #58a6ff);
  border-radius: 8px;
  padding: 0.75rem 1rem;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
}

.class-reaction-detail {
  margin: 0.35rem 0 0.6rem;
  font-size: 0.85rem;
  color: var(--color-text-muted, #8b949e);
}

.class-reaction-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: center;
  font-size: 0.85rem;
}

.pull-input {
  width: 3rem;
  margin-left: 0.35rem;
}

.btn-confirm {
  margin-left: auto;
  padding: 0.35rem 0.75rem;
  border-radius: 4px;
  border: none;
  background: var(--color-accent, #58a6ff);
  color: #fff;
  cursor: pointer;
}

.btn-confirm:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-skip {
  padding: 0.35rem 0.75rem;
  border-radius: 4px;
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
}
</style>
