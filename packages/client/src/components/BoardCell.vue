<script setup lang="ts">
import type { EffectStacks, Enemy, MapTile, Player } from "@gaem/shared";
import { getEnemyMaxHp, getEnemyScale, getEffectSummary, getPlayerMaxHp } from "@gaem/shared";
import { computed } from "vue";

import EffectIcon from "./EffectIcon.vue";
import HpBar from "./HpBar.vue";
import TowerIcon from "./TowerIcon.vue";

export type CellRenderState = {
  terrainClass: string | null;
  movable: boolean;
  moveSecondary: boolean;
  deployable: boolean;
  gmMovable: boolean;
  gmSpawnable: boolean;
  patternPrimary: boolean;
  patternSecondary: boolean;
  combatTargetPrimary: boolean;
  combatTargetSecondary: boolean;
  combatTargetHeal: boolean;
  combatTargetInvalid: boolean;
  patternRecoil: boolean;
  tile: MapTile | undefined;
  player: Player | undefined;
  enemyAnchor: Enemy | undefined;
  enemyHp?: { currentHp: number; maxHp: number };
  showSwarmHp?: boolean;
  effectStacks?: EffectStacks;
  turnEnded?: boolean;
  playerDowned?: boolean;
  playerPortraitUrl?: string | null;
  hasSeed?: boolean;
  towerOwnerHue?: number | null;
};

const MAX_VISIBLE_EFFECTS = 4;

const props = defineProps<{
  x: number;
  y: number;
  cell: CellRenderState;
  isHovered: boolean;
  draggingDeploy: boolean;
  playerHue: number | null;
  canDragDeploy: boolean;
  isPlayerSelected: boolean;
  isEnemySelected: boolean;
  showHealthBars: boolean;
  showEnemyHealthBars: boolean;
  enemyDying?: boolean;
  playerTeleporting?: boolean;
  enemyAnimating?: boolean;
}>();

const emit = defineEmits<{
  click: [];
  hover: [];
  unhover: [];
  playerClick: [];
  enemyClick: [];
  deployPointerDown: [event: PointerEvent];
}>();

const effectEntries = computed(() => {
  const stacks = props.cell.effectStacks;
  if (!stacks) return [];
  return Object.entries(stacks)
    .filter(([, v]) => v > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, stacks]) => ({ id, stacks }));
});

const visibleEffects = computed(() => effectEntries.value.slice(0, MAX_VISIBLE_EFFECTS));
const overflowCount = computed(() =>
  Math.max(0, effectEntries.value.length - MAX_VISIBLE_EFFECTS),
);

function effectTitle(id: string, stacks: number): string {
  const summary = getEffectSummary(id);
  return summary ? `${id}:${stacks} — ${summary}` : `${id}:${stacks}`;
}

function towerIconSize(enemy: Enemy): number {
  const scale = getEnemyScale(enemy);
  return scale > 1 ? 22 : 16;
}

const ENEMY_SCALE_GAP = 3;
const ENEMY_SCALE_INSET = 8;
const ENEMY_PIECE_OFFSET = 4;

function enemyPieceStyle(enemy: Enemy): Record<string, string> {
  const scale = getEnemyScale(enemy);
  if (scale <= 1) return {};
  return {
    width: `calc(${scale * 100}% + ${(scale - 1) * ENEMY_SCALE_GAP}px - ${ENEMY_SCALE_INSET}px)`,
    height: `calc(${scale * 100}% + ${(scale - 1) * ENEMY_SCALE_GAP}px - ${ENEMY_SCALE_INSET}px)`,
    inset: `${ENEMY_PIECE_OFFSET}px auto auto ${ENEMY_PIECE_OFFSET}px`,
  };
}

function effectBadgeStyle(enemy: Enemy | undefined): Record<string, string> {
  if (!enemy) return {};
  const scale = getEnemyScale(enemy);
  if (scale <= 1) return {};
  const extra = scale - 1;
  return {
    top: `${ENEMY_PIECE_OFFSET}px`,
    right: `calc(-${extra * 100}% - ${extra * ENEMY_SCALE_GAP}px - ${ENEMY_PIECE_OFFSET}px + ${ENEMY_SCALE_INSET}px)`,
  };
}

const scaledEnemyEffects = computed(
  () => !!props.cell.enemyAnchor && getEnemyScale(props.cell.enemyAnchor) > 1 && effectEntries.value.length > 0,
);

