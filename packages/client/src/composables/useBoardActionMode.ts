import type { PatternDirection, PlayerAction } from "@gaem/shared";
import { nextPatternDirection } from "@gaem/shared";
import { computed, ref } from "vue";

export type BoardActionMode =
  | "move"
  | "attack"
  | "omnistrike"
  | "warhook"
  | "shove"
  | "sprint"
  | "armorTeleport"
  | "armorPush"
  | "armorPlaceTower"
  | "towerTeleport"
  | "kataptyPick"
  | "rez"
  | "kopisMark"
  | "sharurAttractor"
  | "hephaestusSynesis"
  | "hephaestusRestore"
  | "harpeTrap"
  | "varunastraBorrow"
  | "assistedLaunch"
  | "gmEnemyAttack"
  | null;

export type OmnistrikeStep = "selectBombs" | "placeFirst" | "placeSecond" | "confirm";
export type WarhookStep = "selectTarget" | "selectLanding";
export type TowerTeleportStep = "selectLanding" | "selectKeraunoTarget";
export type AssistedLaunchStep = "selectAnchor" | "confirm";

const mode = ref<BoardActionMode>(null);
const attackDirection = ref<PatternDirection>("n");
const attackAimed = ref(false);
const attackAnchor = ref<{ x: number; y: number } | null>(null);
const rangeAttackTargetIds = ref<string[]>([]);
const movePath = ref<{ x: number; y: number }[]>([]);
const pendingTargetEnemyId = ref<string | null>(null);
const pendingTargetPlayerId = ref<string | null>(null);
const armorLanding = ref<{ x: number; y: number } | null>(null);
const armorPush = ref<1 | 2 | 3>(1);
const omnistrikeStep = ref<OmnistrikeStep>("selectBombs");
const omnistrikeBombs = ref<[number | null, number | null]>([null, null]);
const omnistrikeAnchors = ref<[{ x: number; y: number } | null, { x: number; y: number } | null]>([
  null,
  null,
]);
const omnistrikeAimed = ref(false);
const warhookStep = ref<WarhookStep>("selectTarget");
const warhookTarget = ref<{ enemyId?: string; x: number; y: number } | null>(null);
const warhookLandingOptions = ref<{ x: number; y: number }[]>([]);
const towerTeleportStep = ref<TowerTeleportStep>("selectLanding");
const towerTeleportLanding = ref<{ x: number; y: number } | null>(null);
const kataptyTargetIds = ref<string[]>([]);
const borrowAllyId = ref<string | null>(null);
const assistedLaunchStep = ref<AssistedLaunchStep>("selectAnchor");
const assistedLaunchAnchor = ref<{ x: number; y: number } | null>(null);
const gmEnemyAttack = ref<{ enemyId: string; attackIndex: number; damage?: number; swarm?: boolean } | null>(null);

function resetAssistedLaunchState() {
  assistedLaunchStep.value = "selectAnchor";
  assistedLaunchAnchor.value = null;
}

function resetWarhookState() {
  warhookStep.value = "selectTarget";
  warhookTarget.value = null;
  warhookLandingOptions.value = [];
}

function resetOmnistrikeState() {
  omnistrikeStep.value = "selectBombs";
  omnistrikeBombs.value = [null, null];
  omnistrikeAnchors.value = [null, null];
  omnistrikeAimed.value = false;
}

function resetTowerTeleportState() {
  towerTeleportStep.value = "selectLanding";
  towerTeleportLanding.value = null;
}

export function useBoardActionMode() {
  const isActive = computed(() => mode.value !== null);

  function setMode(next: BoardActionMode) {
    mode.value = next;
    attackAimed.value = false;
    attackAnchor.value = null;
    rangeAttackTargetIds.value = [];
    movePath.value = [];
    pendingTargetEnemyId.value = null;
    pendingTargetPlayerId.value = null;
    armorLanding.value = null;
    kataptyTargetIds.value = [];
    borrowAllyId.value = null;
    gmEnemyAttack.value = null;
    resetAssistedLaunchState();
    resetOmnistrikeState();
    resetWarhookState();
    resetTowerTeleportState();
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

  function startGmEnemyAttack(enemyId: string, attackIndex: number, damage?: number) {
    setMode("gmEnemyAttack");
    gmEnemyAttack.value = { enemyId, attackIndex, damage };
  }

  function startGmSwarmAttack(enemyId: string, attackIndex: number, damage?: number) {
    setMode("gmEnemyAttack");
    gmEnemyAttack.value = { enemyId, attackIndex, damage, swarm: true };
  }

  return {
    mode,
    attackDirection,
    attackAimed,
    attackAnchor,
    rangeAttackTargetIds,
    movePath,
    pendingTargetEnemyId,
    pendingTargetPlayerId,
    armorLanding,
    armorPush,
    omnistrikeStep,
    omnistrikeBombs,
    omnistrikeAnchors,
    omnistrikeAimed,
    warhookStep,
    warhookTarget,
    warhookLandingOptions,
    towerTeleportStep,
    towerTeleportLanding,
    kataptyTargetIds,
    borrowAllyId,
    assistedLaunchStep,
    assistedLaunchAnchor,
    gmEnemyAttack,
    isActive,
    setMode,
    clearMode,
    startGmEnemyAttack,
    startGmSwarmAttack,
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
    placeX?: number;
    placeY?: number;
    towerLanding?: { x: number; y: number } | null;
    keraunoTargetEnemyId?: string | null;
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
    case "armorPlaceTower":
      if (opts.placeX == null || opts.placeY == null) return null;
      return { action: "armorAction", x: opts.placeX, y: opts.placeY };
    case "towerTeleport":
      if (!opts.towerLanding) return null;
      return {
        action: "towerTeleport",
        x: opts.towerLanding.x,
        y: opts.towerLanding.y,
        keraunoTargetEnemyId: opts.keraunoTargetEnemyId ?? undefined,
      };
    case "kataptyPick":
      return opts.targetEnemyIds?.length
        ? { action: "kataptyEndTurn", targetEnemyIds: opts.targetEnemyIds }
        : null;
    case "rez":
      return opts.targetPlayerId ? { action: "rez", targetPlayerId: opts.targetPlayerId } : null;
    default:
      return null;
  }
}
