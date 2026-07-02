<script setup lang="ts">
const model = defineModel<number>({ required: true });

const props = defineProps<{
  min?: number;
  max?: number;
  disabled?: boolean;
  clamp?: (value: number) => number;
}>();

const emit = defineEmits<{
  adjust: [delta: number];
}>();

function onChange() {
  if (props.clamp) model.value = props.clamp(model.value);
}
</script>

<template>
  <div class="stepper">
    <button
      type="button"
      class="step-btn"
      :disabled="disabled"
      @click="emit('adjust', -1)"
    >
      −
    </button>
    <input
      v-model.number="model"
      type="number"
      class="step-input"
      :min="min"
      :max="max"
      :disabled="disabled"
      @change="onChange"
    />
    <button
      type="button"
      class="step-btn"
      :disabled="disabled"
      @click="emit('adjust', 1)"
    >
      +
    </button>
  </div>
</template>
