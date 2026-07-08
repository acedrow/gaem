<script setup lang="ts">
import type { AssistedOutcome } from "@gaem/shared";
import { computed, ref, watch } from "vue";

import { useCombatActions } from "../composables/useCombatActions.js";
import { useSession } from "../composables/useSession.js";
import PanelShell from "./PanelShell.vue";

const { hasGmCapabilities } = useSession();
const { pendingActions, applyAssisted } = useCombatActions();

const damageDraft = ref<Record<string, string>>({});
const rejectId = ref<string | null>(null);
const dismissed = ref(false);

const gmPending = computed(() =>
  hasGmCapabilities.value ? pendingActions.value : [],
);

watch(
  () => gmPending.value.map((p) => p.id),
  (ids, prev) => {
    if (!ids.length) {
      dismissed.value = false;
      return;
    }
    if (prev && ids.some((id) => !prev.includes(id))) {
      dismissed.value = false;
    }
  },
);

function applyPending(pendingId: string, reject = false) {
  const outcome: AssistedOutcome = { pendingId, reject };
  if (!reject) {
    const pending = pendingActions.value.find((p) => p.id === pendingId);
    const dmg = Number(damageDraft.value[pendingId]);
    if (Number.isFinite(dmg) && dmg > 0) {
      if (pending?.targetPlayerIds?.[0]) {
        outcome.damageByPlayerId = { [pending.targetPlayerIds[0]]: dmg };
      }
      if (pending?.targetEnemyIds?.[0]) {
        outcome.damageByEnemyId = { [pending.targetEnemyIds[0]]: dmg };
      }
      if (pending?.actorEnemyId && pending.targetPlayerIds?.[0]) {
        outcome.damageByPlayerId = { [pending.targetPlayerIds[0]]: dmg };
      }
    }
    if (pending?.damage && pending.targetPlayerIds?.[0]) {
      outcome.damageByPlayerId = { [pending.targetPlayerIds[0]]: pending.damage };
    }
    if (pending?.effects?.length && pending.targetPlayerIds?.[0]) {
      outcome.effectsByPlayerId = { [pending.targetPlayerIds[0]]: pending.effects };
    }
  }
  applyAssisted(outcome);
  delete damageDraft.value[pendingId];
  rejectId.value = null;
}
</script>

<template>
  <template v-if="hasGmCapabilities && gmPending.length">
    <button
      v-if="dismissed"
      type="button"
      class="inbox-reopen"
      @click="dismissed = false"
    >
      Assisted inbox · {{ gmPending.length }} pending
    </button>
    <PanelShell
      v-else
      title="Assisted inbox"
      subtitle="Confirm ability outcomes"
      @close="dismissed = true"
    >
    <div class="inbox">
      <article v-for="item in gmPending" :key="item.id" class="inbox-item">
        <h4 class="item-title">{{ item.label }}</h4>
        <p v-if="item.detail" class="item-detail">{{ item.detail }}</p>
        <label class="dmg-field">
          Damage
          <input
            v-model="damageDraft[item.id]"
            type="number"
            min="0"
            class="dmg-input"
            :placeholder="item.damage != null ? String(item.damage) : ''"
          />
        </label>
        <div class="item-actions">
          <button type="button" class="action-btn" @click="applyPending(item.id)">Apply</button>
          <button type="button" class="action-btn reject" @click="applyPending(item.id, true)">Reject</button>
        </div>
      </article>
    </div>
    </PanelShell>
  </template>
</template>

<style scoped>
.inbox-reopen {
  flex-shrink: 0;
  width: 100%;
  padding: 0.5rem 0.75rem;
  border: none;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-surface-raised);
  color: var(--color-accent);
  font-size: 0.78rem;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
}

.inbox-reopen:hover {
  background: var(--color-border);
}

.inbox {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.inbox-item {
  padding: 0.65rem;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-surface-raised);
}

.item-title {
  margin: 0 0 0.35rem;
  font-size: 0.85rem;
}

.item-detail {
  margin: 0 0 0.5rem;
  font-size: 0.78rem;
  color: var(--color-muted);
  line-height: 1.4;
}

.dmg-field {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  font-size: 0.72rem;
  color: var(--color-muted);
  margin-bottom: 0.5rem;
}

.dmg-input {
  padding: 0.25rem 0.4rem;
  border-radius: 0;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text);
  width: 5rem;
}

.item-actions {
  display: flex;
  gap: 0.35rem;
}

.action-btn {
  font-size: 0.75rem;
  padding: 0.25rem 0.5rem;
}
</style>
