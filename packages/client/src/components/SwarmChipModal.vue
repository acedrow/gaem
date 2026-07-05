<script setup lang="ts">
import type { SwarmChipTarget } from "@gaem/shared";
import { computed, ref, watch } from "vue";

import ModalDialog from "./ModalDialog.vue";

const props = defineProps<{
  open: boolean;
  enemyName: string;
  targets: SwarmChipTarget[];
}>();

const emit = defineEmits<{
  close: [];
  confirm: [targetPlayerIds: string[], targetEnemyIds: string[]];
}>();

const selectedPlayerIds = ref<Set<string>>(new Set());
const selectedEnemyIds = ref<Set<string>>(new Set());

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) return;
    selectedPlayerIds.value = new Set();
    selectedEnemyIds.value = new Set();
  },
);

const playerTargets = computed(() => props.targets.filter((t) => t.kind === "player"));
const enemyTargets = computed(() => props.targets.filter((t) => t.kind === "enemy"));

function togglePlayer(id: string) {
  const next = new Set(selectedPlayerIds.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  selectedPlayerIds.value = next;
}

function toggleEnemy(id: string) {
  const next = new Set(selectedEnemyIds.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  selectedEnemyIds.value = next;
}

function onConfirm() {
  emit("confirm", [...selectedPlayerIds.value], [...selectedEnemyIds.value]);
}
</script>

<template>
  <ModalDialog
    title="Swarm chip damage"
    :open="open"
    ok-label="Apply chip"
    @close="emit('close')"
    @confirm="onConfirm"
  >
    <p class="prompt">
      {{ enemyName }} deals 1 damage to each adjacent unit you choose at the start of its turn.
    </p>
    <p v-if="!targets.length" class="empty">No adjacent targets.</p>
    <div v-if="playerTargets.length" class="target-group">
      <p class="group-label">Players</p>
      <label v-for="t in playerTargets" :key="t.id" class="target-row">
        <input
          type="checkbox"
          :checked="selectedPlayerIds.has(t.id)"
          @change="togglePlayer(t.id)"
        />
        {{ t.label }}
      </label>
    </div>
    <div v-if="enemyTargets.length" class="target-group">
      <p class="group-label">Enemies</p>
      <label v-for="t in enemyTargets" :key="t.id" class="target-row">
        <input
          type="checkbox"
          :checked="selectedEnemyIds.has(t.id)"
          @change="toggleEnemy(t.id)"
        />
        {{ t.label }}
      </label>
    </div>
  </ModalDialog>
</template>

<style scoped>
.prompt {
  margin: 0 0 1rem;
  font-size: 0.85rem;
  line-height: 1.45;
  color: var(--color-text-secondary);
}

.empty {
  margin: 0;
  font-size: 0.82rem;
  color: var(--color-muted);
}

.target-group {
  margin-bottom: 0.75rem;
}

.group-label {
  margin: 0 0 0.35rem;
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-muted);
}

.target-row {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  font-size: 0.85rem;
  padding: 0.2rem 0;
  cursor: pointer;
}
</style>
