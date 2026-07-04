<script setup lang="ts">
import type { WeaponAttackSpec, WeaponBombPattern, WeaponPatternLevel } from "@gaem/shared";
import { attackSpecHasDiagram, buildPatternGrid } from "@gaem/shared";
import { computed, ref, watch } from "vue";

import RuleText from "./RuleText.vue";

const props = defineProps<{
  attack: WeaponAttackSpec;
  bombIndex?: number;
  selectable?: boolean;
}>();

const emit = defineEmits<{
  "update:bombIndex": [index: number];
  requestSelect: [index: number];
}>();

const levelIndex = ref(0);
const localBombIndex = ref(0);
const hoverBombIndex = ref<number | null>(null);

watch(
  () => props.bombIndex,
  (index) => {
    if (index != null) localBombIndex.value = index;
  },
  { immediate: true },
);

const equippedBombIndex = computed((): number | undefined => {
  if (props.bombIndex !== undefined) return props.bombIndex;
  if (props.selectable) return undefined;
  return localBombIndex.value;
});
const displayBombIndex = computed((): number | undefined => {
  if (hoverBombIndex.value != null) return hoverBombIndex.value;
  return equippedBombIndex.value;
});

const hasDiagram = computed(() => attackSpecHasDiagram(props.attack));

const activeLevel = computed((): WeaponPatternLevel | null => {
  const levels = props.attack.levels;
  if (!levels?.length) return null;
  return levels[levelIndex.value] ?? levels[0] ?? null;
});

const displayBomb = computed((): WeaponBombPattern | null => {
  const bombs = props.attack.bombs;
  const index = displayBombIndex.value;
  if (!bombs?.length || index == null) return null;
  return bombs[index] ?? null;
});

const damageLabel = computed(() => {
  if (activeLevel.value) return activeLevel.value.damage;
  if (displayBomb.value) return displayBomb.value.damage;
  return props.attack.damage;
});

const patternNote = computed(() => {
  if (props.attack.rangeTargets) {
    return `Up to ${props.attack.rangeTargets.maxTargets} targets within Range:${props.attack.rangeTargets.range}`;
  }
  if (displayBomb.value?.range) return `Range ${displayBomb.value.range}`;
  return null;
});

const displayGrid = computed(() => {
  if (props.attack.rangeTargets) {
    const r = props.attack.rangeTargets.range;
    const tiles: [number, number][] = [];
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) + Math.abs(dy) <= r && (dx !== 0 || dy !== 0)) {
          tiles.push([dx, dy]);
        }
      }
    }
    return buildPatternGrid(tiles);
  }

  const tiles = activeLevel.value?.tiles ?? displayBomb.value?.tiles ?? props.attack.tiles ?? [];
  const healTiles =
    displayBomb.value?.healTiles ??
    (displayBomb.value?.heal ? displayBomb.value.tiles : undefined);
  return buildPatternGrid(tiles, {
    healTiles,
    boundsTiles: displayBomb.value?.boundsTiles,
    showOrigin: !displayBomb.value,
  });
});

function selectBomb(index: number) {
  if (equippedBombIndex.value != null && index === equippedBombIndex.value) return;
  if (props.selectable) {
    emit("requestSelect", index);
    return;
  }
  if (props.bombIndex == null) {
    localBombIndex.value = index;
    emit("update:bombIndex", index);
  }
}
</script>

<template>
  <div v-if="hasDiagram" class="weapon-pattern">
    <div class="weapon-pattern-meta">
      <span class="weapon-pattern-damage">Damage {{ damageLabel }}</span>
      <span v-if="patternNote" class="weapon-pattern-note">{{ patternNote }}</span>
    </div>

    <div v-if="attack.levels?.length" class="variant-tabs">
      <button
        v-for="(level, i) in attack.levels"
        :key="level.label"
        type="button"
        class="variant-tab"
        :class="{ active: levelIndex === i }"
        @click="levelIndex = i"
      >
        {{ level.label }}
      </button>
    </div>

    <div v-if="attack.bombs?.length" class="variant-tabs">
      <button
        v-for="(bomb, i) in attack.bombs"
        :key="bomb.name"
        type="button"
        class="variant-tab"
        :class="{
          active: equippedBombIndex === i,
          selectable,
          preview: hoverBombIndex === i && equippedBombIndex !== i,
        }"
        @mouseenter="hoverBombIndex = i"
        @mouseleave="hoverBombIndex = null"
        @click.stop="selectBomb(i)"
      >
        {{ bomb.name }}
      </button>
    </div>

    <p
      v-if="attack.bombs?.length && displayBombIndex == null"
      class="weapon-pattern-empty"
    >
      Select a bomb type (costs 1 charge).
    </p>

    <div
      v-else
      class="pattern-grid"
      :style="{
        gridTemplateColumns: `repeat(${displayGrid.width}, 1.35rem)`,
        gridTemplateRows: `repeat(${displayGrid.height}, 1.35rem)`,
      }"
    >
      <span
        v-for="(cell, index) in displayGrid.cells.flat()"
        :key="index"
        class="pattern-cell"
        :class="[cell, { 'heal-blue': cell === 'heal' }]"
      >
        <span v-if="cell === 'origin'" class="origin-mark" aria-hidden="true">▶</span>
      </span>
    </div>

    <p v-if="displayBomb?.description" class="weapon-pattern-description">
      <RuleText :text="displayBomb.description" />
    </p>
  </div>
</template>

<style scoped>
.weapon-pattern {
  margin-top: 0.5rem;
}

.weapon-pattern-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem 0.75rem;
  margin-bottom: 0.45rem;
  font-size: 0.8rem;
}

.weapon-pattern-damage {
  font-weight: 600;
  color: var(--color-text);
}

.weapon-pattern-note {
  color: var(--color-muted);
}

.variant-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  margin-bottom: 0.45rem;
}

.variant-tab {
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: var(--color-surface);
  color: var(--color-muted);
  font-family: inherit;
  font-size: 0.68rem;
  font-weight: 600;
  padding: 0.12rem 0.45rem;
  cursor: default;
}

.variant-tab.selectable {
  cursor: pointer;
}

.variant-tab.selectable:not(.active):hover,
.variant-tab.preview {
  border-color: var(--color-accent-muted);
  color: var(--color-text);
}

.variant-tab.active {
  border-color: var(--color-accent);
  color: var(--color-text);
  background: var(--color-accent-muted);
}

.pattern-grid {
  display: inline-grid;
  gap: 2px;
  padding: 0.35rem;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-surface-raised);
}

.pattern-cell {
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--color-border);
  border-radius: 3px;
  background: var(--color-surface);
}

.pattern-cell.attack {
  background: var(--color-pattern-orange);
  border-color: var(--color-pattern-orange-dark);
}

.pattern-cell.heal-blue {
  background: #4a8fd4;
  border-color: #2d6aad;
}

.pattern-cell.origin {
  background: var(--color-success);
  border-color: var(--color-success-bright);
  color: var(--color-on-dark);
}

.origin-mark {
  font-size: 0.62rem;
  line-height: 1;
}

.weapon-pattern-description {
  margin: 0.45rem 0 0;
  font-size: 0.75rem;
  color: var(--color-muted);
}

.weapon-pattern-empty {
  margin: 0;
  font-size: 0.75rem;
  color: var(--color-muted);
  font-style: italic;
}
</style>