const playerHp = computed(() => {
  const player = props.cell.player;
  if (!player) return null;
  const maxHp = getPlayerMaxHp(player);
  return { currentHp: player.hp ?? maxHp, maxHp };
});

const enemyHp = computed(() => {
  if (props.cell.enemyHp) return props.cell.enemyHp;
  const enemy = props.cell.enemyAnchor;
  if (!enemy) return null;
  const maxHp = getEnemyMaxHp(enemy);
  return { currentHp: enemy.hp ?? maxHp, maxHp };
});

const showEnemyHpBar = computed(
  () =>
    props.showEnemyHealthBars &&
    enemyHp.value &&
    (props.cell.showSwarmHp !== false),
);
</script>

<template>
  <button
    type="button"
    class="cell"
    :data-cell-x="x"
    :data-cell-y="y"
    :class="{
      [cell.terrainClass ?? '']: !!cell.terrainClass,
      movable: cell.movable,
      'move-secondary': cell.moveSecondary,
      deployable: cell.deployable,
      'gm-movable': cell.gmMovable,
      'gm-spawnable': cell.gmSpawnable,
      'pattern-primary': cell.patternPrimary,
      'pattern-secondary': cell.patternSecondary,
      'combat-target-primary': cell.combatTargetPrimary,
      'combat-target-secondary': cell.combatTargetSecondary,
      'combat-target-heal': cell.combatTargetHeal,
      'combat-target-invalid': cell.combatTargetInvalid,
      'pattern-recoil': cell.patternRecoil,
      'scaled-enemy-effects': scaledEnemyEffects,
      'enemy-dying': enemyDying,
    }"
    @click="emit('click')"
    @mouseenter="emit('hover')"
    @mouseleave="emit('unhover')"
  >
    <span v-if="cell.hasSeed" class="seed-marker" title="Seed" />
    <span v-if="cell.combatTargetInvalid" class="combat-target-invalid-mark" aria-hidden="true" />
    <span
      v-if="cell.enemyAnchor && !enemyAnimating"
      class="piece enemy"
      :class="{
        selected: isEnemySelected,
        'turn-ended': cell.turnEnded,
        dying: enemyDying,
        'tower-piece': cell.enemyAnchor.kind === 'tower',
      }"
      :style="[
        enemyPieceStyle(cell.enemyAnchor),
        cell.towerOwnerHue != null
          ? { background: `hsl(${cell.towerOwnerHue} 55% 38%)`, borderColor: `hsl(${cell.towerOwnerHue} 70% 55%)` }
          : {},
      ]"
      @click.stop="emit('enemyClick')"
    >
      <span
        v-if="cell.enemyAnchor.kind === 'tower'"
        class="tower-icon-wrap"
        :title="cell.enemyAnchor.name ?? 'Tower'"
      >
        <TowerIcon :size="towerIconSize(cell.enemyAnchor)" />
      </span>
      <span v-if="cell.turnEnded" class="turn-ended-shade" aria-hidden="true"></span>
      <span v-if="cell.turnEnded" class="turn-ended-zzz" aria-hidden="true">
        <span class="z z1">z</span><span class="z z2">z</span><span class="z z3">z</span>
      </span>
      <HpBar
        v-if="showEnemyHpBar"
        class="token-hp-bar"
        compact
        :current-hp="enemyHp!.currentHp"
        :max-hp="enemyHp!.maxHp"
      />
    </span>
    <span
      v-if="cell.player && !playerTeleporting"
      class="piece player-piece"
      :class="{
        selected: isPlayerSelected,
        draggable: canDragDeploy,
        dragging: draggingDeploy && canDragDeploy,
        'turn-ended': cell.turnEnded && !cell.playerDowned,
        'player-downed': cell.playerDowned,
        'has-portrait': !!cell.playerPortraitUrl,
      }"
      :style="!cell.playerPortraitUrl && playerHue != null ? { background: `hsl(${playerHue} 70% 45%)` } : undefined"
      @click.stop="emit('playerClick')"
      @pointerdown.stop="emit('deployPointerDown', $event)"
    >
      <img
        v-if="cell.playerPortraitUrl"
        :src="cell.playerPortraitUrl"
        alt=""
        class="portrait-img"
      />
      <span
        v-if="cell.playerDowned || (cell.turnEnded && !cell.playerPortraitUrl)"
        class="turn-ended-shade"
        aria-hidden="true"
      ></span>
      <span v-if="cell.turnEnded && !cell.playerDowned" class="turn-ended-zzz" aria-hidden="true">
        <span class="z z1">z</span><span class="z z2">z</span><span class="z z3">z</span>
      </span>
      <span v-if="cell.playerDowned" class="player-down-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
          <path
            d="M12 2a5 5 0 0 0-5 5c0 1.74.89 3.27 2.24 4.17C7.77 12.03 6 14.13 6 16.5V18h12v-1.5c0-2.37-1.77-4.47-3.24-5.33A4.99 4.99 0 0 0 17 7a5 5 0 0 0-5-5Zm-1.5 15v2h3v-2h-3Z"
          />
        </svg>
      </span>
      <HpBar
        v-if="showHealthBars && playerHp"
        class="token-hp-bar"
        compact
        :current-hp="playerHp.currentHp"
        :max-hp="playerHp.maxHp"
      />
    </span>
    <div v-if="effectEntries.length" class="effect-badges" :style="effectBadgeStyle(cell.enemyAnchor)">
      <span
        v-for="effect in visibleEffects"
        :key="effect.id"
        class="effect-badge"
        :title="effectTitle(effect.id, effect.stacks)"
      >
        <EffectIcon :effect-id="effect.id" :stacks="effect.stacks" :size="12" show-stacks />
      </span>
      <span v-if="overflowCount > 0" class="effect-overflow" :title="`${overflowCount} more effects`">
        +{{ overflowCount }}
      </span>
    </div>
  </button>
