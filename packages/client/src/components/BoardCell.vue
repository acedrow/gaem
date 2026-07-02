<script setup lang="ts">
import type { Enemy, MapTile, Player } from "@gaem/shared";
import { getEnemyScale } from "@gaem/shared";

export type CellRenderState = {
  terrainClass: string | null;
  movable: boolean;
  deployable: boolean;
  gmMovable: boolean;
  gmSpawnable: boolean;
  patternPrimary: boolean;
  patternSecondary: boolean;
  patternRecoil: boolean;
  tile: MapTile | undefined;
  player: Player | undefined;
  enemyAnchor: Enemy | undefined;
};

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
}>();

const emit = defineEmits<{
  click: [];
  hover: [];
  unhover: [];
  playerClick: [];
  enemyClick: [];
  deployPointerDown: [event: PointerEvent];
}>();

function enemyPieceStyle(enemy: Enemy): Record<string, string> {
  const scale = getEnemyScale(enemy);
  if (scale <= 1) return {};
  const gap = 3;
  const inset = 8;
  return {
    width: `calc(${scale * 100}% + ${(scale - 1) * gap}px - ${inset}px)`,
    height: `calc(${scale * 100}% + ${(scale - 1) * gap}px - ${inset}px)`,
    inset: "4px auto auto 4px",
  };
}
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
      deployable: cell.deployable,
      'gm-movable': cell.gmMovable,
      'gm-spawnable': cell.gmSpawnable,
      'pattern-primary': cell.patternPrimary,
      'pattern-secondary': cell.patternSecondary,
      'pattern-recoil': cell.patternRecoil,
    }"
    @click="emit('click')"
    @mouseenter="emit('hover')"
    @mouseleave="emit('unhover')"
  >
    <span
      v-if="cell.enemyAnchor"
      class="piece enemy"
      :class="{ selected: isEnemySelected }"
      :style="enemyPieceStyle(cell.enemyAnchor)"
      @click.stop="emit('enemyClick')"
    />
    <span
      v-if="cell.player"
      class="piece player-piece"
      :class="{
        selected: isPlayerSelected,
        draggable: canDragDeploy,
        dragging: draggingDeploy && canDragDeploy,
      }"
      :style="playerHue != null ? { background: `hsl(${playerHue} 70% 45%)` } : undefined"
      @click.stop="emit('playerClick')"
      @pointerdown.stop="emit('deployPointerDown', $event)"
    />
  </button>
</template>

<style scoped>
.cell {
  position: relative;
  border: none;
  border-radius: 4px;
  min-height: 28px;
  padding: 0;
  cursor: default;
  background: var(--color-surface-raised);
}

.cell.impassable {
  background: #484f58;
  cursor: not-allowed;
}

.cell.obstacle {
  background: #6e4c2a;
  cursor: not-allowed;
}

.cell.void {
  background: var(--color-bg);
  cursor: not-allowed;
}

.cell.cover {
  background: #2d4a3e;
}

.cell.uneasy {
  background: #3d3520;
}

.cell.movable {
  cursor: pointer;
  outline: 1px dashed var(--color-accent-muted);
}

.cell.deployable {
  cursor: pointer;
  outline: 1px dashed #3fb95066;
}

.cell.gm-movable {
  cursor: pointer;
  outline: 1px dashed #f8514966;
}

.cell.gm-spawnable {
  cursor: crosshair;
  outline: 1px dashed #a371f766;
}

.cell.pattern-primary {
  outline: 2px solid var(--color-purple);
  background: #a371f722;
}

.cell.pattern-secondary {
  outline: 1px dashed #a371f799;
  background: #a371f711;
  cursor: pointer;
}

.cell.pattern-recoil {
  outline: 1px dashed #d2992266;
  background: #d2992211;
}

.piece {
  position: absolute;
  inset: 4px;
  border-radius: 50%;
  display: block;
  z-index: 1;
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
  outline: 2px solid #fff;
}
</style>
