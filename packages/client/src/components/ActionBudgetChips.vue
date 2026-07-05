<script setup lang="ts">
import type { ActionTier } from "@gaem/shared";
import { ref } from "vue";

import ModalDialog from "./ModalDialog.vue";

const props = defineProps<{
  interactive?: boolean;
  mainSpent: boolean;
  supportSpent: boolean;
  auxSpent: boolean;
  mainGranted: boolean;
  supportGranted: boolean;
  auxGranted: boolean;
  canCommitMain: boolean;
  canCommitSupport: boolean;
  canCommitAux: boolean;
  hasteStacks?: number;
}>();

const emit = defineEmits<{
  commitHaste: [tier: ActionTier];
}>();

const pendingTier = ref<ActionTier | null>(null);

const tierLabels: Record<ActionTier, string> = {
  main: "Main",
  support: "Support",
  aux: "Aux",
};

function chipClass(spent: boolean, granted: boolean, canCommit: boolean) {
  if (granted) return "chip haste-granted";
  if (spent && canCommit && props.interactive) return "chip spent clickable";
  if (spent) return "chip spent";
  return "chip";
}

function onChipClick(tier: ActionTier, spent: boolean, canCommit: boolean) {
  if (!props.interactive || !spent || !canCommit) return;
  pendingTier.value = tier;
}

function confirmHaste() {
  if (!pendingTier.value) return;
  emit("commitHaste", pendingTier.value);
  pendingTier.value = null;
}

function cancelHaste() {
  pendingTier.value = null;
}
</script>

<template>
  <button
    type="button"
    class="chip-btn"
    :class="chipClass(mainSpent, mainGranted, canCommitMain)"
    :disabled="!interactive || !mainSpent || !canCommitMain"
    @click="onChipClick('main', mainSpent, canCommitMain)"
  >
    Main
  </button>
  <button
    type="button"
    class="chip-btn"
    :class="chipClass(supportSpent, supportGranted, canCommitSupport)"
    :disabled="!interactive || !supportSpent || !canCommitSupport"
    @click="onChipClick('support', supportSpent, canCommitSupport)"
  >
    Support
  </button>
  <button
    type="button"
    class="chip-btn"
    :class="chipClass(auxSpent, auxGranted, canCommitAux)"
    :disabled="!interactive || !auxSpent || !canCommitAux"
    @click="onChipClick('aux', auxSpent, canCommitAux)"
  >
    Aux
  </button>
  <span v-if="(hasteStacks ?? 0) > 0" class="chip haste">Haste {{ hasteStacks }}</span>

  <ModalDialog
    :open="pendingTier != null"
    title="Spend Haste"
    ok-label="Spend Haste"
    @close="cancelHaste"
    @confirm="confirmHaste"
  >
    <p v-if="pendingTier" class="prompt">
      Would you like to spend Haste to gain an additional
      {{ tierLabels[pendingTier] }} action?
    </p>
  </ModalDialog>
</template>

<style scoped>
.chip-btn,
.chip {
  font-size: 0.72rem;
  font-weight: 600;
  padding: 0.15rem 0.45rem;
  border-radius: 999px;
  background: var(--color-surface-raised);
  border: 1px solid var(--color-border);
  color: var(--color-text);
}

.chip-btn {
  font-family: inherit;
  cursor: default;
}

.chip-btn.spent {
  opacity: 0.45;
}

.chip-btn.clickable {
  cursor: pointer;
  opacity: 0.75;
  border-style: dashed;
  border-color: var(--color-accent);
}

.chip-btn.clickable:hover:not(:disabled) {
  opacity: 1;
  background: var(--color-accent-muted);
}

.chip-btn:disabled {
  cursor: default;
}

.chip-btn.haste-granted {
  opacity: 1;
  border-color: var(--color-accent);
  color: var(--color-accent);
  background: var(--color-accent-muted);
}

.chip.haste {
  border-color: var(--color-accent);
  color: var(--color-accent);
}

.prompt {
  margin: 0;
  font-size: 0.9rem;
  line-height: 1.5;
}
</style>