</template>

<style scoped>
.cell {
  position: relative;
  border: none;
  border-radius: 0;
  min-height: 28px;
  padding: 0;
  cursor: default;
  background: var(--color-surface-raised);
}

.cell.impassable {
  background: var(--color-border-strong);
  cursor: not-allowed;
}

.cell.obstacle {
  background: var(--color-tile-difficult);
  cursor: not-allowed;
}

.cell.void {
  background: var(--color-bg);
  cursor: not-allowed;
}

.cell.cover {
  background: var(--color-tile-grass);
}

.cell.uneasy {
  background: var(--color-tile-sand);
}

.cell.movable {
  cursor: pointer;
  outline: 1px dashed var(--color-accent-muted);
}

.cell.move-secondary {
  cursor: pointer;
  outline: 1px dashed var(--color-purple-outline-strong);
  background: var(--color-purple-faint-bg);
}

.cell.deployable {
  cursor: pointer;
  outline: 1px dashed var(--color-success-outline);
}

.cell.gm-movable {
  cursor: pointer;
  outline: 1px dashed var(--color-danger-muted-border);
}

.cell.gm-spawnable {
  cursor: crosshair;
  outline: 1px dashed var(--color-purple-outline);
}

.cell.pattern-primary {
  cursor: pointer;
}

.cell.pattern-primary::after {
  content: "";
  position: absolute;
  inset: 0;
  outline: 2px solid var(--color-purple);
  background: var(--color-purple-subtle-bg);
  z-index: 1;
  pointer-events: none;
}

.cell.pattern-secondary {
  cursor: pointer;
}

.cell.pattern-secondary::before {
  content: "";
  position: absolute;
  inset: 0;
  outline: 1px dashed var(--color-purple-outline-strong);
  background: var(--color-purple-faint-bg);
  z-index: 0;
  pointer-events: none;
}

.cell.combat-target-primary {
  cursor: pointer;
}

.cell.combat-target-primary::after {
  content: "";
  position: absolute;
  inset: 0;
  outline: 2px solid var(--color-board-target-attack);
  background: var(--color-board-target-attack-bg);
  z-index: 1;
  pointer-events: none;
}

.cell.combat-target-primary.combat-target-heal::after {
  outline-color: var(--color-board-target-heal);
  background: var(--color-board-target-heal-bg);
}

.cell.combat-target-secondary {
  cursor: pointer;
}

.cell.combat-target-secondary::before {
  content: "";
  position: absolute;
  inset: 0;
  outline: 1px dashed var(--color-board-target-attack-outline);
  background: var(--color-board-target-attack-bg-faint);
  z-index: 0;
  pointer-events: none;
}

.cell.combat-target-secondary.combat-target-heal::before {
  outline-color: var(--color-board-target-heal-outline);
  background: var(--color-board-target-heal-bg-faint);
}

