<script setup lang="ts">
import { computed, type Ref } from "vue";

import { useHpBar } from "../composables/useHpBar.js";

const props = defineProps<{
  currentHp: number;
  maxHp: number;
  editable?: boolean;
  editing?: boolean;
  compact?: boolean;
}>();

const emit = defineEmits<{
  startEdit: [];
  commitEdit: [];
  cancelEdit: [];
}>();

const currentHpRef = computed(() => props.currentHp) as Ref<number>;
const maxHpRef = computed(() => props.maxHp) as Ref<number>;
const { hpPercent, hpBarLevel } = useHpBar(currentHpRef, maxHpRef);
</script>

<template>
  <div class="hp-bar-block" :class="{ compact }">
    <div v-if="!compact" class="hp-bar-header">
      <span class="hp-bar-label">HP</span>
      <span class="hp-bar-values">
        <slot name="values">
          <span class="hp-current">{{ currentHp }}</span>
          <span class="hp-max"> / {{ maxHp }}</span>
        </slot>
      </span>
    </div>
    <div class="hp-bar-track">
      <div class="hp-bar-fill" :class="hpBarLevel" :style="{ width: `${hpPercent}%` }" />
    </div>
  </div>
</template>

<style scoped>
.hp-bar-block.compact {
  margin-bottom: 0;
}

.hp-bar-block.compact .hp-bar-track {
  height: 3px;
  border-radius: 0;
}
</style>
