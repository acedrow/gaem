<script setup lang="ts">
import type { PatternDirection } from "@gaem/shared";
import { computed, ref, watch } from "vue";
import {
  nextPatternDirection,
  parseEnemyAttackString,
  previewSwarmEnemyAttack,
  swarmGroupForEnemy,
} from "@gaem/shared";

import { useGameState } from "../composables/useGameState.js";
import ModalDialog from "./ModalDialog.vue";

const props = defineProps<{
  open: boolean;
  enemyId: string;
  attackIndex: number;
  attackText: string;
}>();

const emit = defineEmits<{
  close: [];
}>();

const { gameState, send } = useGameState();

const attackDirection = ref<PatternDirection>("n");
const targetPlayerId = ref("");
const damageOverride = ref<number | "">("");

const parsedAttack = computed(() => parseEnemyAttackString(props.attackText));

const swarmPreview = computed(() => {
  const s = gameState.value;
  if (!s || !props.enemyId || !targetPlayerId.value) return null;
  if (!swarmGroupForEnemy(s, props.enemyId)) return null;
  const damage =
    damageOverride.value === "" ? undefined : Number(damageOverride.value);
  return previewSwarmEnemyAttack(
    s,
    props.enemyId,
    parsedAttack.value,
    targetPlayerId.value,
    damage,
  );
});

watch(
  () => [props.open, props.attackIndex] as const,
  ([isOpen]) => {
    if (!isOpen) return;
    attackDirection.value = "n";
    targetPlayerId.value = "";
    damageOverride.value = "";
  },
);

function rotateDirection() {
  attackDirection.value = nextPatternDirection(attackDirection.value);
}

function apply() {
  if (!props.enemyId) return;
  send({
    type: "gmEnemyAction",
    action: {
      action: "attack",
      enemyId: props.enemyId,
      attackIndex: props.attackIndex,
      direction: parsedAttack.value.patternId ? attackDirection.value : undefined,
      targetPlayerId: targetPlayerId.value || undefined,
      damage: damageOverride.value === "" ? undefined : Number(damageOverride.value),
    },
  });
  emit("close");
}
</script>

<template>
  <ModalDialog
    title="Use attack"
    :open="open"
    ok-label="Use attack"
    :ok-disabled="!enemyId"
    @close="emit('close')"
    @confirm="apply"
  >
    <p v-if="attackText" class="attack-text">{{ attackText }}</p>
    <p v-if="swarmPreview && swarmPreview.strikeCount > 0" class="swarm-preview">
      Swarm attack: {{ swarmPreview.totalDamage }} total damage ({{ swarmPreview.detail }})
    </p>
    <p v-if="parsedAttack.patternId" class="parsed">
      Pattern {{ parsedAttack.patternId }}:{{ parsedAttack.size }}
      <span v-if="parsedAttack.damage"> · {{ parsedAttack.damage }} dmg</span>
    </p>

    <button
      v-if="parsedAttack.patternId"
      type="button"
      class="action-btn"
      @click="rotateDirection"
    >
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
      <input v-model="damageOverride" type="number" min="0" class="input" placeholder="Default" />
    </label>
  </ModalDialog>
</template>

<style scoped>
.attack-text,
.parsed,
.swarm-preview {
  margin: 0 0 0.75rem;
  font-size: 0.82rem;
  line-height: 1.45;
  color: var(--color-muted);
}

.swarm-preview {
  color: var(--color-accent);
}

.action-btn {
  margin-bottom: 0.75rem;
  background: var(--color-surface-raised);
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  margin-bottom: 0.75rem;
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--color-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.select,
.input {
  padding: 0.35rem 0.5rem;
  border-radius: 0;
  border: 1px solid var(--color-border);
  background: var(--color-bg);
  color: var(--color-text);
  font: inherit;
  font-size: 0.88rem;
  text-transform: none;
  letter-spacing: normal;
  font-weight: 400;
}
</style>
