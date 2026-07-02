<script setup lang="ts">
import { RULE_EFFECTS } from "@gaem/shared";
import { computed, ref, watch } from "vue";

import { useGameState } from "../composables/useGameState.js";
import { useSession } from "../composables/useSession.js";
import EffectIcon from "./EffectIcon.vue";
import ModalDialog from "./ModalDialog.vue";
import NumberStepper from "./NumberStepper.vue";

const props = defineProps<{
  open: boolean;
  target: { kind: "player" | "enemy"; id: string } | null;
}>();

const emit = defineEmits<{
  close: [];
}>();

const { send } = useGameState();
const { isGm } = useSession();

const selectedId = ref(RULE_EFFECTS[0]?.id ?? "");
const stacks = ref(1);

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) return;
    selectedId.value = RULE_EFFECTS[0]?.id ?? "";
    stacks.value = 1;
  },
);

const selectedEffect = computed(() => RULE_EFFECTS.find((e) => e.id === selectedId.value));
const canApply = computed(() => !!props.target && !!selectedId.value && stacks.value !== 0);

function apply() {
  if (!canApply.value || !props.target) return;
  send({
    type: "applyEffect",
    target: props.target,
    effects: [`${selectedId.value}:${stacks.value}`],
  });
  emit("close");
}

function clearEffects() {
  if (!props.target) return;
  send({ type: "clearEffects", target: props.target });
  emit("close");
}
</script>

<template>
  <ModalDialog title="Add effect" :open="open" @close="emit('close')">
    <div class="effect-picker">
      <label class="field-label" for="effect-select">Effect</label>
      <div class="effect-list">
        <button
          v-for="effect in RULE_EFFECTS"
          :key="effect.id"
          type="button"
          class="effect-option"
          :class="{ selected: selectedId === effect.id }"
          @click="selectedId = effect.id"
        >
          <EffectIcon :effect-id="effect.id" :size="18" />
          <span class="effect-name">{{ effect.id }}</span>
        </button>
      </div>
    </div>

    <p v-if="selectedEffect" class="effect-summary">{{ selectedEffect.summary }}</p>

    <div class="stacks-row">
      <span class="field-label">Stacks</span>
      <NumberStepper v-model="stacks" :min="-99" :max="99" />
    </div>

    <button
      v-if="isGm"
      type="button"
      class="btn-danger"
      :disabled="!target"
      @click="clearEffects"
    >
      Clear effects
    </button>

    <template #actions>
      <button type="button" class="btn-secondary" @click="emit('close')">Cancel</button>
      <button type="button" class="btn-primary" :disabled="!canApply" @click="apply">Apply</button>
    </template>
  </ModalDialog>
</template>

<style scoped>
.field-label {
  display: block;
  margin-bottom: 0.35rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.effect-picker {
  margin-bottom: 0.75rem;
}

.effect-list {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  max-height: 200px;
  overflow-y: auto;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 0.35rem;
}

.effect-option {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.4rem 0.5rem;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--color-text);
  text-align: left;
  cursor: pointer;
  font-family: inherit;
  font-size: 0.85rem;
}

.effect-option:hover {
  background: var(--color-surface-raised);
}

.effect-option.selected {
  background: var(--color-accent-muted);
  outline: 1px solid var(--color-accent);
}

.effect-name {
  font-weight: 600;
}

.effect-summary {
  margin: 0 0 0.75rem;
  font-size: 0.82rem;
  line-height: 1.45;
  color: var(--color-muted);
}

.stacks-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}

.btn-danger {
  width: 100%;
  margin-bottom: 0.75rem;
  padding: 0.45rem 0.85rem;
  border-radius: 6px;
  border: 1px solid #f8514966;
  background: #f8514922;
  color: var(--color-danger);
  font-size: 0.85rem;
  font-family: inherit;
  font-weight: 600;
  cursor: pointer;
}

.btn-danger:hover:not(:disabled) {
  background: #f8514933;
  border-color: var(--color-danger);
}

.btn-danger:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary,
.btn-secondary {
  padding: 0.4rem 0.85rem;
  border-radius: 6px;
  font-size: 0.85rem;
  font-family: inherit;
  cursor: pointer;
}

.btn-secondary {
  border: 1px solid var(--color-border);
  background: var(--color-surface-raised);
  color: var(--color-text);
}

.btn-primary {
  border: 1px solid var(--color-accent);
  background: var(--color-accent);
  color: #fff;
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
