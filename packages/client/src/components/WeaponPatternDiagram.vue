<script setup lang="ts">
import type { WeaponAttackSpec, WeaponBombPattern, WeaponPatternLevel } from "@gaem/shared";
import { attackSpecHasDiagram, buildPatternGrid } from "@gaem/shared";
import { computed, ref } from "vue";

const props = defineProps<{
  attack: WeaponAttackSpec;
}>();

const levelIndex = ref(0);
const bombIndex = ref(0);

const hasDiagram = computed(() => attackSpecHasDiagram(props.attack));

const activeLevel = computed((): WeaponPatternLevel | null => {
  const levels = props.attack.levels;
  if (!levels?.length) return null;
  return levels[levelIndex.value] ?? levels[0] ?? null;
});

const activeBomb = computed((): WeaponBombPattern | null => {
  const bombs = props.attack.bombs;
  if (!bombs?.length) return null;
  return bombs[bombIndex.value] ?? bombs[0] ?? null;
});

const damageLabel = computed(() => {
  if (activeLevel.value) return activeLevel.value.damage;
  if (activeBomb.value) return activeBomb.value.damage;
  return props.attack.damage;
});

const patternNote = computed(() => {
  if (props.attack.rangeTargets) {
    return `Up to ${props.attack.rangeTargets.maxTargets} targets within Range:${props.attack.rangeTargets.range}`;
  }
  if (activeBomb.value?.range) return `Range ${activeBomb.value.range}`;
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

  const tiles = activeLevel.value?.tiles ?? activeBomb.value?.tiles ?? props.attack.tiles ?? [];
  const healTiles = activeBomb.value?.heal ? activeBomb.value.tiles : undefined;
  return buildPatternGrid(tiles, {
    healTiles: activeBomb.value?.heal ? healTiles : undefined,
    showOrigin: !activeBomb.value,
  });
});
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
        :class="{ active: bombIndex === i }"
        @click="bombIndex = i"
      >
        {{ bomb.name }}
      </button>
    </div>

    <div
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
        :class="cell"
      >
        <span v-if="cell === 'origin'" class="origin-mark" aria-hidden="true">▶</span>
      </span>
    </div>
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
  cursor: pointer;
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

.pattern-cell.heal {
  background: var(--color-accent-bright);
  border-color: var(--color-accent);
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

.pattern-cell.empty {
  opacity: 0.35;
}
</style>
