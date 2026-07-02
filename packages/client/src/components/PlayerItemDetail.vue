<script setup lang="ts">
import type { PlayerArmor, PlayerClass, PlayerWeapon } from "@gaem/shared";

defineProps<{
  item: PlayerClass | PlayerArmor | PlayerWeapon;
  kind: "classes" | "armor" | "weapons";
}>();
</script>

<template>
  <template v-if="kind === 'classes'">
    <p class="item-stat">HP {{ (item as PlayerClass).hp }}</p>
    <p v-if="(item as PlayerClass).activeAbility" class="item-ability">
      <span class="ability-label">Active</span>
      {{ (item as PlayerClass).activeAbility }}
    </p>
    <p v-if="(item as PlayerClass).passiveAbility" class="item-ability">
      <span class="ability-label">Passive</span>
      {{ (item as PlayerClass).passiveAbility }}
    </p>
  </template>

  <template v-else-if="kind === 'armor'">
    <p class="item-stat">Speed {{ (item as PlayerArmor).speed }}</p>
    <p v-if="(item as PlayerArmor).specialMovement" class="item-ability">
      <span class="ability-label">Movement</span>
      {{ (item as PlayerArmor).specialMovement }}
    </p>
    <p v-if="(item as PlayerArmor).armorAction" class="item-ability">
      <span class="ability-label">Armor action</span>
      {{ (item as PlayerArmor).armorAction }}
    </p>
    <p v-if="(item as PlayerArmor).reversal" class="item-ability">
      <span class="ability-label">Reversal ({{ (item as PlayerArmor).reversal.charges }} charges)</span>
      {{ (item as PlayerArmor).reversal.effect }}
    </p>
  </template>

  <template v-else>
    <p v-if="(item as PlayerWeapon).activeAbility" class="item-ability">
      <span class="ability-label">Active</span>
      {{ (item as PlayerWeapon).activeAbility }}
    </p>
    <p v-if="(item as PlayerWeapon).passiveAbility" class="item-ability">
      <span class="ability-label">Passive</span>
      {{ (item as PlayerWeapon).passiveAbility }}
    </p>
  </template>
</template>

<style scoped>
.item-stat {
  margin: 0.5rem 0 0;
  color: var(--color-text);
  font-size: 0.85rem;
}

.item-ability {
  margin: 0.5rem 0 0;
  line-height: 1.45;
}
</style>
