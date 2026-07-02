<script setup lang="ts">
import { PLAYER_ARMOR, PLAYER_CLASSES, PLAYER_WEAPONS } from "@gaem/shared";

const props = defineProps<{
  modelValue: {
    player: string;
    name: string;
    class: string;
    armor: string;
    weapon: string;
  };
  profiles: { id: string; name: string }[];
  showPlayer?: boolean;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: {
    player: string;
    name: string;
    class: string;
    armor: string;
    weapon: string;
  }];
}>();

function updateField(field: keyof typeof props.modelValue, value: string) {
  emit("update:modelValue", { ...props.modelValue, [field]: value });
}
</script>

<template>
  <label v-if="showPlayer" class="modal-field">
    <span>Player profile</span>
    <select
      :value="modelValue.player"
      class="modal-input"
      @change="updateField('player', ($event.target as HTMLSelectElement).value)"
    >
      <option value="" disabled>Select player</option>
      <option v-for="p in profiles" :key="p.id" :value="p.id">{{ p.name }}</option>
    </select>
  </label>

  <label class="modal-field">
    <span>Name</span>
    <input
      :value="modelValue.name"
      class="modal-input"
      type="text"
      @input="updateField('name', ($event.target as HTMLInputElement).value)"
    />
  </label>

  <label class="modal-field">
    <span>Class</span>
    <select
      :value="modelValue.class"
      class="modal-input"
      @change="updateField('class', ($event.target as HTMLSelectElement).value)"
    >
      <option value="" disabled>Select class</option>
      <option v-for="c in PLAYER_CLASSES" :key="c.name" :value="c.name">{{ c.name }}</option>
    </select>
  </label>

  <label class="modal-field">
    <span>Armor</span>
    <select
      :value="modelValue.armor"
      class="modal-input"
      @change="updateField('armor', ($event.target as HTMLSelectElement).value)"
    >
      <option value="" disabled>Select armor</option>
      <option v-for="a in PLAYER_ARMOR" :key="a.name" :value="a.name">{{ a.name }}</option>
    </select>
  </label>

  <label class="modal-field">
    <span>Weapon</span>
    <select
      :value="modelValue.weapon"
      class="modal-input"
      @change="updateField('weapon', ($event.target as HTMLSelectElement).value)"
    >
      <option value="" disabled>Select weapon</option>
      <option v-for="w in PLAYER_WEAPONS" :key="w.name" :value="w.name">{{ w.name }}</option>
    </select>
  </label>
</template>