.combat-target-invalid-mark {
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
  background:
    linear-gradient(
      to top left,
      transparent calc(50% - 1.5px),
      var(--color-danger) calc(50% - 1.5px),
      var(--color-danger) calc(50% + 1.5px),
      transparent calc(50% + 1.5px)
    ),
    linear-gradient(
      to top right,
      transparent calc(50% - 1.5px),
      var(--color-danger) calc(50% - 1.5px),
      var(--color-danger) calc(50% + 1.5px),
      transparent calc(50% + 1.5px)
    );
  opacity: 0.9;
}

.cell.combat-target-invalid {
  cursor: not-allowed;
}

.cell.pattern-recoil {
  outline: 1px dashed var(--color-warning-outline);
  background: var(--color-warning-faint-bg);
}

.cell.scaled-enemy-effects {
  z-index: 4;
}

.cell.enemy-dying .piece.enemy,
.cell.enemy-dying .effect-badges {
  pointer-events: none;
  animation: enemy-death-fade 0.75s ease-in-out 2.25s forwards;
}

@keyframes enemy-death-fade {
  from {
    opacity: 1;
  }
  to {
    opacity: 0;
  }
}

.piece {
  position: absolute;
  inset: 4px;
  border-radius: 50%;
  display: block;
  z-index: 1;
  overflow: visible;
}

.piece.has-portrait {
  background: var(--color-surface);
}

.portrait-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  border-radius: 50%;
}

.piece.turn-ended .portrait-img,
.piece.player-downed .portrait-img {
  filter: brightness(0.42) saturate(0.65);
}

.player-down-icon {
  position: absolute;
  inset: 0;
  z-index: 3;
  display: grid;
  place-items: center;
  pointer-events: none;
  color: var(--color-text);
  opacity: 0.92;
  filter: drop-shadow(var(--shadow-text));
}

.turn-ended-shade {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: var(--color-overlay-label);
  pointer-events: none;
  z-index: 1;
}

.turn-ended-zzz {
  position: absolute;
  top: -3px;
  left: -1px;
  z-index: 3;
  display: flex;
  align-items: flex-end;
  pointer-events: none;
  font-weight: 900;
  font-style: italic;
  color: var(--color-muted);
  text-shadow: var(--shadow-text-strong);
  line-height: 1;
  animation: turn-ended-zzz-float 2.4s ease-in-out infinite;
}

.turn-ended-zzz .z1 {
  font-size: 0.62rem;
}

.turn-ended-zzz .z2 {
  font-size: 0.48rem;
  margin-bottom: 1px;
}

.turn-ended-zzz .z3 {
  font-size: 0.36rem;
  margin-bottom: 2px;
}

@keyframes turn-ended-zzz-float {
  0%,
  100% {
    transform: translate(0, 0);
    opacity: 0.88;
  }
  50% {
    transform: translate(1px, -3px);
    opacity: 1;
  }
}

.piece.player-piece {
  cursor: pointer;
  z-index: 2;
}

.piece.player-piece.draggable {
  cursor: grab;
}

.piece.player-piece.dragging {
  cursor: grabbing;
}

.piece.enemy {
  background: hsl(0 70% 45%);
  z-index: 1;
}

.piece.selected {
  outline: 2px solid var(--color-on-accent);
}

.token-hp-bar {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 2;
  pointer-events: none;
}

.effect-badges {
  position: absolute;
  top: 0;
  right: 0;
  z-index: 5;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 1px;
  pointer-events: none;
}

.effect-badge {
  display: flex;
  padding: 1px;
  border-radius: 3px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  color: var(--color-text);
  pointer-events: auto;
}

.effect-overflow {
  padding: 0 3px;
  border-radius: 3px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  font-size: 0.5rem;
  font-weight: 700;
  line-height: 1.4;
  color: var(--color-muted);
  pointer-events: auto;
}

.tower-piece {
  border: 2px solid var(--color-accent, #c9a227);
  border-radius: 5px;
  background: var(--color-surface-raised);
}

.tower-icon-wrap {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-on-accent, #f5f0e6);
  filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.35));
  pointer-events: none;
}

.seed-marker {
  position: absolute;
  bottom: 2px;
  left: 2px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #6ecf6e;
  border: 1px solid #2d6b2d;
  z-index: 4;
  pointer-events: none;
}
</style>
