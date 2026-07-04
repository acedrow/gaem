import type { PatternDirection, PlayerAction } from "@gaem/shared";
import { nextPatternDirection } from "@gaem/shared";
import { computed, ref } from "vue";

export type BoardActionMode =
  | "move"
  | "attack"
  | "shove"
  | "sprint"
  | "armorTeleport"
  | "armorPush"
  | "rez"
  | null;

const mode = ref<BoardActionMode>(null);
const attackDirection = ref<PatternDirection>("n");
const attackAimed = ref(false);
const rangeAttackTargetIds = ref<string[]>([]);
const movePath = ref<{ x: number; y: number }[]>([]);
const pendingTargetEnemyId = ref<string | null>(null);
const pendingTargetPlayerId = ref<string | null>(null);
const armorLanding = ref<{ x: number; y: number } | null>(null);
const armorPush = ref<1 | 2 | 3>(1);

export function useBoardActionMode() {
  const isActive = computed(() => mode.value !== null);

  function setMode(next: BoardActionMode) {
    mode.value = next;
    attackAimed.value = false;
    rangeAttackTargetIds.value = [];
    movePath.value = [];
    pendingTargetEnemyId.value = null;
    pendingTargetPlayerId.value = null;
    armorLanding.value = null;
  }

  function clearMode() {
    setMode(null);
  }

  function rotateAttackDirection() {
    attackDirection.value = nextPatternDirection(attackDirection.value);
  }

  function appendMoveStep(x: number, y: number) {
    movePath.value = [...movePath.value, { x, y }];
  }

  function resetMovePath() {
    movePath.value = [];
  }

  return {
    mode,
    attackDirection,
    attackAimed,
    rangeAttackTargetIds,
    movePath,
    pendingTargetEnemyId,
    pendingTargetPlayerId,
    armorLanding,
    armorPush,
    isActive,
    setMode,
    clearMode,
    rotateAttackDirection,
    appendMoveStep,
    resetMovePath,
  };
}

export function buildPlayerActionFromMode(
  m: BoardActionMode,
  opts: {
    direction: PatternDirection;
    path: { x: number; y: number }[];
    targetEnemyId: string | null;
    targetEnemyIds?: string[];
    targetPlayerId: string | null;
    landing: { x: number; y: number } | null;
    push: 1 | 2 | 3;
  },
): PlayerAction | null {
  switch (m) {
    case "attack":
      return opts.targetEnemyId
        ? {
            action: "attack",
            direction: opts.direction,
            targetEnemyId: opts.targetEnemyId,
          }
        : opts.targetEnemyIds?.length
          ? {
              action: "attack",
              direction: opts.direction,
              targetEnemyIds: opts.targetEnemyIds,
            }
          : { action: "attack", direction: opts.direction };
    case "shove":
      if (opts.targetEnemyId) return { action: "shove", targetEnemyId: opts.targetEnemyId };
      if (opts.targetPlayerId) return { action: "shove", targetPlayerId: opts.targetPlayerId };
      return null;
    case "sprint":
      return opts.path.length ? { action: "sprintMove", x: opts.path[0]!.x, y: opts.path[0]!.y } : null;
    case "armorTeleport":
      if (!opts.targetEnemyId || !opts.landing) return null;
      return {
        action: "armorAction",
        targetEnemyId: opts.targetEnemyId,
        landingX: opts.landing.x,
        landingY: opts.landing.y,
      };
    case "armorPush":
      if (!opts.targetEnemyId && !opts.targetPlayerId) return null;
      return {
        action: "armorAction",
        targetEnemyId: opts.targetEnemyId ?? undefined,
        targetPlayerId: opts.targetPlayerId ?? undefined,
        push: opts.push,
      };
    case "rez":
      return opts.targetPlayerId ? { action: "rez", targetPlayerId: opts.targetPlayerId } : null;
    default:
      return null;
  }
}
