<script setup lang="ts">
import type { EffectStacks, Enemy, MapTile, PatternDirection, Player, PlayerAction, TerrainObject } from "@gaem/shared";
import {
  boardCellKey,
  buildBoardOccupancy,
  canGmMoveEnemies,
  canPlayerMove,
  coordKey,
  coordsToKeySet,
  drawableExpansionOptions,
  ensureEnemyMovement,
  enemyFootprintTiles,
  fixedPatternTilesInBounds,
  findPlayerMovementPath,
  getEnemyMaxHp,
  getEnemyScale,
  getEnemyScaleByName,
  getPlayerMaxHp,
  isPlayerDowned,
  isSandboxMode,
  isHealAttackSpec,
  isRangeTargetAttack,
  isRangedPatternAttack,
  isWalkable,
  manhattanDistance,
  movementStepCost,
  playerAttackDirectionsAt,
  evaluateAnchoredPatternPlacement,
  evaluateOmnistrikePlacement,
  computeOmnistrikeRangeSpan,
  collectBombPatternTiles,
  unionPatternTiles,
  resolveBombAttackSpec,
  getEquipmentAttackSpec,
  collectEquipmentPatternTiles,
  isHylicAnnihilationCorridor,
  areOrthogonallyConnected,
  isDirectTargetEnemyAttack,
  listRedirectableEnemyAttackIndices,
  rejectionFieldTileKeys,
  forceProjectionTileKeys,
  redirectionSourceTileKeys,
  enemyDirectAttackTargetEnemyIds,
  previewEnemyAttack,
  PATTERN_DIRECTIONS,
  rangeAttackTileKeys,
  rangeTargetDistance,
  rangeTargetMax,
  rangedPatternPlacementKeys,
  recoilTilesInBounds,
  resolveCombatAttackSpec,
  tileAt,
  usesAnchoredPatternPlacement,
  patternOriginFromAnchor,
  validateEnemyFootprint,
  warhookAdjacentLandingTiles,
  warhookNearestLandings,
  warhookRangeKeys,
  warhookValidTargetKeys,
  isWarhookTargetAt,
  isTowerEnemy,
  isFortificationEnemy,
  yadathanPlacementKeys,
  towerTeleportLandingKeys,
  kataptyTargetKeys,
  keraunoAdjacentEnemyIds,
  getPlayerTower,
  getArmorByName,
  getWeaponAttackSpec,
  tilesOnCardinalLine,
  tilesOnSegment,
  TOWER_IATROS,
  buildSwarmGroups,
  canSwarmMemberReachDest,
  getSwarmMemberHp,
  getSwarmMaxHp,
  swarmGroupForEnemy,
  swarmFringeTiles,
  pickSwarmMoveMember,
  getSwarmMovementRemaining,
  swarmCanonicalDisplayId,
  getEffectiveEnemyHp,
  getEffectiveEnemyMaxHp,
  getEnemyListingByName,
  weaponHasBreakerTag,
  attackTargetsSwarm,
  collectAttackTiles,
  enemyDirectAttackTargetPlayerIds,
  parseEnemyAttackString,
  swarmChipEligibleTargets,
  swarmChipPromptRequired,
  swarmMembersHitByTiles,
  isSethianWeaponName,
  SETHIAN_DAMAGE_CAP,
  maxSwarmStrikesAgainstTarget,
  previewPathProvokes,
  previewEnemyMoveProvokes,
  previewSprintProvokes,
  assistedLaunchAnchors,
  computeAssistedLaunch,
  tilesInAttractorZone,
  hasTileEffects,
  getEffectSummary,
  formatTileEffectTooltipLabel,
  terrainTypeDisplayName,
  type ProvokeTrigger,
} from "@gaem/shared";
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from "vue";

import { routesTokenClickToCellTargeting } from "../lib/boardCellTargeting.js";
import { useBoardActionMode } from "../composables/useBoardActionMode.js";
import { useCombatActions } from "../composables/useCombatActions.js";
import { useBoardSelection } from "../composables/useBoardSelection.js";
import { useBoardViewport } from "../composables/useBoardViewport.js";
import { useDamageIndicators } from "../composables/useDamageIndicators.js";
import { useEnemyDeathAnimations } from "../composables/useEnemyDeathAnimations.js";
import { useEnemyMoveAnimation } from "../composables/useEnemyMoveAnimation.js";
import { usePlayerTeleportAnimation } from "../composables/usePlayerTeleportAnimation.js";
import { useCharacterSheets } from "../composables/useCharacterSheets.js";
import { useEnemySpawnSelection } from "../composables/useEnemySpawnSelection.js";
import { clearActiveTool, useGmTools } from "../composables/useGmTools.js";
import { showToast } from "../composables/useToasts.js";
import { usePortraitCache } from "../composables/usePortraitCache.js";
import { useApi } from "../composables/useApi.js";
import { useEnemyPortraitColors } from "../composables/useEnemyPortraitColors.js";
import { useGameState } from "../composables/useGameState.js";
import { useInfoDataSelection } from "../composables/useInfoDataSelection.js";
import { usePatternSelection } from "../composables/usePatternSelection.js";
import { usePlayerSettings } from "../composables/usePlayerSettings.js";
import BoardCell, { type CellRenderState } from "./BoardCell.vue";
import BoardContextMenu, { type BoardContextMenuItem } from "./BoardContextMenu.vue";
import AddEffectModal from "./AddEffectModal.vue";
import AddTileEffectModal from "./AddTileEffectModal.vue";
import ChangeTileTerrainModal from "./ChangeTileTerrainModal.vue";
import BreakerPromptModal from "./BreakerPromptModal.vue";
import ProvokePromptModal from "./ProvokePromptModal.vue";
import SwarmChipModal from "./SwarmChipModal.vue";
import GmSwarmAttackModal from "./GmSwarmAttackModal.vue";

const props = defineProps<{
  role: "gm" | "player";
  playerProfile?: { id: string; name: string } | null;
  overlayEl?: HTMLElement | null;
}>();

const {
  boardSelection,
  selectedEnemyId,
  clearBoardSelection,
  selectBoardPlayer,
  selectBoardEnemy,
  selectBoardEnemyMember,
  toggleBoardEnemy,
  isPlayerSelected,
  isEnemySelected,
  isSoloSwarmMemberSelected,
} = useBoardSelection();

const selectedPlayerId = computed(() =>
  boardSelection.value?.kind === "player" ? boardSelection.value.id : null,
);
const { gameState, yourPlayerId, send } = useGameState();
const activePlayerSelected = computed(() => {
  const id = yourPlayerId.value;
  if (!id) return false;
  if (!selectedPlayerId.value) return true;
  return selectedPlayerId.value === id;
});
const { showHealthBars } = usePlayerSettings();
const showEnemyHealthBars = computed(() => showHealthBars.value && props.role === "gm");
const { indicators: damageIndicators } = useDamageIndicators(gameState);
const { sheets, loadSheets } = useCharacterSheets();
const boardPlayers = computed(() => gameState.value?.players);
const { portraitUrlFor } = usePortraitCache(sheets, boardPlayers);
const { enemyPortraitUrlForName } = useApi();
const { portraitBackgroundFor } = useEnemyPortraitColors();
const { dataCategory } = useInfoDataSelection();
const { selectedSpawnEnemyName, clearSpawnEnemySelection } = useEnemySpawnSelection();
const {
  activeTool: gmActiveTool,
  selectTargetKind: gmSelectTargetKind,
  bulkSelection: gmBulkSelection,
  setBulkSelection: setGmBulkSelection,
  clearBulkSelection: clearGmBulkSelection,
  isTileBulkSelected,
  isPlayerBulkSelected,
  isEnemyBulkSelected,
  isCellInBulkSelection,
  applyDamageEffectToToken,
} = useGmTools();
const {
  selectedPatternId,
  selectedPattern,
  patternSize,
  patternDirection,
  wallLopsidedExtra,
  modifierValues,
  drawnTiles,
  isDrawablePattern,
  tryExtendDrawing,
  cyclePatternDirection,
  setPatternHoverOrigin,
} = usePatternSelection();

const {
  mode: boardActionMode,
  attackDirection,
  attackAimed,
  attackAnchor,
  rangeAttackTargetIds,
  pendingTargetEnemyId,
  pendingTargetPlayerId,
  armorLanding,
  armorPush,
  omnistrikeStep,
  omnistrikeBombs,
  omnistrikeAnchors,
  warhookStep,
  warhookTarget,
  warhookLandingOptions,
  towerTeleportStep,
  towerTeleportLanding,
  kataptyTargetIds,
  borrowAllyId,
  assistedLaunchStep,
  assistedLaunchAnchor,
  equipmentCoverTiles,
  forceProjectionOrigin,
  forceProjectionStep,
  redirectSourceEnemyId,
  redirectAttackIndex,
  redirectStep,
  gmEnemyAttack,
  clearMode: clearBoardActionMode,
  rotateAttackDirection,
} = useBoardActionMode();
const { sendPlayerAction, sendMovePath, pendingReaction, reversalExtraAllyIds } = useCombatActions();

const hoveredKey = ref<string | null>(null);
const hoveredCell = ref<{ x: number; y: number } | null>(null);
const previewHoverCell = ref<{ x: number; y: number } | null>(null);
let previewHoverTimer: ReturnType<typeof setTimeout> | null = null;
watch(hoveredCell, (cell) => {
  if (previewHoverTimer) clearTimeout(previewHoverTimer);
  if (!cell) {
    previewHoverCell.value = null;
    return;
  }
  previewHoverTimer = setTimeout(() => {
    previewHoverCell.value = cell;
  }, 32);
});
const draggingDeploy = ref(false);
const contextMenu = ref<{
  open: boolean;
  x: number;
  y: number;
  items: BoardContextMenuItem[];
  enemyId?: string;
  playerId?: string;
  cellX?: number;
  cellY?: number;
}>({ open: false, x: 0, y: 0, items: [] });
const effectModalOpen = ref(false);
const effectModalTarget = ref<{ kind: "player" | "enemy"; id: string } | null>(null);
const effectModalBulkTargets = ref<{ kind: "player" | "enemy"; id: string }[] | undefined>(
  undefined,
);
const tileEffectModalOpen = ref(false);
const tileEffectModalCoords = ref<{ x: number; y: number } | null>(null);
const tileEffectModalBulkCoords = ref<{ x: number; y: number }[] | undefined>(undefined);
const tileTerrainModalOpen = ref(false);
const tileTerrainModalCoords = ref<{ x: number; y: number } | null>(null);
const tileTerrainModalBulkCoords = ref<{ x: number; y: number }[] | undefined>(undefined);
const marqueeActive = ref(false);
const marqueeStart = ref<{ x: number; y: number } | null>(null);
const marqueeEnd = ref<{ x: number; y: number } | null>(null);
const viewportEl = ref<HTMLElement | null>(null);

const boardWidthPx = computed(() => {
  const s = gameState.value;
  if (!s) return 520;
  return Math.max(s.width * 40, 280);
});

const hasGameState = computed(() => !!gameState.value);
const boardWidth = computed(() => gameState.value?.width ?? 1);
const boardHeight = computed(() => gameState.value?.height ?? 1);
const boardKey = computed(() =>
  gameState.value ? `${gameState.value.width}x${gameState.value.height}` : null,
);
const contentHeightPx = computed(() =>
  boardWidthPx.value * (boardHeight.value / boardWidth.value),
);

const overlayInsetPx = ref(0);
let overlayInsetObserver: ResizeObserver | null = null;

function updateOverlayInset() {
  overlayInsetPx.value = props.overlayEl?.offsetHeight ?? 0;
}

watch(
  () => props.overlayEl,
  (el, prev) => {
    if (overlayInsetObserver) {
      overlayInsetObserver.disconnect();
      overlayInsetObserver = null;
    }
    if (prev && prev !== el) overlayInsetPx.value = 0;
    if (!el) return;
    overlayInsetObserver = new ResizeObserver(updateOverlayInset);
    overlayInsetObserver.observe(el);
    updateOverlayInset();
  },
  { flush: "post" },
);

const {
  scale,
  panX,
  panY,
  stageStyle,
  isTransformed,
  fitToView,
  onWheel,
  observeViewport,
  disconnect: disconnectViewport,
} = useBoardViewport(
  viewportEl,
  boardWidthPx,
  contentHeightPx,
  hasGameState,
  boardKey,
  overlayInsetPx,
);

watch(gameState, (s) => {
  if (!s) return;
  const selection = boardSelection.value;
  if (selection?.kind === "enemy") {
    const ids = selection.swarmMemberIds ?? [selection.id];
    if (!ids.some((id) => s.enemies.some((e) => e.id === id))) {
      clearBoardSelection();
    }
  } else if (
    selection?.kind === "player" &&
    !s.players.some((p) => p.id === selection.id)
  ) {
    clearBoardSelection();
  }
});

function finalizeDefeatedEnemy(enemyId: string) {
  send({ type: "removeEnemy", enemyId });
}

const { isEnemyDying, isEnemyDefeated, isEnemyPendingRemoval } =
  useEnemyDeathAnimations(gameState, finalizeDefeatedEnemy);
const {
  active: teleportAnimation,
  teleportingPlayerIds,
  startTeleport,
  finishTeleport,
} = usePlayerTeleportAnimation(gameState);
const {
  active: enemyMoveAnimation,
  animatingEnemyId,
  startMove: startEnemyMove,
  finishMove: finishEnemyMove,
} = useEnemyMoveAnimation(gameState);
const enemyMoveOverlayAtDest = ref(false);
const breakerPromptOpen = ref(false);
const pendingAttackAction = ref<Extract<PlayerAction, { action: "attack" }> | null>(null);
const provokePromptOpen = ref(false);
const provokeTriggers = ref<ProvokeTrigger[]>([]);
const pendingProvokeMove = ref<(() => void) | null>(null);
const swarmChipOpen = ref(false);
const swarmChipEnemyId = ref<string | null>(null);
const swarmChipTargets = ref<import("@gaem/shared").SwarmChipTarget[]>([]);
const swarmAttackModalOpen = ref(false);
const swarmAttackPending = ref<{
  enemyId: string;
  attackIndex: number;
  targetPlayerId: string;
  damage?: number;
} | null>(null);

function maybePromptSwarmChip(enemyId: string) {
  if (props.role !== "gm") return;
  const s = gameState.value;
  if (!s || !canGmMoveEnemies(s)) return;
  const enemy = s.enemies.find((e) => e.id === enemyId);
  if (!enemy || enemy.exhausted || isTowerEnemy(enemy)) return;
  if (!swarmChipPromptRequired(s, enemyId)) return;
  const group = swarmGroupForEnemy(s, enemyId)!;
  swarmChipEnemyId.value = group.canonicalId;
  swarmChipTargets.value = swarmChipEligibleTargets(s, enemyId);
  swarmChipOpen.value = true;
}

function ensureSwarmChipResolved(enemyId: string): boolean {
  const s = gameState.value;
  if (!s || !swarmChipPromptRequired(s, enemyId)) return true;
  maybePromptSwarmChip(enemyId);
  return false;
}

watch(selectedEnemyId, (id) => {
  if (id) maybePromptSwarmChip(id);
});

const breakerSethianHint = computed(() => {
  const action = pendingAttackAction.value;
  const s = gameState.value;
  const ctx = attackContext.value;
  if (!action || !s || !ctx || !isSethianWeaponName(ctx.weapon)) return undefined;
  const tiles = attackTilesForAction(action);
  const hits = swarmMembersHitByTiles(s, tiles).length;
  if (!hits) return undefined;
  return `Attack as whole: damage × ${hits} pattern square${hits === 1 ? "" : "s"} (max ${SETHIAN_DAMAGE_CAP} total).`;
});

function gateProvoke(triggers: ProvokeTrigger[], action: () => void) {
  if (!triggers.length) {
    action();
    return;
  }
  provokeTriggers.value = triggers;
  pendingProvokeMove.value = action;
  provokePromptOpen.value = true;
}

function onProvokeConfirm() {
  pendingProvokeMove.value?.();
  pendingProvokeMove.value = null;
  provokePromptOpen.value = false;
  provokeTriggers.value = [];
}

function onProvokeCancel() {
  pendingProvokeMove.value = null;
  provokePromptOpen.value = false;
  provokeTriggers.value = [];
}

function onSwarmChipConfirm(targetPlayerIds: string[], targetEnemyIds: string[]) {
  const enemyId = swarmChipEnemyId.value;
  if (!enemyId) return;
  send({
    type: "gmEnemyAction",
    action: { action: "swarmChip", enemyId, targetPlayerIds, targetEnemyIds },
  });
  swarmChipOpen.value = false;
}

function onSwarmChipClose() {
  swarmChipOpen.value = false;
}

const swarmChipEnemyName = computed(() => {
  const s = gameState.value;
  const id = swarmChipEnemyId.value;
  if (!s || !id) return "Swarm";
  return s.enemies.find((e) => e.id === id)?.name ?? "Swarm";
});

const swarmAttackModalProps = computed(() => {
  const pending = swarmAttackPending.value;
  const s = gameState.value;
  if (!pending || !s) return null;
  const player = s.players.find((p) => p.id === pending.targetPlayerId);
  const enemy = s.enemies.find((e) => e.id === pending.enemyId);
  const attackText = getEnemyListingByName(enemy?.name)?.attacks?.[pending.attackIndex] ?? "";
  const maxStrikes = player ? maxSwarmStrikesAgainstTarget(s, pending.enemyId, player) : 0;
  return {
    enemyId: pending.enemyId,
    attackIndex: pending.attackIndex,
    attackText,
    targetPlayerId: pending.targetPlayerId,
    targetPlayerName: player?.nickname ?? player?.id ?? "Player",
    maxStrikes,
    damageOverride: pending.damage,
  };
});
const teleportOverlayAtDest = ref(false);

const gridStyle = computed(() => {
  const s = gameState.value;
  if (!s) return {};
  return {
    gridTemplateColumns: `repeat(${s.width}, minmax(0, 1fr))`,
    gridTemplateRows: `repeat(${s.height}, minmax(0, 1fr))`,
    width: `${boardWidthPx.value}px`,
  };
});

const cellsCache = shallowRef<{ x: number; y: number; key: string }[]>([]);
const cellsCacheKey = ref<string | null>(null);

const cells = computed(() => {
  const s = gameState.value;
  if (!s) return [] as { x: number; y: number; key: string }[];
  const key = `${s.width}x${s.height}`;
  if (cellsCacheKey.value === key && cellsCache.value.length > 0) {
    return cellsCache.value;
  }
  const out: { x: number; y: number; key: string }[] = [];
  for (let y = 0; y < s.height; y++) {
    for (let x = 0; x < s.width; x++) {
      out.push({ x, y, key: boardCellKey(x, y) });
    }
  }
  // Intentional memoization cache: only rebuilt when the board dimensions key
  // changes, avoiding reallocating the cell list on every unrelated state tick.
  // eslint-disable-next-line vue/no-side-effects-in-computed-properties
  cellsCache.value = out;
  // eslint-disable-next-line vue/no-side-effects-in-computed-properties
  cellsCacheKey.value = key;
  return out;
});

const boardAspectRatio = computed(() => {
  const s = gameState.value;
  if (!s) return "1 / 1";
  return `${s.width} / ${s.height}`;
});

const patternPreviewActive = computed(
  () => dataCategory.value === "patterns" && !!selectedPatternId.value,
);

const patternOrigin = computed(() => {
  if (!hoveredKey.value) return null;
  const [x, y] = hoveredKey.value.split("-").map(Number);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
});

const patternPrimaryKeys = computed(() => {
  if (!patternPreviewActive.value || !gameState.value) return new Set<string>();

  if (isDrawablePattern.value) {
    if (drawnTiles.value.length === 0) return new Set<string>();
    return coordsToKeySet(drawnTiles.value);
  }

  const origin = patternOrigin.value;
  if (!origin) return new Set<string>();

  return coordsToKeySet(
    fixedPatternTilesInBounds(
      selectedPatternId.value!,
      origin,
      patternSize.value,
      patternDirection.value,
      gameState.value.width,
      gameState.value.height,
      {
        ringGap:
          selectedPatternId.value === "ring" && modifierValues.value.range > 0
            ? modifierValues.value.range
            : (selectedPattern.value?.defaultRange ?? 1),
        lopsidedExtra: wallLopsidedExtra.value,
        modifiers: modifierValues.value,
      },
    ),
  );
});

const isHealAttackSpecActive = computed(() => {
  const ctx = attackContext.value;
  return ctx ? isHealAttackSpec(ctx.spec) : false;
});

const rezTargetKeys = computed(() => {
  if (boardActionMode.value !== "rez") return new Set<string>();
  const me = yourPlayer.value;
  const s = gameState.value;
  if (!me || !s) return new Set<string>();
  const keys = new Set<string>();
  for (const player of s.players) {
    if (player.id === me.id) continue;
    if ((player.hp ?? 0) > 0) continue;
    if (Math.abs(player.x - me.x) + Math.abs(player.y - me.y) !== 1) continue;
    keys.add(coordKey(player.x, player.y));
  }
  return keys;
});

const anchoredPlacementPreview = computed(() => {
  if (!isWeaponAttackMode.value) return null;
  const ctx = attackContext.value;
  const s = gameState.value;
  if (!ctx || !s || !usesAnchoredPatternPlacement(ctx.spec)) return null;
  const anchor = attackAimed.value ? attackAnchor.value : previewHoverCell.value;
  if (!anchor) return null;
  const user = ctx.origin ?? { x: ctx.me.x, y: ctx.me.y };
  return evaluateAnchoredPatternPlacement(
    user,
    anchor,
    ctx.spec,
    attackDirection.value,
    s,
  );
});

const omnistrikePlacementPreview = computed(() => {
  const step = omnistrikeStep.value;
  if (boardActionMode.value !== "omnistrike" || step === "selectBombs" || step === "confirm") {
    return null;
  }
  const ctx = omnistrikeContext.value;
  const s = gameState.value;
  if (!ctx || !s) return null;
  const anchor = previewHoverCell.value;
  if (!anchor) return null;

  if (step === "placeFirst") {
    return evaluateOmnistrikePlacement(
      ctx.me,
      anchor,
      ctx.bombA,
      attackDirection.value,
      s,
      ctx.combinedSpan,
    );
  }

  const firstAnchor = omnistrikeAnchors.value[0];
  if (!firstAnchor) return null;
  const firstTiles = collectBombPatternTiles(s, firstAnchor, ctx.bombA, attackDirection.value);
  return evaluateOmnistrikePlacement(
    ctx.me,
    anchor,
    ctx.bombB,
    attackDirection.value,
    s,
    ctx.combinedSpan,
    firstTiles,
  );
});

const omnistrikeLockedFirstKeys = computed(() => {
  const ctx = omnistrikeContext.value;
  const s = gameState.value;
  const anchor = omnistrikeAnchors.value[0];
  if (
    boardActionMode.value !== "omnistrike" ||
    !ctx ||
    !s ||
    !anchor ||
    omnistrikeStep.value === "selectBombs" ||
    omnistrikeStep.value === "placeFirst"
  ) {
    return new Set<string>();
  }
  return coordsToKeySet(collectBombPatternTiles(s, anchor, ctx.bombA, attackDirection.value));
});

const omnistrikePrimaryKeys = computed(() => {
  if (boardActionMode.value !== "omnistrike" || omnistrikeStep.value !== "confirm") {
    return new Set<string>();
  }
  const ctx = omnistrikeContext.value;
  const s = gameState.value;
  const anchorA = omnistrikeAnchors.value[0];
  const anchorB = omnistrikeAnchors.value[1];
  if (!ctx || !s || !anchorA || !anchorB) return new Set<string>();
  const tilesA = collectBombPatternTiles(s, anchorA, ctx.bombA, attackDirection.value);
  const tilesB = collectBombPatternTiles(s, anchorB, ctx.bombB, attackDirection.value);
  return coordsToKeySet(unionPatternTiles(tilesA, tilesB));
});

const omnistrikeSecondaryKeys = computed(() => {
  if (boardActionMode.value !== "omnistrike") return new Set<string>();
  const step = omnistrikeStep.value;
  if (step === "confirm") return new Set<string>();
  if (step === "selectBombs") return new Set<string>();

  const preview = omnistrikePlacementPreview.value;
  if (preview && (step === "placeFirst" || step === "placeSecond")) {
    const keys = coordsToKeySet(preview.patternTiles);
    for (const key of omnistrikeLockedFirstKeys.value) keys.add(key);
    return keys;
  }
  return omnistrikeLockedFirstKeys.value;
});

const omnistrikeInvalidKeys = computed(() => {
  if (boardActionMode.value !== "omnistrike") return new Set<string>();
  const step = omnistrikeStep.value;
  if (step !== "placeFirst" && step !== "placeSecond") return new Set<string>();
  const preview = omnistrikePlacementPreview.value;
  if (!preview) return new Set<string>();
  if (preview.tooFar) return coordsToKeySet(preview.patternTiles);
  if (!preview.adjacentToOther && step === "placeSecond") {
    return coordsToKeySet(preview.patternTiles);
  }
  return preview.tooCloseKeys;
});

const warhookPrimaryKeys = computed(() => {
  if (boardActionMode.value !== "warhook") return new Set<string>();
  const me = yourPlayer.value;
  const s = gameState.value;
  if (!me || !s) return new Set<string>();
  if (warhookStep.value === "selectLanding" && warhookTarget.value) {
    return new Set([coordKey(warhookTarget.value.x, warhookTarget.value.y)]);
  }
  return warhookValidTargetKeys(s, me);
});

const warhookSecondaryKeys = computed(() => {
  if (boardActionMode.value !== "warhook") return new Set<string>();
  const me = yourPlayer.value;
  const s = gameState.value;
  if (!me || !s) return new Set<string>();
  if (warhookStep.value === "selectLanding") {
    return coordsToKeySet(warhookLandingOptions.value);
  }
  return warhookRangeKeys(s, me);
});

const armorPlaceTowerKeys = computed(() => {
  if (boardActionMode.value !== "armorPlaceTower") return new Set<string>();
  const me = yourPlayer.value;
  const s = gameState.value;
  if (!me || !s) return new Set<string>();
  const armor = getArmorByName(me.armor ?? "");
  const structured = armor?.armorActionStructured;
  if (!structured || structured.kind !== "place_tower") return new Set<string>();
  return yadathanPlacementKeys(s, me, structured.range);
});

const classAbilityPrimaryKeys = computed(() => {
  const keys = new Set<string>();
  const m = boardActionMode.value;
  const me = yourPlayer.value;
  const s = gameState.value;
  if (!me || !s) return keys;
  if (m === "kopisMark" || m === "hephaestusSynesis") {
    for (const e of s.enemies) {
      const dist = Math.abs(e.x - me.x) + Math.abs(e.y - me.y);
      const inRange = m === "hephaestusSynesis" ? dist <= 1 : true;
      if (inRange) keys.add(coordKey(e.x, e.y));
    }
  }
  if (m === "varunastraBorrow" && !borrowAllyId.value) {
    for (const p of s.players) {
      if (p.id !== me.id && p.weapon) keys.add(coordKey(p.x, p.y));
    }
  }
  if (m === "hephaestusRestore") {
    for (const p of s.players) {
      if (p.id !== me.id && Math.abs(p.x - me.x) + Math.abs(p.y - me.y) === 1) {
        keys.add(coordKey(p.x, p.y));
      }
    }
  }
  return keys;
});

const classAbilitySecondaryKeys = computed(() => {
  const keys = new Set<string>();
  const m = boardActionMode.value;
  const me = yourPlayer.value;
  const s = gameState.value;
  if (!me || !s) return keys;
  if (m === "sharurAttractor" || m === "harpeTrap") {
    for (const tile of s.tiles) {
      const dist = Math.abs(tile.x - me.x) + Math.abs(tile.y - me.y);
      if (m === "sharurAttractor" && dist <= 4 && dist >= 1) keys.add(coordKey(tile.x, tile.y));
      if (m === "harpeTrap") {
        const dx = Math.sign(tile.x - me.x);
        const dy = Math.sign(tile.y - me.y);
        if (dx === 0 && dy === 0) continue;
        if (dx !== 0 && dy !== 0) continue;
        const d = Math.abs(tile.x - me.x) + Math.abs(tile.y - me.y);
        if (d >= 1 && d <= 6) keys.add(coordKey(tile.x, tile.y));
      }
    }
  }
  return keys;
});

const sharurAttractorInvalidKeys = computed(() => {
  if (boardActionMode.value !== "sharurAttractor") return new Set<string>();
  const me = yourPlayer.value;
  const s = gameState.value;
  if (!me || !s) return new Set<string>();
  const keys = new Set<string>();
  for (const a of s.combat?.attractors ?? []) {
    const dist = Math.abs(a.x - me.x) + Math.abs(a.y - me.y);
    if (dist <= 4 && dist >= 1) keys.add(coordKey(a.x, a.y));
  }
  return keys;
});

const boardTokenKeys = computed(() => {
  const keys = new Set<string>();
  for (const t of gameState.value?.combat?.boardTokens ?? []) {
    keys.add(coordKey(t.x, t.y));
  }
  return keys;
});

const trapLineKeys = computed(() => {
  const keys = new Set<string>();
  for (const trap of gameState.value?.combat?.thrownTraps ?? []) {
    for (const tile of tilesOnCardinalLine(trap.originX, trap.originY, trap.x, trap.y)) {
      keys.add(coordKey(tile.x, tile.y));
    }
  }
  return keys;
});

const trapWeaponKeys = computed(() => {
  const keys = new Set<string>();
  for (const trap of gameState.value?.combat?.thrownTraps ?? []) {
    keys.add(coordKey(trap.x, trap.y));
  }
  return keys;
});

const attractorCenterKeys = computed(() => {
  const keys = new Map<string, { void: boolean }>();
  for (const a of gameState.value?.combat?.attractors ?? []) {
    keys.set(coordKey(a.x, a.y), { void: a.void });
  }
  return keys;
});

const attractorZoneOnlyKeys = computed(() => {
  const keys = new Set<string>();
  for (const a of gameState.value?.combat?.attractors ?? []) {
    for (const tile of tilesInAttractorZone(a)) {
      const key = coordKey(tile.x, tile.y);
      if (!attractorCenterKeys.value.has(key)) keys.add(key);
    }
  }
  return keys;
});

const kopisMarkedEnemyIds = computed(() => {
  const marks = gameState.value?.combat?.kopisMarks ?? {};
  return new Set(Object.values(marks));
});

const towerTeleportPrimaryKeys = computed(() => {
  if (boardActionMode.value !== "towerTeleport") return new Set<string>();
  const id = yourPlayerId.value;
  const s = gameState.value;
  if (!id || !s) return new Set<string>();
  if (towerTeleportStep.value === "selectKeraunoTarget" && towerTeleportLanding.value) {
    const adjacent = keraunoAdjacentEnemyIds(s, towerTeleportLanding.value.x, towerTeleportLanding.value.y);
    const keys = new Set<string>();
    for (const enemyId of adjacent) {
      const enemy = s.enemies.find((e) => e.id === enemyId);
      if (enemy) keys.add(coordKey(enemy.x, enemy.y));
    }
    return keys;
  }
  return new Set<string>();
});

const towerTeleportSecondaryKeys = computed(() => {
  if (boardActionMode.value !== "towerTeleport") return new Set<string>();
  const id = yourPlayerId.value;
  const s = gameState.value;
  if (!id || !s || towerTeleportStep.value === "selectKeraunoTarget") return new Set<string>();
  return towerTeleportLandingKeys(s, id);
});

const assistedLaunchPreview = computed(() => {
  if (boardActionMode.value !== "assistedLaunch") return null;
  const id = yourPlayerId.value;
  const s = gameState.value;
  const anchor = assistedLaunchAnchor.value;
  if (!id || !s || !anchor) return null;
  return computeAssistedLaunch(s, id, anchor.x, anchor.y);
});

const assistedLaunchAnchorKeys = computed(() => {
  if (boardActionMode.value !== "assistedLaunch" || assistedLaunchStep.value !== "selectAnchor") {
    return new Set<string>();
  }
  const id = yourPlayerId.value;
  const s = gameState.value;
  if (!id || !s) return new Set<string>();
  return coordsToKeySet(assistedLaunchAnchors(s, id).map((a) => ({ x: a.x, y: a.y })));
});

const assistedLaunchPathKeys = computed(() => {
  const preview = assistedLaunchPreview.value;
  if (!preview || assistedLaunchStep.value !== "confirm") return new Set<string>();
  const keys = new Set<string>();
  for (const step of preview.path.slice(0, -1)) {
    keys.add(coordKey(step.x, step.y));
  }
  return keys;
});

const assistedLaunchLandingKeys = computed(() => {
  const preview = assistedLaunchPreview.value;
  if (!preview || assistedLaunchStep.value !== "confirm") return new Set<string>();
  return new Set([coordKey(preview.landing.x, preview.landing.y)]);
});

const assistedLaunchLineKeys = computed(() => {
  const preview = assistedLaunchPreview.value;
  const me = yourPlayer.value;
  if (!preview || !me || assistedLaunchStep.value !== "confirm") return new Set<string>();
  const startX = me.turnStartX ?? me.x;
  const startY = me.turnStartY ?? me.y;
  const keys = new Set<string>();
  for (const tile of tilesOnCardinalLine(startX, startY, preview.landing.x, preview.landing.y)) {
    keys.add(coordKey(tile.x, tile.y));
  }
  return keys;
});

const kataptyPickKeys = computed(() => {
  if (boardActionMode.value !== "kataptyPick") return new Set<string>();
  const id = yourPlayerId.value;
  const s = gameState.value;
  if (!id || !s) return new Set<string>();
  return kataptyTargetKeys(s, id);
});

const kataptySelectedCoordKeys = computed(() => {
  const keys = new Set<string>();
  if (boardActionMode.value !== "kataptyPick") return keys;
  const s = gameState.value;
  if (!s) return keys;
  for (const id of kataptyTargetIds.value) {
    const enemy = s.enemies.find((e) => e.id === id);
    if (enemy) keys.add(coordKey(enemy.x, enemy.y));
  }
  return keys;
});

const reversalLineKeys = computed(() => {
  const r = pendingReaction.value;
  const me = yourPlayer.value;
  const s = gameState.value;
  const heal = new Set<string>();
  const damage = new Set<string>();
  if (!r || !me || !s) return { heal, damage };
  const tower = getPlayerTower(s, me.id);
  if (!tower) return { heal, damage };
  const iatros = tower.name === TOWER_IATROS;
  const targetSet = iatros ? heal : damage;
  const lines: { from: { x: number; y: number }; to: { x: number; y: number } }[] = [
    { from: { x: me.x, y: me.y }, to: { x: tower.x, y: tower.y } },
  ];
  for (const allyId of reversalExtraAllyIds.value) {
    const ally = s.players.find((p) => p.id === allyId);
    if (ally) lines.push({ from: { x: me.x, y: me.y }, to: { x: ally.x, y: ally.y } });
  }
  for (const line of lines) {
    for (const tile of tilesOnSegment(line.from, line.to)) {
      targetSet.add(coordKey(tile.x, tile.y));
    }
  }
  return { heal, damage };
});

const combatAttackInvalidKeys = computed(() => {
  if (attackAimed.value) return new Set<string>();
  const preview = anchoredPlacementPreview.value;
  if (!preview) return new Set<string>();
  if (preview.tooFar) return coordsToKeySet(preview.patternTiles);
  return preview.tooCloseKeys;
});

const isWeaponAttackMode = computed(() => {
  const m = boardActionMode.value;
  if (m === "attack") return true;
  return m === "equipmentForceProjection" && forceProjectionStep.value === "attack";
});

const attackContext = computed(() => {
  const me = yourPlayer.value;
  const mode = boardActionMode.value;
  if (mode === "equipmentForceProjection" && forceProjectionStep.value === "attack" && forceProjectionOrigin.value && me?.weapon) {
    const spec = resolveCombatAttackSpec(me, me.weapon);
    if (!spec) return null;
    return {
      me,
      weapon: me.weapon,
      spec,
      origin: forceProjectionOrigin.value,
      equipmentUse: true as const,
    };
  }
  if (mode !== "attack" || !me?.weapon) return null;
  const spec = resolveCombatAttackSpec(me, me.weapon);
  if (!spec) return null;
  return { me, weapon: me.weapon, spec, origin: { x: me.x, y: me.y } };
});

const borrowContext = computed(() => {
  const me = yourPlayer.value;
  const s = gameState.value;
  const allyId = borrowAllyId.value;
  if (boardActionMode.value !== "varunastraBorrow" || !allyId || !me || !s) return null;
  const ally = s.players.find((p) => p.id === allyId);
  if (!ally?.weapon) return null;
  const spec = getWeaponAttackSpec(ally.weapon);
  if (!spec) return null;
  return { me, weapon: ally.weapon, spec };
});

const equipmentCorridorContext = computed(() => {
  const me = yourPlayer.value;
  if (boardActionMode.value !== "equipmentCorridor" || !me?.equipment) return null;
  if (!isHylicAnnihilationCorridor(me.equipment)) return null;
  const spec = getEquipmentAttackSpec(me.equipment);
  if (!spec) return null;
  return { me, spec };
});

const equipmentCorridorPlacementPreview = computed(() => {
  if (boardActionMode.value !== "equipmentCorridor") return null;
  const ctx = equipmentCorridorContext.value;
  const s = gameState.value;
  if (!ctx || !s) return null;
  const anchor = attackAimed.value ? attackAnchor.value : previewHoverCell.value;
  if (!anchor) return null;
  const patternTiles = collectEquipmentPatternTiles(
    s,
    anchor,
    ctx.me.equipment!,
    attackDirection.value,
  );
  const tileCount = ctx.spec.tiles?.length ?? 0;
  return { patternTiles, valid: patternTiles.length >= tileCount };
});

const equipmentCorridorPrimaryKeys = computed(() => {
  if (boardActionMode.value !== "equipmentCorridor" || !attackAimed.value) return new Set<string>();
  const preview = equipmentCorridorPlacementPreview.value;
  if (!preview?.valid) return new Set<string>();
  return coordsToKeySet(preview.patternTiles);
});

const equipmentCorridorSecondaryKeys = computed(() => {
  if (boardActionMode.value !== "equipmentCorridor" || attackAimed.value) return new Set<string>();
  const preview = equipmentCorridorPlacementPreview.value;
  if (!preview?.valid) return new Set<string>();
  return coordsToKeySet(preview.patternTiles);
});

const equipmentCorridorInvalidKeys = computed(() => {
  if (boardActionMode.value !== "equipmentCorridor" || attackAimed.value) return new Set<string>();
  const preview = equipmentCorridorPlacementPreview.value;
  if (!preview || preview.valid) return new Set<string>();
  return coordsToKeySet(preview.patternTiles);
});

const equipmentCoverRangeKeys = computed(() => {
  if (boardActionMode.value !== "equipmentCover") return new Set<string>();
  const me = yourPlayer.value;
  const s = gameState.value;
  if (!me || !s) return new Set<string>();
  return rejectionFieldTileKeys(s, me);
});

const equipmentCoverSelectedKeys = computed(() => coordsToKeySet(equipmentCoverTiles.value));

const equipmentCoverSecondaryKeys = computed(() => {
  if (boardActionMode.value !== "equipmentCover") return new Set<string>();
  const range = equipmentCoverRangeKeys.value;
  const selected = equipmentCoverSelectedKeys.value;
  const keys = new Set<string>();
  for (const key of range) {
    if (!selected.has(key)) keys.add(key);
  }
  return keys;
});

const equipmentForceProjectionSquareKeys = computed(() => {
  if (boardActionMode.value !== "equipmentForceProjection" || forceProjectionStep.value !== "selectSquare") {
    return new Set<string>();
  }
  const me = yourPlayer.value;
  const s = gameState.value;
  const occ = occupancy.value;
  if (!me || !s || !occ) return new Set<string>();
  return forceProjectionTileKeys(s, me, occ);
});

const redirectSourceKeys = computed(() => {
  if (boardActionMode.value !== "equipmentRedirect" || redirectStep.value !== "selectSource") {
    return new Set<string>();
  }
  const me = yourPlayer.value;
  const s = gameState.value;
  if (!me || !s) return new Set<string>();
  return redirectionSourceTileKeys(s, me);
});

const redirectTargetKeys = computed(() => {
  if (boardActionMode.value !== "equipmentRedirect" || redirectStep.value !== "selectTarget") {
    return new Set<string>();
  }
  const s = gameState.value;
  const sourceId = redirectSourceEnemyId.value;
  const attackIndex = redirectAttackIndex.value;
  if (!s || !sourceId || attackIndex == null) return new Set<string>();
  const source = s.enemies.find((e) => e.id === sourceId);
  if (!source?.name) return new Set<string>();
  const attacks = getEnemyListingByName(source.name)?.attacks ?? [];
  const parsed = parseEnemyAttackString(attacks[attackIndex] ?? "");
  const ids = enemyDirectAttackTargetEnemyIds(s, sourceId, parsed);
  const keys = new Set<string>();
  for (const id of ids) {
    const enemy = s.enemies.find((e) => e.id === id);
    if (enemy) keys.add(coordKey(enemy.x, enemy.y));
  }
  return keys;
});

const redirectPatternPrimaryKeys = computed(() => {
  if (boardActionMode.value !== "equipmentRedirect" || redirectStep.value !== "confirmPattern") {
    return new Set<string>();
  }
  const s = gameState.value;
  const sourceId = redirectSourceEnemyId.value;
  const attackIndex = redirectAttackIndex.value;
  if (!s || !sourceId || attackIndex == null) return new Set<string>();
  const tiles = previewEnemyAttack(s, sourceId, attackIndex, attackDirection.value);
  return coordsToKeySet(tiles);
});

const borrowAnchoredPlacementPreview = computed(() => {
  if (boardActionMode.value !== "varunastraBorrow" || !borrowAllyId.value) return null;
  const ctx = borrowContext.value;
  const s = gameState.value;
  if (!ctx || !s || !usesAnchoredPatternPlacement(ctx.spec)) return null;
  const anchor = attackAimed.value ? attackAnchor.value : previewHoverCell.value;
  if (!anchor) return null;
  return evaluateAnchoredPatternPlacement(
    ctx.me,
    anchor,
    ctx.spec,
    attackDirection.value,
    s,
  );
});

const omnistrikeContext = computed(() => {
  const me = yourPlayer.value;
  if (boardActionMode.value !== "omnistrike" || !me?.weapon) return null;
  const [indexA, indexB] = omnistrikeBombs.value;
  if (indexA == null || indexB == null) return null;
  const bombA = resolveBombAttackSpec(me.weapon, indexA);
  const bombB = resolveBombAttackSpec(me.weapon, indexB);
  if (!bombA || !bombB) return null;
  const combinedSpan = computeOmnistrikeRangeSpan(bombA, bombB);
  if (!combinedSpan) return null;
  return { me, weapon: me.weapon, bombA, bombB, combinedSpan, indexA, indexB };
});

const attackPreviewByDirection = computed(() => {
  const ctx = attackContext.value;
  const s = gameState.value;
  if (!ctx || !s) {
    return new Map<PatternDirection, Set<string>>();
  }
  if (isRangeTargetAttack(ctx.spec) || usesAnchoredPatternPlacement(ctx.spec)) {
    return new Map<PatternDirection, Set<string>>();
  }
  const origin = ctx.origin ?? { x: ctx.me.x, y: ctx.me.y };
  const map = new Map<PatternDirection, Set<string>>();
  for (const direction of PATTERN_DIRECTIONS) {
    const tiles = collectAttackTiles(s, origin, ctx.spec, direction);
    map.set(direction, coordsToKeySet(tiles));
  }
  return map;
});

const borrowAttackPreviewByDirection = computed(() => {
  const ctx = borrowContext.value;
  const s = gameState.value;
  if (!ctx || !s) return new Map<PatternDirection, Set<string>>();
  if (isRangeTargetAttack(ctx.spec) || usesAnchoredPatternPlacement(ctx.spec)) {
    return new Map<PatternDirection, Set<string>>();
  }
  const map = new Map<PatternDirection, Set<string>>();
  for (const direction of PATTERN_DIRECTIONS) {
    const tiles = collectAttackTiles(s, { x: ctx.me.x, y: ctx.me.y }, ctx.spec, direction);
    map.set(direction, coordsToKeySet(tiles));
  }
  return map;
});

const borrowCombatPrimaryKeys = computed(() => {
  if (boardActionMode.value !== "varunastraBorrow" || !borrowAllyId.value) return new Set<string>();
  const ctx = borrowContext.value;
  const s = gameState.value;
  if (!ctx || !s) return new Set<string>();
  if (isRangeTargetAttack(ctx.spec)) return new Set<string>();

  if (usesAnchoredPatternPlacement(ctx.spec)) {
    if (!attackAimed.value) return new Set<string>();
    const preview = borrowAnchoredPlacementPreview.value;
    if (!preview?.valid) return new Set<string>();
    return coordsToKeySet(preview.patternTiles);
  }

  if (!attackAimed.value) return new Set<string>();
  return borrowAttackPreviewByDirection.value.get(attackDirection.value) ?? new Set<string>();
});

const borrowCombatSecondaryKeys = computed(() => {
  const ctx = borrowContext.value;
  const s = gameState.value;
  if (!ctx || !s) return new Set<string>();

  if (isRangeTargetAttack(ctx.spec)) {
    return rangeAttackTileKeys(s, ctx.me, rangeTargetDistance(ctx.spec));
  }

  if (usesAnchoredPatternPlacement(ctx.spec)) {
    if (attackAimed.value) return new Set<string>();
    const preview = borrowAnchoredPlacementPreview.value;
    if (!preview) return new Set<string>();
    return coordsToKeySet(preview.patternTiles);
  }

  if (isRangedPatternAttack(ctx.spec)) {
    if (ctx.spec.rangeSpan) {
      return rangedPatternPlacementKeys(s, ctx.me, ctx.spec.rangeSpan);
    }
    return rangeAttackTileKeys(s, ctx.me, ctx.spec.range!);
  }

  const keys = new Set<string>();
  for (const [direction, tileKeys] of borrowAttackPreviewByDirection.value) {
    if (attackAimed.value && direction === attackDirection.value) continue;
    for (const key of tileKeys) keys.add(key);
  }
  return keys;
});

const combatAttackPrimaryKeys = computed(() => {
  if (!isWeaponAttackMode.value) return new Set<string>();
  const ctx = attackContext.value;
  const s = gameState.value;
  if (!ctx || !s) return new Set<string>();
  if (isRangeTargetAttack(ctx.spec)) return new Set<string>();

  if (usesAnchoredPatternPlacement(ctx.spec)) {
    if (!attackAimed.value) return new Set<string>();
    const preview = anchoredPlacementPreview.value;
    if (!preview?.valid) return new Set<string>();
    return coordsToKeySet(preview.patternTiles);
  }

  if (!attackAimed.value) return new Set<string>();
  return attackPreviewByDirection.value.get(attackDirection.value) ?? new Set<string>();
});

const combatAttackSecondaryKeys = computed(() => {
  const ctx = attackContext.value;
  const s = gameState.value;
  if (!ctx || !s || !isWeaponAttackMode.value) {
    return new Set<string>();
  }

  const origin = ctx.origin ?? { x: ctx.me.x, y: ctx.me.y };

  if (isRangeTargetAttack(ctx.spec)) {
    return rangeAttackTileKeys(
      s,
      origin,
      rangeTargetDistance(ctx.spec),
    );
  }

  if (usesAnchoredPatternPlacement(ctx.spec)) {
    if (attackAimed.value) return new Set<string>();
    const preview = anchoredPlacementPreview.value;
    if (!preview) return new Set<string>();
    return coordsToKeySet(preview.patternTiles);
  }

  if (isRangedPatternAttack(ctx.spec)) {
    if (ctx.spec.rangeSpan) {
      return rangedPatternPlacementKeys(s, origin, ctx.spec.rangeSpan);
    }
    return rangeAttackTileKeys(s, origin, ctx.spec.range!);
  }

  const keys = new Set<string>();
  for (const [direction, tileKeys] of attackPreviewByDirection.value) {
    if (attackAimed.value && direction === attackDirection.value) continue;
    for (const key of tileKeys) keys.add(key);
  }
  return keys;
});

const combatAttackSelectedKeys = computed(() => {
  const s = gameState.value;
  if (!s || rangeAttackTargetIds.value.length === 0) return new Set<string>();
  const keys = new Set<string>();
  for (const id of rangeAttackTargetIds.value) {
    const enemy = s.enemies.find((e) => e.id === id);
    if (enemy) keys.add(coordKey(enemy.x, enemy.y));
  }
  return keys;
});

const patternRecoilKeys = computed(() => {
  if (!patternPreviewActive.value || !gameState.value) return new Set<string>();
  if (modifierValues.value.recoil <= 0) return new Set<string>();
  if (!selectedPattern.value?.directional) return new Set<string>();

  const origin = patternOrigin.value;
  if (!origin) return new Set<string>();

  return coordsToKeySet(
    recoilTilesInBounds(
      origin,
      modifierValues.value.recoil,
      patternDirection.value,
      gameState.value.width,
      gameState.value.height,
    ),
  );
});

const patternSecondaryKeys = computed(() => {
  if (!patternPreviewActive.value || !isDrawablePattern.value || !gameState.value) {
    return new Set<string>();
  }
  if (drawnTiles.value.length === 0 || drawnTiles.value.length >= patternSize.value) {
    return new Set<string>();
  }
  return coordsToKeySet(
    drawableExpansionOptions(
      drawnTiles.value,
      patternSize.value,
      gameState.value.width,
      gameState.value.height,
    ),
  );
});

function terrainClass(tile: MapTile | undefined): string | null {
  if (!tile) return null;
  if (tile.terrain.includes("impassable")) return "impassable";
  if (tile.terrain.includes("obstacle")) return "obstacle";
  if (tile.terrain.includes("void")) return "void";
  return null;
}

function hueFromId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % 360;
}

const gmEnemyMoveTargetKeys = computed(() => {
  const keys = new Set<string>();
  const s = gameState.value;
  const id = selectedEnemyId.value;
  if (!s || !id || !canGmMoveEnemies(s)) return keys;
  const enemy = s.enemies.find((e) => e.id === id);
  if (!enemy || enemy.exhausted || isTowerEnemy(enemy)) return keys;

  const group = swarmGroupForEnemy(s, id);
  const occ = occupancy.value ?? undefined;

  if (group && isSoloSwarmMemberSelected.value) {
    if (!isSandboxMode(s) && getSwarmMovementRemaining(s, group.memberIds) < 1) return keys;
    for (const tile of swarmFringeTiles(s, group.memberIds, occ)) {
      if (canSwarmMemberReachDest(s, id, tile.x, tile.y, occ)) {
        keys.add(boardCellKey(tile.x, tile.y));
      }
    }
    const deltas = [
      { dx: 0, dy: -1 },
      { dx: 0, dy: 1 },
      { dx: -1, dy: 0 },
      { dx: 1, dy: 0 },
    ];
    for (const { dx, dy } of deltas) {
      const destX = enemy.x + dx;
      const destY = enemy.y + dy;
      if (canSwarmMemberReachDest(s, id, destX, destY, occ)) {
        keys.add(boardCellKey(destX, destY));
      }
    }
    return keys;
  }

  if (group) {
    if (!isSandboxMode(s) && getSwarmMovementRemaining(s, group.memberIds) < 1) return keys;
    for (const tile of swarmFringeTiles(s, group.memberIds, occupancy.value ?? undefined)) {
      if (pickSwarmMoveMember(s, group.memberIds, tile.x, tile.y)) {
        keys.add(boardCellKey(tile.x, tile.y));
      }
    }
    return keys;
  }

  if (!isSandboxMode(s)) {
    ensureEnemyMovement(enemy);
    if ((enemy.movementRemaining ?? 0) < 1) return keys;
  }
  const scale = getEnemyScale(enemy);
  const deltas = [
    { dx: 0, dy: -1 },
    { dx: 0, dy: 1 },
    { dx: -1, dy: 0 },
    { dx: 1, dy: 0 },
  ];
  for (const { dx, dy } of deltas) {
    const anchorX = enemy.x + dx;
    const anchorY = enemy.y + dy;
    if (validateEnemyFootprint(s, anchorX, anchorY, scale, id, occupancy.value ?? undefined) !== null) {
      continue;
    }
    for (const tile of enemyFootprintTiles(anchorX, anchorY, scale)) {
      keys.add(boardCellKey(tile.x, tile.y));
    }
  }
  return keys;
});

const gmSpawnableKeys = computed(() => {
  const keys = new Set<string>();
  const s = gameState.value;
  const spawnName = selectedSpawnEnemyName.value;
  if (!s || !spawnName) return keys;
  const scale = getEnemyScaleByName(spawnName);
  for (const c of cells.value) {
    if (validateEnemyFootprint(s, c.x, c.y, scale, undefined, occupancy.value) === null) {
      keys.add(c.key);
    }
  }
  return keys;
});

const gmEnemyAttackTargetKeys = computed(() => {
  const keys = new Set<string>();
  if (boardActionMode.value !== "gmEnemyAttack" || !gmEnemyAttack.value) return keys;
  const s = gameState.value;
  const occ = occupancy.value;
  if (!s || !occ) return keys;
  const { enemyId, attackIndex } = gmEnemyAttack.value;
  const enemy = s.enemies.find((e) => e.id === enemyId);
  const attackText = getEnemyListingByName(enemy?.name)?.attacks?.[attackIndex] ?? "";
  const parsed = parseEnemyAttackString(attackText);
  for (const playerId of enemyDirectAttackTargetPlayerIds(s, enemyId, parsed, occ)) {
    const player = s.players.find((p) => p.id === playerId);
    if (player) keys.add(coordKey(player.x, player.y));
  }
  return keys;
});

const occupancy = computed(() =>
  gameState.value ? buildBoardOccupancy(gameState.value) : null,
);

const yourPlayer = computed(() => {
  const s = gameState.value;
  const id = yourPlayerId.value;
  if (!s || !id) return undefined;
  return s.players.find((p) => p.id === id);
});

let sprintModePrev: typeof boardActionMode.value = null;
watch(boardActionMode, (mode) => {
  if (mode === "sprint" && sprintModePrev !== "sprint") {
    sendPlayerAction({ action: "sprint" });
  } else if (sprintModePrev === "sprint" && mode !== "sprint") {
    const remaining = yourPlayer.value?.actionBudget?.sprintRemaining ?? 0;
    if (remaining > 0) sendPlayerAction({ action: "sprintCancel" });
  }
  sprintModePrev = mode;
});

watch(
  () => yourPlayer.value?.actionBudget?.sprintRemaining ?? 0,
  (remaining, prev) => {
    if (boardActionMode.value === "sprint" && prev > 0 && remaining <= 0) {
      clearBoardActionMode();
    }
  },
);

const cellStateByKey = computed(() => {
  const map = new Map<string, CellRenderState>();
  const s = gameState.value;
  const occ = occupancy.value;
  if (!s || !occ) return map;

  const swarmGroups = buildSwarmGroups(s);

  const playerCanMove =
    props.role === "player" &&
    !!yourPlayerId.value &&
    canPlayerMove(s, yourPlayerId.value);
  const isDeployment = s.roundPhase === "deployment";
  const sandbox = isSandboxMode(s);
  const inMoveMode = boardActionMode.value === "move";
  const inSprintMode = boardActionMode.value === "sprint";
  const inCombatActionMode =
    boardActionMode.value != null && !inMoveMode && !inSprintMode;
  const onPlayerTurn =
    s.roundPhase === "playerTurn" &&
    s.turn?.role === "player" &&
    s.turn.playerId === yourPlayerId.value;
  const showStepMoveHighlights =
    activePlayerSelected.value &&
    !inCombatActionMode &&
    (sandbox || onPlayerTurn || inMoveMode || inSprintMode);
  const me = yourPlayer.value;
  const movementRemaining = me?.actionBudget?.movementRemaining ?? 0;
  const sprintRemaining = me?.actionBudget?.sprintRemaining ?? 0;

  const portraitBgCache = new Map<string, string | null>();

  for (const c of cells.value) {
    const ck = coordKey(c.x, c.y);
    const tile = tileAt(s.tiles, c.x, c.y);
    const player = occ.playerByKey.get(ck);
    const enemy = occ.enemyByKey.get(ck);
    const enemyAnchor = occ.enemyAnchorByKey.get(ck);
    const objects = occ.terrainObjectsByKey.get(ck) ?? [];
    const hasSeed = objects.some((o) => o.kind === "seed");

    const adjacent =
      me != null && Math.abs(c.x - me.x) + Math.abs(c.y - me.y) === 1;
    const stepBase =
      playerCanMove &&
      !isDeployment &&
      isWalkable(tile) &&
      !player &&
      !enemy &&
      adjacent &&
      showStepMoveHighlights;
    const stepCost = me && stepBase ? movementStepCost(s, me, c.x, c.y) : Infinity;
    const showRegularStep =
      stepBase &&
      !inSprintMode &&
      (sandbox || (stepCost <= movementRemaining && movementRemaining > 0));
    const showSprintStep = stepBase && inSprintMode && stepCost <= sprintRemaining && sprintRemaining > 0;

    const combatPrimary =
      combatAttackPrimaryKeys.value.has(ck) ||
      borrowCombatPrimaryKeys.value.has(ck) ||
      omnistrikePrimaryKeys.value.has(ck) ||
      equipmentCorridorPrimaryKeys.value.has(ck) ||
      equipmentCoverSelectedKeys.value.has(ck) ||
      equipmentForceProjectionSquareKeys.value.has(ck) ||
      redirectSourceKeys.value.has(ck) ||
      redirectTargetKeys.value.has(ck) ||
      redirectPatternPrimaryKeys.value.has(ck) ||
      warhookPrimaryKeys.value.has(ck) ||
      classAbilityPrimaryKeys.value.has(ck) ||
      towerTeleportPrimaryKeys.value.has(ck) ||
      assistedLaunchAnchorKeys.value.has(ck) ||
      assistedLaunchLandingKeys.value.has(ck) ||
      combatAttackSelectedKeys.value.has(ck) ||
      reversalLineKeys.value.damage.has(ck) ||
      gmEnemyAttackTargetKeys.value.has(ck) ||
      (boardActionMode.value === "kataptyPick" && kataptySelectedCoordKeys.value.has(ck));
    const combatSecondary =
      combatAttackSecondaryKeys.value.has(ck) ||
      borrowCombatSecondaryKeys.value.has(ck) ||
      omnistrikeSecondaryKeys.value.has(ck) ||
      equipmentCorridorSecondaryKeys.value.has(ck) ||
      equipmentCoverSecondaryKeys.value.has(ck) ||
      warhookSecondaryKeys.value.has(ck) ||
      armorPlaceTowerKeys.value.has(ck) ||
      classAbilitySecondaryKeys.value.has(ck) ||
      towerTeleportSecondaryKeys.value.has(ck) ||
      assistedLaunchPathKeys.value.has(ck) ||
      assistedLaunchLineKeys.value.has(ck) ||
      kataptyPickKeys.value.has(ck) ||
      rezTargetKeys.value.has(ck);

    map.set(c.key, {
      terrainClass: terrainClass(tile),
      movable:
        activePlayerSelected.value &&
        playerCanMove &&
        !isDeployment &&
        isWalkable(tile) &&
        !player &&
        !enemy &&
        (sandbox) &&
        inMoveMode,
      moveSecondary: showRegularStep || showSprintStep,
      deployable:
        isDeployment &&
        props.role === "player" &&
        !!yourPlayerId.value &&
        isWalkable(tile) &&
        !player &&
        !enemy,
      gmMovable: props.role === "gm" && gmEnemyMoveTargetKeys.value.has(c.key),
      gmSpawnable: props.role === "gm" && gmSpawnableKeys.value.has(c.key),
      patternPrimary: patternPrimaryKeys.value.has(ck),
      patternSecondary: patternSecondaryKeys.value.has(ck),
      combatTargetPrimary: combatPrimary,
      combatTargetSecondary: combatSecondary,
      combatTargetHeal:
        reversalLineKeys.value.heal.has(ck) ||
        (boardActionMode.value === "rez" && rezTargetKeys.value.has(ck)) ||
        (isHealAttackSpecActive.value && (combatPrimary || combatSecondary)),
      combatTargetInvalid:
        combatAttackInvalidKeys.value.has(coordKey(c.x, c.y)) ||
        omnistrikeInvalidKeys.value.has(coordKey(c.x, c.y)) ||
        equipmentCorridorInvalidKeys.value.has(coordKey(c.x, c.y)) ||
        sharurAttractorInvalidKeys.value.has(coordKey(c.x, c.y)),
      patternRecoil: patternRecoilKeys.value.has(coordKey(c.x, c.y)),
      tile,
      player,
      enemyAnchor,
      enemyHp:
        enemyAnchor && s && props.role === "gm"
          ? (() => {
              const group = swarmGroupForEnemy(s, enemyAnchor.id, swarmGroups);
              if (
                isSoloSwarmMemberSelected.value &&
                selectedEnemyId.value === enemyAnchor.id &&
                group &&
                group.size > 1
              ) {
                const memberHp = getSwarmMemberHp(getEffectiveEnemyHp(enemyAnchor, s), group.size);
                return { currentHp: memberHp, maxHp: getSwarmMaxHp(1) };
              }
              return {
                currentHp: getEffectiveEnemyHp(enemyAnchor, s),
                maxHp: getEffectiveEnemyMaxHp(enemyAnchor, s),
              };
            })()
          : undefined,
      showSwarmHp: (() => {
        if (!enemyAnchor || !s) return true;
        if (isSoloSwarmMemberSelected.value && selectedEnemyId.value === enemyAnchor.id) {
          return true;
        }
        const group = swarmGroupForEnemy(s, enemyAnchor.id, swarmGroups);
        if (!group) return true;
        return swarmCanonicalDisplayId(s, group.memberIds) === enemyAnchor.id;
      })(),
      effectStacks: player?.effects ?? enemyAnchor?.effects,
      turnEnded: player
        ? !isSandboxMode(s) &&
          s.roundPhase !== "deployment" &&
          s.actedPlayerIds.includes(player.id)
        : !!(enemy && !isTowerEnemy(enemy) && !isSandboxMode(s) && enemy.exhausted),
      playerDowned: player ? isPlayerDowned(player) : false,
      playerPortraitUrl: player?.characterSheetId
        ? portraitUrlFor(player.characterSheetId)
        : null,
      enemyPortraitUrl:
        enemyAnchor && enemyAnchor.kind !== "tower"
          ? enemyPortraitUrlForName(enemyAnchor.name)
          : null,
      enemyPortraitBg: (() => {
        if (!enemyAnchor || enemyAnchor.kind === "tower") return null;
        const listing = getEnemyListingByName(enemyAnchor.name);
        const url = enemyPortraitUrlForName(enemyAnchor.name);
        if (!listing?.portrait || !url) return null;
        const cacheKey = `${listing.portrait}:${url}`;
        if (portraitBgCache.has(cacheKey)) return portraitBgCache.get(cacheKey)!;
        const bg = portraitBackgroundFor(listing.portrait, url);
        portraitBgCache.set(cacheKey, bg);
        return bg;
      })(),
      hasSeed,
      kopisToken: boardTokenKeys.value.has(coordKey(c.x, c.y)),
      kopisMarked: enemyAnchor ? kopisMarkedEnemyIds.value.has(enemyAnchor.id) : false,
      trapLine: trapLineKeys.value.has(coordKey(c.x, c.y)),
      trapWeapon: trapWeaponKeys.value.has(coordKey(c.x, c.y)),
      attractorZone: attractorZoneOnlyKeys.value.has(coordKey(c.x, c.y)),
      attractorCenter: attractorCenterKeys.value.has(coordKey(c.x, c.y)),
      attractorVoid: attractorCenterKeys.value.get(coordKey(c.x, c.y))?.void ?? false,
      towerOwnerHue:
        enemyAnchor?.kind === "tower" && enemyAnchor.ownerPlayerId
          ? hueFromId(enemyAnchor.ownerPlayerId)
          : null,
      tileEffects: tile?.tileEffects,
    });
  }
  return map;
});

const boardCellRows = computed(() => {
  const states = cellStateByKey.value;
  const teleportingIds = teleportingPlayerIds.value;
  const animatingId = animatingEnemyId.value;
  return cells.value.map((c) => {
    const cell = states.get(c.key);
    if (!cell) return null;
    const player = cell.player;
    const enemyAnchor = cell.enemyAnchor;
    return {
      x: c.x,
      y: c.y,
      key: c.key,
      cell,
      isHovered: hoveredKey.value === c.key,
      canDragDeploy: !!player && canDragDeploy(player),
      isPlayerSelected: !!player && (isPlayerSelected(player.id) || isPlayerBulkSelected(player.id)),
      isEnemySelected: !!enemyAnchor && (isEnemySelected(enemyAnchor.id) || isEnemyBulkSelected(enemyAnchor.id)),
      isBulkTileSelected: isTileBulkSelected(c.x, c.y),
      playerHue: player ? hueFromId(player.id) : null,
      enemyDying: !!enemyAnchor && isEnemyDying(enemyAnchor.id),
      enemyDefeated: !!enemyAnchor && isEnemyDefeated(enemyAnchor.id),
      enemyPendingRemoval: !!enemyAnchor && isEnemyPendingRemoval(enemyAnchor.id),
      playerTeleporting: !!player && teleportingIds.has(player.id),
      enemyAnimating: enemyAnchor?.id === animatingId,
      playerHp: player?.hp,
      enemyHp: enemyAnchor?.hp,
    };
  }).filter((row): row is NonNullable<typeof row> => row != null);
});

const tooltipData = computed(() => {
  const cell = hoveredCell.value;
  const s = gameState.value;
  const occ = occupancy.value;
  if (!cell || !s || !occ) return null;
  const key = coordKey(cell.x, cell.y);
  const tile = tileAt(s.tiles, cell.x, cell.y);
  if (!tile) return null;
  const anchor = occ.enemyByKey.get(key);
  const enemyEntry = (() => {
    if (!anchor || isTowerEnemy(anchor)) return null;
    const group = swarmGroupForEnemy(s, anchor.id);
    const baseName = anchor.name ?? "Enemy";
    if (group && group.size > 1) {
      const solo =
        isSoloSwarmMemberSelected.value && selectedEnemyId.value === anchor.id;
      const memberHp = getSwarmMemberHp(group.currentHp, group.size);
      return {
        ...anchor,
        displayName: solo ? `${baseName} (Swarm member)` : `${baseName} (Swarm · ${group.size})`,
        displayHp: solo ? memberHp : group.currentHp,
        displayMaxHp: solo ? getSwarmMaxHp(1) : group.maxHp,
      };
    }
    return {
      ...anchor,
      displayName: baseName,
      displayHp: getEffectiveEnemyHp(anchor, s),
      displayMaxHp: getEffectiveEnemyMaxHp(anchor, s),
    };
  })();
  return {
    x: cell.x,
    y: cell.y,
    tile,
    players: occ.playerByKey.has(key) ? [occ.playerByKey.get(key)!] : [],
    enemies: enemyEntry ? [enemyEntry] : [],
    towers: anchor && isTowerEnemy(anchor) ? [anchor] : [],
    objects: occ.terrainObjectsByKey.get(key) ?? [],
    attractors: (() => {
      const attractors = s.combat?.attractors ?? [];
      const entries: { id: string; void: boolean; ownerId: string; zone: boolean }[] = [];
      for (const a of attractors) {
        if (a.x === cell.x && a.y === cell.y) {
          entries.push({ id: a.id, void: a.void, ownerId: a.ownerId, zone: false });
          continue;
        }
        if (tilesInAttractorZone(a).some((t) => t.x === cell.x && t.y === cell.y)) {
          entries.push({ id: `zone-${a.id}`, void: a.void, ownerId: a.ownerId, zone: true });
        }
      }
      return entries;
    })(),
  };
});

const BOARD_CELL_GAP = 3;

const tooltipStyle = computed(() => {
  const cell = hoveredCell.value;
  const s = gameState.value;
  if (!cell || !s) return null;
  const gridW = boardWidthPx.value;
  const gridH = gridW * (s.height / s.width);
  const cellW = (gridW - (s.width - 1) * BOARD_CELL_GAP) / s.width;
  const cellH = (gridH - (s.height - 1) * BOARD_CELL_GAP) / s.height;
  const cellLeft = cell.x * (cellW + BOARD_CELL_GAP);
  const cellTop = cell.y * (cellH + BOARD_CELL_GAP);
  const centerX = cellLeft + cellW / 2;
  return {
    left: `${panX.value + centerX * scale.value}px`,
    top: `${panY.value + cellTop * scale.value}px`,
    transform: "translate(-50%, calc(-100% - 6px))",
  };
});

function cellCenterStyle(x: number, y: number) {
  const s = gameState.value;
  if (!s) return undefined;
  const gridW = boardWidthPx.value;
  const gridH = gridW * (s.height / s.width);
  const cellW = (gridW - (s.width - 1) * BOARD_CELL_GAP) / s.width;
  const cellH = (gridH - (s.height - 1) * BOARD_CELL_GAP) / s.height;
  const centerX = x * (cellW + BOARD_CELL_GAP) + cellW / 2;
  const centerY = y * (cellH + BOARD_CELL_GAP) + cellH / 2;
  const tokenSize = Math.min(cellW, cellH) - 8;
  return {
    left: `${panX.value + centerX * scale.value}px`,
    top: `${panY.value + centerY * scale.value}px`,
    width: `${tokenSize * scale.value}px`,
    height: `${tokenSize * scale.value}px`,
    transform: "translate(-50%, -50%)",
  };
}

function damageIndicatorStyle(x: number, y: number) {
  const base = cellCenterStyle(x, y);
  if (!base) return undefined;
  const s = gameState.value;
  if (!s) return undefined;
  const gridW = boardWidthPx.value;
  const gridH = gridW * (s.height / s.width);
  const cellH = (gridH - (s.height - 1) * BOARD_CELL_GAP) / s.height;
  const tokenBottomOffset = ((cellH - 8) / 2) * scale.value;
  return {
    ...base,
    "--damage-rise": `${tokenBottomOffset}px`,
  };
}

const teleportOverlayPlayer = computed(() => {
  const anim = teleportAnimation.value;
  const s = gameState.value;
  if (!anim || !s) return null;
  return s.players.find((p) => p.id === anim.playerId) ?? null;
});

const teleportOverlayStyle = computed(() => {
  const anim = teleportAnimation.value;
  if (!anim?.animating) return null;
  const x = teleportOverlayAtDest.value ? anim.toX : anim.fromX;
  const y = teleportOverlayAtDest.value ? anim.toY : anim.fromY;
  return cellCenterStyle(x, y);
});

let teleportFinishTimer: ReturnType<typeof setTimeout> | null = null;

watch(
  () => teleportAnimation.value?.animating,
  (animating) => {
    if (teleportFinishTimer) {
      clearTimeout(teleportFinishTimer);
      teleportFinishTimer = null;
    }
    if (!animating) {
      teleportOverlayAtDest.value = false;
      return;
    }
    teleportOverlayAtDest.value = false;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        teleportOverlayAtDest.value = true;
      });
    });
    teleportFinishTimer = setTimeout(() => finishTeleport(), 450);
  },
);

function onTeleportOverlayTransitionEnd(e: TransitionEvent) {
  if (e.propertyName !== "left" || !teleportOverlayAtDest.value) return;
  if (teleportFinishTimer) {
    clearTimeout(teleportFinishTimer);
    teleportFinishTimer = null;
  }
  finishTeleport();
}

const enemyMoveOverlayStyle = computed(() => {
  const anim = enemyMoveAnimation.value;
  if (!anim?.animating) return null;
  const x = enemyMoveOverlayAtDest.value ? anim.toX : anim.fromX;
  const y = enemyMoveOverlayAtDest.value ? anim.toY : anim.fromY;
  return cellCenterStyle(x, y);
});

const enemyMoveOverlayPortraitUrl = computed(() => {
  const anim = enemyMoveAnimation.value;
  const s = gameState.value;
  if (!anim || !s) return null;
  const enemy = s.enemies.find((e) => e.id === anim.enemyId);
  if (!enemy || enemy.kind === "tower") return null;
  return enemyPortraitUrlForName(enemy.name);
});

const enemyMoveOverlayIsFortification = computed(() => {
  const anim = enemyMoveAnimation.value;
  const s = gameState.value;
  if (!anim || !s) return false;
  const enemy = s.enemies.find((e) => e.id === anim.enemyId);
  return !!enemy && isFortificationEnemy(enemy);
});

const enemyMoveOverlayBg = computed(() => {
  const anim = enemyMoveAnimation.value;
  const s = gameState.value;
  if (!anim || !s) return null;
  const enemy = s.enemies.find((e) => e.id === anim.enemyId);
  if (!enemy || enemy.kind === "tower") return null;
  const listing = getEnemyListingByName(enemy.name);
  const url = enemyPortraitUrlForName(enemy.name);
  if (!listing?.portrait || !url) return null;
  return portraitBackgroundFor(listing.portrait, url);
});

let enemyMoveFinishTimer: ReturnType<typeof setTimeout> | null = null;

watch(
  () => enemyMoveAnimation.value?.animating,
  (animating) => {
    if (enemyMoveFinishTimer) {
      clearTimeout(enemyMoveFinishTimer);
      enemyMoveFinishTimer = null;
    }
    if (!animating) {
      enemyMoveOverlayAtDest.value = false;
      return;
    }
    enemyMoveOverlayAtDest.value = false;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        enemyMoveOverlayAtDest.value = true;
      });
    });
    enemyMoveFinishTimer = setTimeout(() => finishEnemyMove(), 450);
  },
);

function onEnemyMoveOverlayTransitionEnd(e: TransitionEvent) {
  if (e.propertyName !== "left" || !enemyMoveOverlayAtDest.value) return;
  if (enemyMoveFinishTimer) {
    clearTimeout(enemyMoveFinishTimer);
    enemyMoveFinishTimer = null;
  }
  finishEnemyMove();
}

function playerLabel(player: Player): string {
  return player.nickname ?? player.id;
}

function enemyLabel(enemy: Enemy): string {
  return enemy.name ?? "Enemy";
}

function terrainObjectLabel(object: TerrainObject): string {
  return object.name ?? "Object";
}

function attractorTooltipLabel(entry: { void: boolean; ownerId: string; zone: boolean }): string {
  const owner = gameState.value?.players.find((p) => p.id === entry.ownerId);
  const ownerName = owner ? playerLabel(owner) : entry.ownerId;
  if (entry.zone) return `Attractor zone · ${ownerName}`;
  return `${entry.void ? "Void Attractor" : "Attractor"} · ${ownerName}`;
}

function formatHp(current: number | undefined, max: number): string {
  const hp = current ?? 0;
  return max > 0 ? `${hp}/${max}` : String(hp);
}

function effectEntries(stacks?: EffectStacks) {
  if (!stacks) return [];
  return Object.entries(stacks)
    .filter(([, v]) => v > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, count]) => ({ id, stacks: count }));
}

function effectTooltipLabel(id: string, stacks: number): string {
  const summary = getEffectSummary(id);
  const base = summary ? `${id}: ${stacks} — ${summary}` : `${id}: ${stacks}`;
  return base;
}

function terrainTooltipLabel(terrain: string[]): string {
  return terrain.map((id) => terrainTypeDisplayName(id)).join(", ");
}

function gmEnemyMoveDestAt(x: number, y: number): { x: number; y: number } | null {
  const s = gameState.value;
  const id = selectedEnemyId.value;
  if (!s || !id) return null;
  const key = boardCellKey(x, y);
  if (!gmEnemyMoveTargetKeys.value.has(key)) return null;

  const group = swarmGroupForEnemy(s, id);
  if (group) return { x, y };

  const enemy = s.enemies.find((e) => e.id === id);
  if (!enemy) return null;
  const scale = getEnemyScale(enemy);
  const occ = occupancy.value ?? undefined;
  const deltas = [
    { dx: 0, dy: -1 },
    { dx: 0, dy: 1 },
    { dx: -1, dy: 0 },
    { dx: 1, dy: 0 },
  ];
  const clickDx = x - enemy.x;
  const clickDy = y - enemy.y;
  let best: { x: number; y: number; score: number } | null = null;
  for (const { dx, dy } of deltas) {
    const anchorX = enemy.x + dx;
    const anchorY = enemy.y + dy;
    if (validateEnemyFootprint(s, anchorX, anchorY, scale, id, occ) !== null) continue;
    let matches = false;
    for (const tile of enemyFootprintTiles(anchorX, anchorY, scale)) {
      if (tile.x === x && tile.y === y) {
        matches = true;
        break;
      }
    }
    if (!matches) continue;
    const score = dx * clickDx + dy * clickDy;
    if (!best || score > best.score) best = { x: anchorX, y: anchorY, score };
  }
  return best ? { x: best.x, y: best.y } : null;
}

function sendEnemyMove(
  enemyId: string,
  destX: number,
  destY: number,
  opts: { soloSwarmMember?: boolean; animateFrom?: { x: number; y: number }; animateMoverId?: string },
) {
  const s = gameState.value;
  if (!s) return;
  const moverId = opts.animateMoverId ?? enemyId;
  const mover = s.enemies.find((e) => e.id === moverId);
  const from = opts.animateFrom ?? (mover ? { x: mover.x, y: mover.y } : { x: destX, y: destY });
  gateProvoke(previewEnemyMoveProvokes(s, enemyId, destX, destY, opts), () => {
    startEnemyMove(moverId, from, { x: destX, y: destY });
    send({ type: "moveEnemy", enemyId, x: destX, y: destY, soloSwarmMember: opts.soloSwarmMember });
  });
}

function tryMoveSelectedEnemyToDest(destX: number, destY: number): boolean {
  const s = gameState.value;
  const selected = selectedEnemyId.value;
  if (!s || !selected) return false;
  if (swarmChipOpen.value) return false;
  if (!ensureSwarmChipResolved(selected)) return false;
  const enemy = s.enemies.find((e) => e.id === selected);
  if (!enemy) {
    clearBoardSelection();
    return false;
  }
  if (!canGmMoveEnemies(s)) return false;

  const group = swarmGroupForEnemy(s, selected);
  if (group && isSoloSwarmMemberSelected.value) {
    if (!canSwarmMemberReachDest(s, selected, destX, destY, occupancy.value ?? undefined)) {
      return false;
    }
    sendEnemyMove(selected, destX, destY, {
      soloSwarmMember: true,
      animateFrom: { x: s.enemies.find((e) => e.id === selected)!.x, y: s.enemies.find((e) => e.id === selected)!.y },
      animateMoverId: selected,
    });
    return true;
  }
  if (group) {
    const moverId = pickSwarmMoveMember(s, group.memberIds, destX, destY);
    if (!moverId) return false;
    const mover = s.enemies.find((e) => e.id === moverId)!;
    sendEnemyMove(selected, destX, destY, {
      animateFrom: { x: mover.x, y: mover.y },
      animateMoverId: moverId,
    });
    return true;
  }

  const scale = getEnemyScale(enemy);
  if (validateEnemyFootprint(s, destX, destY, scale, selected, occupancy.value ?? undefined) !== null) {
    return false;
  }
  sendEnemyMove(selected, destX, destY, { animateFrom: { x: enemy.x, y: enemy.y } });
  return true;
}

function handleKataptyPick(enemyId: string): boolean {
  const s = gameState.value;
  if (!s || boardActionMode.value !== "kataptyPick") return false;
  const enemy = s.enemies.find((e) => e.id === enemyId);
  if (!enemy || isTowerEnemy(enemy)) return true;
  if (!kataptyPickKeys.value.has(coordKey(enemy.x, enemy.y))) return true;
  const ids = kataptyTargetIds.value;
  const idx = ids.indexOf(enemy.id);
  if (idx >= 0) {
    kataptyTargetIds.value = ids.filter((id) => id !== enemy.id);
  } else if (ids.length < 3) {
    kataptyTargetIds.value = [...ids, enemy.id];
  }
  if (kataptyTargetIds.value.length === 3) {
    sendPlayerAction({ action: "kataptyEndTurn", targetEnemyIds: [...kataptyTargetIds.value] });
    clearBoardActionMode();
  }
  return true;
}

let enemyClickTimer: ReturnType<typeof setTimeout> | null = null;

function boardTargetingContext() {
  return { omnistrikeStep: omnistrikeStep.value };
}

function onEnemyCellClick(x: number, y: number, enemyId: string) {
  if (tryGmDamageEffectToken({ kind: "enemy", id: enemyId })) return;
  if (
    props.role === "player" &&
    routesTokenClickToCellTargeting(boardActionMode.value, boardTargetingContext())
  ) {
    handleCombatCellClick(x, y);
    return;
  }
  if (enemyClickTimer) clearTimeout(enemyClickTimer);
  enemyClickTimer = setTimeout(() => {
    enemyClickTimer = null;
    toggleBoardEnemy(enemyId);
  }, 250);
}

function onEnemyCellDblClick(_x: number, _y: number, enemyId: string) {
  if (enemyClickTimer) {
    clearTimeout(enemyClickTimer);
    enemyClickTimer = null;
  }
  const s = gameState.value;
  if (props.role !== "gm" || !s) return;
  const group = swarmGroupForEnemy(s, enemyId);
  if (!group || group.size < 2) return;
  selectBoardEnemyMember(enemyId);
}

function selectOccupantAt(x: number, y: number): boolean {
  const occ = occupancy.value;
  if (!occ) return false;
  const key = coordKey(x, y);
  const player = occ.playerByKey.get(key);
  if (player) {
    selectBoardPlayer(player.id, player.characterSheetId);
    return true;
  }
  const enemy = occ.enemyByKey.get(key);
  if (enemy) {
    toggleBoardEnemy(enemy.id);
    return true;
  }
  return false;
}

function arrowTarget(key: string, origin: { x: number; y: number }): { x: number; y: number } | null {
  const map: Record<string, { x: number; y: number }> = {
    ArrowUp: { x: origin.x, y: origin.y - 1 },
    ArrowDown: { x: origin.x, y: origin.y + 1 },
    ArrowLeft: { x: origin.x - 1, y: origin.y },
    ArrowRight: { x: origin.x + 1, y: origin.y },
  };
  return map[key] ?? null;
}

function tryMove(x: number, y: number) {
  if (props.role !== "player") return;
  if (boardActionMode.value === "sprint") return;
  if (!yourPlayerId.value || !gameState.value) return;
  if (!canPlayerMove(gameState.value, yourPlayerId.value)) return;
  const deploying = gameState.value.roundPhase === "deployment";
  if (!deploying && !activePlayerSelected.value) return;
  const cell = cellStateByKey.value.get(boardCellKey(x, y));
  if (!deploying && !cell?.movable && !cell?.deployable && !cell?.moveSecondary) return;
  if (deploying && !cell?.deployable) return;
  const s = gameState.value;
  const id = yourPlayerId.value;
  const path = [{ x, y }];
  if (deploying) {
    send({ type: "move", x, y });
    return;
  }
  gateProvoke(previewPathProvokes(s, id, path), () => sendMovePath(path));
}

function canDragDeploy(player: Player): boolean {
  return (
    props.role === "player" &&
    !!yourPlayerId.value &&
    player.id === yourPlayerId.value &&
    !!gameState.value &&
    gameState.value.roundPhase === "deployment"
  );
}

function onDeployPointerDown(e: PointerEvent, player: Player) {
  if (!canDragDeploy(player)) return;
  draggingDeploy.value = true;
  const onUp = (ev: PointerEvent) => {
    window.removeEventListener("pointerup", onUp);
    onDeployPointerUp(ev);
  };
  window.addEventListener("pointerup", onUp);
}

function onDeployPointerUp(e: PointerEvent) {
  if (!draggingDeploy.value) return;
  draggingDeploy.value = false;
  const el = document.elementFromPoint(e.clientX, e.clientY);
  const cell = el?.closest("[data-cell-x]") as HTMLElement | null;
  if (!cell) return;
  const x = Number(cell.dataset.cellX);
  const y = Number(cell.dataset.cellY);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  tryMove(x, y);
}

function attackTilesForAction(action: Extract<PlayerAction, { action: "attack" }>): { x: number; y: number }[] {
  const me = yourPlayer.value;
  const s = gameState.value;
  const ctx = attackContext.value;
  if (!me || !s || !ctx) return [];
  if (isRangeTargetAttack(ctx.spec)) {
    const ids = action.targetEnemyIds;
    if (!ids?.length) return [];
    return ids.flatMap((id) => {
      const e = s.enemies.find((en) => en.id === id);
      return e ? [{ x: e.x, y: e.y }] : [];
    });
  }
  const direction = action.direction;
  const base = ctx.origin ?? { x: me.x, y: me.y };
  const origin =
    action.anchorX != null && action.anchorY != null
      ? patternOriginFromAnchor({ x: action.anchorX, y: action.anchorY }, ctx.spec.anchorTile, direction)
      : base;
  return collectAttackTiles(s, origin, ctx.spec, direction);
}

function submitAttackAction(action: Extract<PlayerAction, { action: "attack" }>) {
  const me = yourPlayer.value;
  const s = gameState.value;
  const ctx = attackContext.value;
  if (!me || !s || !ctx) return;
  const tiles = attackTilesForAction(action);
  if (weaponHasBreakerTag(me, ctx.weapon) && attackTargetsSwarm(s, tiles)) {
    pendingAttackAction.value = action;
    breakerPromptOpen.value = true;
    return;
  }
  if (ctx.equipmentUse && forceProjectionOrigin.value) {
    const origin = forceProjectionOrigin.value;
    sendPlayerAction({
      action: "useEquipment",
      detail: me.equipment,
      projectionX: origin.x,
      projectionY: origin.y,
      direction: action.direction,
      anchorX: action.anchorX,
      anchorY: action.anchorY,
      targetEnemyIds: action.targetEnemyIds,
      weaponName: ctx.weapon,
      useBreaker: action.useBreaker,
    });
    clearBoardActionMode();
    return;
  }
  sendPlayerAction(action);
  clearBoardActionMode();
}

function onBreakerConfirm(useBreaker: boolean) {
  const action = pendingAttackAction.value;
  if (!action) return;
  const ctx = attackContext.value;
  const me = yourPlayer.value;
  if (ctx?.equipmentUse && forceProjectionOrigin.value && me) {
    const origin = forceProjectionOrigin.value;
    sendPlayerAction({
      action: "useEquipment",
      detail: me.equipment,
      projectionX: origin.x,
      projectionY: origin.y,
      direction: action.direction,
      anchorX: action.anchorX,
      anchorY: action.anchorY,
      targetEnemyIds: action.targetEnemyIds,
      weaponName: ctx.weapon,
      useBreaker,
    });
  } else {
    sendPlayerAction({ ...action, useBreaker });
  }
  pendingAttackAction.value = null;
  breakerPromptOpen.value = false;
  clearBoardActionMode();
}

function onBreakerCancel() {
  pendingAttackAction.value = null;
  breakerPromptOpen.value = false;
}

function handleAttackCellClick(x: number, y: number, targetEnemyId?: string): boolean {
  const me = yourPlayer.value;
  const s = gameState.value;
  const ctx = attackContext.value;
  if (!me || !s || !ctx) return false;

  const key = coordKey(x, y);
  const origin = ctx.origin ?? { x: me.x, y: me.y };
  const attackAction = {
    action: "attack" as const,
    direction: attackDirection.value,
  };

  function dirsAt(tx: number, ty: number): PatternDirection[] {
    if (origin.x === me.x && origin.y === me.y) {
      return playerAttackDirectionsAt(s, me.id, tx, ty, ctx.weapon);
    }
    const dirs: PatternDirection[] = [];
    for (const direction of PATTERN_DIRECTIONS) {
      const tiles = collectAttackTiles(s, origin, ctx.spec, direction);
      if (tiles.some((t) => t.x === tx && t.y === ty)) dirs.push(direction);
    }
    return dirs;
  }

  if (isRangeTargetAttack(ctx.spec)) {
    if (!combatAttackSecondaryKeys.value.has(key)) return false;

    if (targetEnemyId) {
      const enemy = s.enemies.find((e) => e.id === targetEnemyId);
      if (!enemy) return false;
      if (manhattanDistance(origin, enemy) > rangeTargetDistance(ctx.spec)) return false;

      const maxTargets = rangeTargetMax(ctx.spec);
      const selected = rangeAttackTargetIds.value;
      if (selected.includes(targetEnemyId)) {
        rangeAttackTargetIds.value = selected.filter((id) => id !== targetEnemyId);
      } else if (selected.length < maxTargets) {
        const next = [...selected, targetEnemyId];
        rangeAttackTargetIds.value = next;
        if (next.length >= maxTargets) {
          submitAttackAction({
            ...attackAction,
            targetEnemyIds: next,
          });
        }
      }
      return true;
    }

    if (rangeAttackTargetIds.value.length === 0) return true;
    submitAttackAction({
      ...attackAction,
      targetEnemyIds: [...rangeAttackTargetIds.value],
    });
    return true;
  }

  if (usesAnchoredPatternPlacement(ctx.spec)) {
    if (!attackAimed.value) {
      const placement = evaluateAnchoredPatternPlacement(
        origin,
        { x, y },
        ctx.spec,
        attackDirection.value,
        s,
      );
      if (placement.tooFar) {
        showToast("outside maximum range");
        return true;
      }
      if (placement.tooCloseKeys.size > 0) {
        showToast("inside minimum range");
        return true;
      }
      if (!placement.valid) return false;
      attackAnchor.value = { x, y };
      attackAimed.value = true;
      return true;
    }

    if (combatAttackPrimaryKeys.value.has(key)) {
      const anchor = attackAnchor.value;
      if (!anchor) return false;
      submitAttackAction({
        action: "attack",
        direction: attackDirection.value,
        anchorX: anchor.x,
        anchorY: anchor.y,
      });
      return true;
    }

    attackAimed.value = false;
    attackAnchor.value = null;
    return true;
  }

  if (isRangedPatternAttack(ctx.spec)) {
    if (!combatAttackSecondaryKeys.value.has(key)) return false;

    const dirs = dirsAt(x, y);
    if (dirs.length === 0) return false;

    if (attackAimed.value && (combatAttackPrimaryKeys.value.has(key) || combatAttackSecondaryKeys.value.has(key))) {
      submitAttackAction(attackAction);
      return true;
    }

    const nextDir = attackAimed.value
      ? (dirs.find((d) => d !== attackDirection.value) ?? dirs[0])
      : dirs[0];
    attackDirection.value = nextDir;
    attackAimed.value = true;
    return true;
  }

  const dirs = dirsAt(x, y);
  if (dirs.length === 0) return false;

  if (attackAimed.value && combatAttackPrimaryKeys.value.has(key)) {
    submitAttackAction(attackAction);
    return true;
  }

  const nextDir = attackAimed.value
    ? (dirs.find((d) => d !== attackDirection.value) ?? dirs[0])
    : dirs[0];
  attackDirection.value = nextDir;
  attackAimed.value = true;
  return true;
}

function handleEquipmentCoverCellClick(x: number, y: number): boolean {
  const me = yourPlayer.value;
  const s = gameState.value;
  if (!me || !s) return false;
  const key = coordKey(x, y);
  if (!equipmentCoverRangeKeys.value.has(key)) return false;

  const selected = [...equipmentCoverTiles.value];
  const idx = selected.findIndex((t) => t.x === x && t.y === y);
  if (idx >= 0) {
    equipmentCoverTiles.value = selected.filter((_, i) => i !== idx);
    return true;
  }
  if (selected.length >= 3) return false;

  const next = [...selected, { x, y }];
  if (next.length > 1 && !areOrthogonallyConnected(next)) {
    showToast("Tiles must be connected");
    return true;
  }
  equipmentCoverTiles.value = next;

  if (next.length === 3 && areOrthogonallyConnected(next)) {
    sendPlayerAction({
      action: "useEquipment",
      detail: me.equipment,
      coverTiles: next,
    });
    clearBoardActionMode();
  }
  return true;
}

function handleForceProjectionSquareClick(x: number, y: number): boolean {
  const key = coordKey(x, y);
  if (!equipmentForceProjectionSquareKeys.value.has(key)) return false;
  forceProjectionOrigin.value = { x, y };
  forceProjectionStep.value = "attack";
  attackAimed.value = false;
  attackAnchor.value = null;
  rangeAttackTargetIds.value = [];
  return true;
}

function advanceRedirectAfterAttackPick() {
  const s = gameState.value;
  const sourceId = redirectSourceEnemyId.value;
  const attackIndex = redirectAttackIndex.value;
  if (!s || !sourceId || attackIndex == null) return;
  const source = s.enemies.find((e) => e.id === sourceId);
  if (!source?.name) return;
  const attacks = getEnemyListingByName(source.name)?.attacks ?? [];
  const parsed = parseEnemyAttackString(attacks[attackIndex] ?? "");
  redirectStep.value = isDirectTargetEnemyAttack(parsed) ? "selectTarget" : "confirmPattern";
  attackAimed.value = false;
  attackDirection.value = "n";
}

function handleEquipmentRedirectCellClick(x: number, y: number, enemyId?: string): boolean {
  const me = yourPlayer.value;
  const s = gameState.value;
  if (!me || !s) return false;
  const step = redirectStep.value;

  if (step === "selectSource") {
    if (!enemyId || !redirectSourceKeys.value.has(coordKey(x, y))) return false;
    const anchor = s.enemies.find((e) => e.id === enemyId);
    if (!anchor?.name) return false;
    const indices = listRedirectableEnemyAttackIndices(anchor.name);
    if (!indices.length) {
      showToast("No supported attacks");
      return true;
    }
    redirectSourceEnemyId.value = enemyId;
    if (indices.length === 1) {
      redirectAttackIndex.value = indices[0]!;
      advanceRedirectAfterAttackPick();
    } else {
      redirectAttackIndex.value = indices[0]!;
      redirectStep.value = "selectAttack";
    }
    return true;
  }

  if (step === "selectTarget" && enemyId && redirectTargetKeys.value.has(coordKey(x, y))) {
    sendPlayerAction({
      action: "useEquipment",
      detail: me.equipment,
      sourceEnemyId: redirectSourceEnemyId.value!,
      attackIndex: redirectAttackIndex.value!,
      targetEnemyId: enemyId,
    });
    clearBoardActionMode();
    return true;
  }

  if (step === "confirmPattern" && redirectPatternPrimaryKeys.value.has(coordKey(x, y))) {
    sendPlayerAction({
      action: "useEquipment",
      detail: me.equipment,
      sourceEnemyId: redirectSourceEnemyId.value!,
      attackIndex: redirectAttackIndex.value!,
      direction: attackDirection.value,
    });
    clearBoardActionMode();
    return true;
  }

  if (step === "selectAttack") {
    if (enemyId === redirectSourceEnemyId.value) {
      advanceRedirectAfterAttackPick();
      return true;
    }
    return true;
  }

  return false;
}

function submitBorrowClassActive(opts?: {
  direction?: PatternDirection;
  anchorX?: number;
  anchorY?: number;
}) {
  const allyId = borrowAllyId.value;
  if (!allyId) return;
  sendPlayerAction({
    action: "classActive",
    kind: "borrowing_this",
    allyPlayerId: allyId,
    direction: opts?.direction ?? attackDirection.value,
    anchorX: opts?.anchorX,
    anchorY: opts?.anchorY,
  });
  clearBoardActionMode();
}

function handleBorrowCellClick(x: number, y: number, targetEnemyId?: string): boolean {
  const me = yourPlayer.value;
  const s = gameState.value;
  const ctx = borrowContext.value;
  if (!me || !s || !ctx) return false;

  const key = coordKey(x, y);

  if (isRangeTargetAttack(ctx.spec)) {
    if (!borrowCombatSecondaryKeys.value.has(key)) return false;

    if (targetEnemyId) {
      const enemy = s.enemies.find((e) => e.id === targetEnemyId);
      if (!enemy) return false;
      if (manhattanDistance(me, enemy) > rangeTargetDistance(ctx.spec)) return false;

      const maxTargets = rangeTargetMax(ctx.spec);
      const selected = rangeAttackTargetIds.value;
      if (selected.includes(targetEnemyId)) {
        rangeAttackTargetIds.value = selected.filter((id) => id !== targetEnemyId);
      } else if (selected.length < maxTargets) {
        const next = [...selected, targetEnemyId];
        rangeAttackTargetIds.value = next;
        if (next.length >= maxTargets) submitBorrowClassActive();
      }
      return true;
    }

    if (rangeAttackTargetIds.value.length === 0) return true;
    submitBorrowClassActive();
    return true;
  }

  if (usesAnchoredPatternPlacement(ctx.spec)) {
    if (!attackAimed.value) {
      const placement = evaluateAnchoredPatternPlacement(
        me,
        { x, y },
        ctx.spec,
        attackDirection.value,
        s,
      );
      if (placement.tooFar) {
        showToast("outside maximum range");
        return true;
      }
      if (placement.tooCloseKeys.size > 0) {
        showToast("inside minimum range");
        return true;
      }
      if (!placement.valid) return false;
      attackAnchor.value = { x, y };
      attackAimed.value = true;
      return true;
    }

    if (borrowCombatPrimaryKeys.value.has(key)) {
      const anchor = attackAnchor.value;
      if (!anchor) return false;
      submitBorrowClassActive({
        direction: attackDirection.value,
        anchorX: anchor.x,
        anchorY: anchor.y,
      });
      return true;
    }

    attackAimed.value = false;
    attackAnchor.value = null;
    return true;
  }

  if (isRangedPatternAttack(ctx.spec)) {
    if (!borrowCombatSecondaryKeys.value.has(key)) return false;

    const dirs = playerAttackDirectionsAt(s, me.id, x, y, ctx.weapon);
    if (dirs.length === 0) return false;

    if (
      attackAimed.value &&
      (borrowCombatPrimaryKeys.value.has(key) || borrowCombatSecondaryKeys.value.has(key))
    ) {
      submitBorrowClassActive();
      return true;
    }

    const nextDir = attackAimed.value
      ? (dirs.find((d) => d !== attackDirection.value) ?? dirs[0])
      : dirs[0];
    attackDirection.value = nextDir;
    attackAimed.value = true;
    return true;
  }

  const dirs = playerAttackDirectionsAt(s, me.id, x, y, ctx.weapon);
  if (dirs.length === 0) return false;

  if (attackAimed.value && borrowCombatPrimaryKeys.value.has(key)) {
    submitBorrowClassActive();
    return true;
  }

  const nextDir = attackAimed.value
    ? (dirs.find((d) => d !== attackDirection.value) ?? dirs[0])
    : dirs[0];
  attackDirection.value = nextDir;
  attackAimed.value = true;
  return true;
}

function commitWarhook(landing: { x: number; y: number }) {
  const me = yourPlayer.value;
  const target = warhookTarget.value;
  const s = gameState.value;
  if (!me || !target || !s) return;
  const triggers = previewSprintProvokes(s, me.id, landing.x, landing.y);
  gateProvoke(triggers, () => {
    startTeleport(me.id, { x: me.x, y: me.y }, landing);
    sendPlayerAction({
      action: "weaponActive",
      warhook: {
        targetEnemyId: target.enemyId,
        targetX: target.x,
        targetY: target.y,
        landingX: landing.x,
        landingY: landing.y,
      },
    });
    clearBoardActionMode();
  });
}

function handleWarhookCellClick(x: number, y: number): boolean {
  const me = yourPlayer.value;
  const s = gameState.value;
  if (!me || !s) return false;

  if (warhookStep.value === "selectLanding") {
    const key = coordKey(x, y);
    if (!warhookSecondaryKeys.value.has(key)) return false;
    const landing = warhookLandingOptions.value.find((t) => t.x === x && t.y === y);
    if (!landing) return false;
    commitWarhook(landing);
    return true;
  }

  const key = coordKey(x, y);
  if (!warhookPrimaryKeys.value.has(key)) return false;

  const target = isWarhookTargetAt(s, me, x, y);
  if (!target) return false;

  const landings = warhookAdjacentLandingTiles(s, me.id, target);
  if (!landings.length) {
    showToast("No space adjacent to target");
    return true;
  }

  const nearest = warhookNearestLandings(me, landings);
  if (nearest.length === 1) {
    warhookTarget.value = target;
    commitWarhook(nearest[0]!);
    return true;
  }

  warhookTarget.value = target;
  warhookLandingOptions.value = nearest;
  warhookStep.value = "selectLanding";
  return true;
}

function handleEquipmentCorridorCellClick(x: number, y: number): boolean {
  const me = yourPlayer.value;
  const s = gameState.value;
  const ctx = equipmentCorridorContext.value;
  if (!me || !s || !ctx) return false;

  const key = coordKey(x, y);

  if (!attackAimed.value) {
    const tiles = collectEquipmentPatternTiles(s, { x, y }, me.equipment!, attackDirection.value);
    if (tiles.length < (ctx.spec.tiles?.length ?? 0)) return false;
    attackAnchor.value = { x, y };
    attackAimed.value = true;
    return true;
  }

  if (equipmentCorridorPrimaryKeys.value.has(key)) {
    const anchor = attackAnchor.value;
    if (!anchor) return false;
    sendPlayerAction({
      action: "useEquipment",
      detail: me.equipment,
      direction: attackDirection.value,
      anchorX: anchor.x,
      anchorY: anchor.y,
    });
    clearBoardActionMode();
    return true;
  }

  attackAimed.value = false;
  attackAnchor.value = null;
  return true;
}

function handleOmnistrikeCellClick(x: number, y: number): boolean {
  const ctx = omnistrikeContext.value;
  const s = gameState.value;
  if (!ctx || !s) return false;

  const step = omnistrikeStep.value;
  const key = coordKey(x, y);

  if (step === "confirm") {
    if (omnistrikePrimaryKeys.value.has(key)) {
      const anchorA = omnistrikeAnchors.value[0];
      const anchorB = omnistrikeAnchors.value[1];
      if (!anchorA || !anchorB) return false;
      sendPlayerAction({
        action: "weaponActive",
        omnistrike: {
          bombIndices: [ctx.indexA, ctx.indexB],
          anchors: [anchorA, anchorB],
          direction: attackDirection.value,
        },
      });
      clearBoardActionMode();
      return true;
    }
    omnistrikeAnchors.value = [omnistrikeAnchors.value[0], null];
    omnistrikeStep.value = "placeSecond";
    return true;
  }

  if (step === "placeFirst") {
    const placement = evaluateOmnistrikePlacement(
      ctx.me,
      { x, y },
      ctx.bombA,
      attackDirection.value,
      s,
      ctx.combinedSpan,
    );
    if (placement.tooFar) {
      showToast("outside maximum range");
      return true;
    }
    if (placement.tooCloseKeys.size > 0) {
      showToast("inside minimum range");
      return true;
    }
    if (!placement.valid) return false;
    omnistrikeAnchors.value = [{ x, y }, null];
    omnistrikeStep.value = "placeSecond";
    return true;
  }

  if (step === "placeSecond") {
    const firstAnchor = omnistrikeAnchors.value[0];
    if (!firstAnchor) return false;
    const firstTiles = collectBombPatternTiles(s, firstAnchor, ctx.bombA, attackDirection.value);
    const placement = evaluateOmnistrikePlacement(
      ctx.me,
      { x, y },
      ctx.bombB,
      attackDirection.value,
      s,
      ctx.combinedSpan,
      firstTiles,
    );
    if (placement.tooFar) {
      showToast("outside maximum range");
      return true;
    }
    if (placement.tooCloseKeys.size > 0) {
      showToast("inside minimum range");
      return true;
    }
    if (!placement.adjacentToOther) {
      showToast("Patterns must be adjacent or overlap");
      return true;
    }
    if (!placement.valid) return false;
    omnistrikeAnchors.value = [firstAnchor, { x, y }];
    omnistrikeStep.value = "confirm";
    return true;
  }

  return false;
}

function handleCombatCellClick(x: number, y: number): boolean {
  const m = boardActionMode.value;
  if (!m || !yourPlayer.value || !gameState.value) return false;
  const occ = occupancy.value;
  if (!occ) return false;
  const key = coordKey(x, y);
  const enemy = occ.enemyByKey.get(key);
  const player = occ.playerByKey.get(key);
  const me = yourPlayer.value;

  if (m === "move") {
    if (!activePlayerSelected.value) return true;
    const s = gameState.value;
    const id = yourPlayerId.value;
    if (!s || !id) return true;
    if (isSandboxMode(s)) {
      const path = findPlayerMovementPath(s, id, { x, y });
      if (path) {
        gateProvoke(previewPathProvokes(s, id, path), () => sendMovePath(path));
      }
    } else {
      if (!cellStateByKey.value.get(boardCellKey(x, y))?.moveSecondary) return true;
      const path = [{ x, y }];
      gateProvoke(previewPathProvokes(s, id, path), () => sendMovePath(path));
    }
    return true;
  }
  if (m === "attack") {
    return handleAttackCellClick(x, y, enemy?.id);
  }
  if (m === "varunastraBorrow") {
    if (!borrowAllyId.value && player && player.id !== me.id) {
      borrowAllyId.value = player.id;
      attackAimed.value = false;
      attackAnchor.value = null;
      rangeAttackTargetIds.value = [];
      return true;
    }
    if (borrowAllyId.value) {
      return handleBorrowCellClick(x, y, enemy?.id);
    }
    return true;
  }
  if (m === "omnistrike") {
    return handleOmnistrikeCellClick(x, y);
  }
  if (m === "equipmentCorridor") {
    return handleEquipmentCorridorCellClick(x, y);
  }
  if (m === "equipmentCover") {
    return handleEquipmentCoverCellClick(x, y);
  }
  if (m === "equipmentForceProjection") {
    if (forceProjectionStep.value === "selectSquare") return handleForceProjectionSquareClick(x, y);
    return handleAttackCellClick(x, y, enemy?.id);
  }
  if (m === "equipmentRedirect") {
    return handleEquipmentRedirectCellClick(x, y, enemy?.id);
  }
  if (m === "warhook") {
    return handleWarhookCellClick(x, y);
  }
  if (m === "shove") {
    if (enemy && Math.abs(x - me.x) + Math.abs(y - me.y) === 1) {
      sendPlayerAction({ action: "shove", targetEnemyId: enemy.id });
      clearBoardActionMode();
      return true;
    }
    if (player && player.id !== me.id && Math.abs(x - me.x) + Math.abs(y - me.y) === 1) {
      sendPlayerAction({ action: "shove", targetPlayerId: player.id });
      clearBoardActionMode();
      return true;
    }
    return true;
  }
  if (m === "sprint") {
    if (!activePlayerSelected.value) return true;
    if (!cellStateByKey.value.get(boardCellKey(x, y))?.moveSecondary) return true;
    const s = gameState.value;
    const id = yourPlayerId.value;
    if (!s || !id) return true;
    gateProvoke(previewSprintProvokes(s, id, x, y), () => {
      sendPlayerAction({ action: "sprintMove", x, y });
    });
    return true;
  }
  if (m === "armorTeleport") {
    if (!pendingTargetEnemyId.value && enemy && Math.abs(x - me.x) + Math.abs(y - me.y) === 1) {
      pendingTargetEnemyId.value = enemy.id;
      return true;
    }
    if (pendingTargetEnemyId.value && !enemy && !player) {
      const s = gameState.value;
      const id = yourPlayerId.value;
      if (!s || !id) return true;
      gateProvoke(previewSprintProvokes(s, id, x, y), () => {
        sendPlayerAction({
          action: "armorAction",
          targetEnemyId: pendingTargetEnemyId.value!,
          landingX: x,
          landingY: y,
        });
        clearBoardActionMode();
      });
      return true;
    }
    return true;
  }
  if (m === "armorPush") {
    if (enemy && Math.abs(x - me.x) + Math.abs(y - me.y) === 1) {
      sendPlayerAction({ action: "armorAction", targetEnemyId: enemy.id, push: armorPush.value });
      clearBoardActionMode();
      return true;
    }
    if (player && player.id !== me.id && Math.abs(x - me.x) + Math.abs(y - me.y) === 1) {
      sendPlayerAction({ action: "armorAction", targetPlayerId: player.id, push: armorPush.value });
      clearBoardActionMode();
      return true;
    }
    return true;
  }
  if (m === "armorPlaceTower") {
    const key = coordKey(x, y);
    if (!armorPlaceTowerKeys.value.has(key)) return true;
    sendPlayerAction({ action: "armorAction", x, y });
    clearBoardActionMode();
    return true;
  }
  if (m === "sharurAttractor") {
    const key = coordKey(x, y);
    if (!classAbilitySecondaryKeys.value.has(key) || sharurAttractorInvalidKeys.value.has(key)) return true;
    sendPlayerAction({ action: "classActive", kind: "back_up", x, y });
    clearBoardActionMode();
    return true;
  }
  if (m === "harpeTrap") {
    const key = coordKey(x, y);
    if (!classAbilitySecondaryKeys.value.has(key)) return true;
    sendPlayerAction({ action: "classActive", kind: "weapon_trap", x, y });
    clearBoardActionMode();
    return true;
  }
  if (m === "hephaestusRestore" && player && player.id !== me.id) {
    sendPlayerAction({ action: "classPassive", kind: "baseline_communism", targetPlayerId: player.id });
    clearBoardActionMode();
    return true;
  }
  if (m === "kopisMark" && enemy) {
    sendPlayerAction({ action: "classActive", kind: "mag_dump", targetEnemyIds: [enemy.id] });
    clearBoardActionMode();
    return true;
  }
  if (m === "hephaestusSynesis" && enemy && Math.abs(x - me.x) + Math.abs(y - me.y) <= 1) {
    sendPlayerAction({ action: "classActive", kind: "synesis_conversion", targetEnemyIds: [enemy.id] });
    clearBoardActionMode();
    return true;
  }
  if (m === "towerTeleport") {
    const s = gameState.value;
    if (!s) return true;
    const key = coordKey(x, y);
    if (towerTeleportStep.value === "selectKeraunoTarget" && enemy) {
      sendPlayerAction({
        action: "towerTeleport",
        x: towerTeleportLanding.value!.x,
        y: towerTeleportLanding.value!.y,
        keraunoTargetEnemyId: enemy.id,
      });
      clearBoardActionMode();
      return true;
    }
    if (!towerTeleportSecondaryKeys.value.has(key)) return true;
    const tower = getPlayerTower(s, me.id);
    towerTeleportLanding.value = { x, y };
    if (tower?.name === "Kerauno") {
      const adjacent = keraunoAdjacentEnemyIds(s, x, y);
      if (adjacent.length > 0) {
        towerTeleportStep.value = "selectKeraunoTarget";
        return true;
      }
    }
    sendPlayerAction({ action: "towerTeleport", x, y });
    clearBoardActionMode();
    return true;
  }
  if (m === "assistedLaunch") {
    const s = gameState.value;
    const id = yourPlayerId.value;
    if (!s || !id || !me) return true;
    const key = coordKey(x, y);
    if (assistedLaunchStep.value === "selectAnchor") {
      if (!assistedLaunchAnchorKeys.value.has(key)) return true;
      assistedLaunchAnchor.value = { x, y };
      assistedLaunchStep.value = "confirm";
      return true;
    }
    if (!assistedLaunchLandingKeys.value.has(key)) return true;
    const anchor = assistedLaunchAnchor.value;
    if (!anchor) return true;
    const preview = computeAssistedLaunch(s, id, anchor.x, anchor.y);
    if (!preview) return true;
    gateProvoke(previewPathProvokes(s, id, preview.path), () => {
      sendPlayerAction({ action: "assistedLaunch", anchorX: anchor.x, anchorY: anchor.y });
      clearBoardActionMode();
    });
    return true;
  }
  if (m === "kataptyPick") {
    if (!enemy || isTowerEnemy(enemy)) return true;
    return handleKataptyPick(enemy.id);
  }
  if (m === "rez") {
    if (player && player.id !== me.id && (player.hp ?? 0) <= 0) {
      sendPlayerAction({ action: "rez", targetPlayerId: player.id });
      clearBoardActionMode();
      return true;
    }
    return true;
  }
  return false;
}

function onBoardPlayerClick(x: number, y: number, playerId: string, characterSheetId?: string) {
  if (tryGmDamageEffectToken({ kind: "player", id: playerId })) return;
  if (props.role === "gm" && boardActionMode.value === "gmEnemyAttack") {
    if (handleGmEnemyAttackCellClick(x, y)) return;
  }
  if (routesTokenClickToCellTargeting(boardActionMode.value, boardTargetingContext())) {
    handleCombatCellClick(x, y);
    return;
  }
  selectBoardPlayer(playerId, characterSheetId);
}

function onPlayerCellClick(x: number, y: number) {
  if (handleCombatCellClick(x, y)) return;
  if (routesTokenClickToCellTargeting(boardActionMode.value, boardTargetingContext())) {
    return;
  }
  if (selectOccupantAt(x, y)) return;
  clearBoardSelection();
  tryMove(x, y);
}

function tryMoveSelectedEnemy(x: number, y: number): boolean {
  const dest = gmEnemyMoveDestAt(x, y);
  if (!dest) return false;
  return tryMoveSelectedEnemyToDest(dest.x, dest.y);
}

function handleGmEnemyAttackCellClick(x: number, y: number): boolean {
  const pending = gmEnemyAttack.value;
  const s = gameState.value;
  const occ = occupancy.value;
  if (!pending || !s || !occ) return false;
  const key = coordKey(x, y);
  if (!gmEnemyAttackTargetKeys.value.has(key)) return false;
  const player = occ.playerByKey.get(key);
  if (!player) return false;

  if (pending.swarm) {
    swarmAttackPending.value = {
      enemyId: pending.enemyId,
      attackIndex: pending.attackIndex,
      targetPlayerId: player.id,
      damage: pending.damage,
    };
    swarmAttackModalOpen.value = true;
    clearBoardActionMode();
    return true;
  }

  send({
    type: "gmEnemyAction",
    action: {
      action: "attack",
      enemyId: pending.enemyId,
      attackIndex: pending.attackIndex,
      targetPlayerId: player.id,
      damage: pending.damage,
    },
  });
  clearBoardActionMode();
  return true;
}

function onSwarmAttackConfirm(strikeCount: number) {
  const pending = swarmAttackPending.value;
  if (!pending) return;
  send({
    type: "gmEnemyAction",
    action: {
      action: "attack",
      enemyId: pending.enemyId,
      attackIndex: pending.attackIndex,
      targetPlayerId: pending.targetPlayerId,
      damage: pending.damage,
      swarmStrikes: strikeCount,
    },
  });
  swarmAttackModalOpen.value = false;
  swarmAttackPending.value = null;
}

function onSwarmAttackClose() {
  swarmAttackModalOpen.value = false;
  swarmAttackPending.value = null;
}

function cellFromClientPoint(clientX: number, clientY: number): { x: number; y: number } | null {
  const el = document.elementFromPoint(clientX, clientY)?.closest("[data-cell-x]") as HTMLElement | null;
  if (!el) return null;
  const x = Number(el.dataset.cellX);
  const y = Number(el.dataset.cellY);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

function cellsInGridRect(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  width: number,
  height: number,
): { x: number; y: number }[] {
  const minX = Math.max(0, Math.min(x0, x1));
  const maxX = Math.min(width - 1, Math.max(x0, x1));
  const minY = Math.max(0, Math.min(y0, y1));
  const maxY = Math.min(height - 1, Math.max(y0, y1));
  const coords: { x: number; y: number }[] = [];
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) coords.push({ x, y });
  }
  return coords;
}

function finishMarqueeSelection(startClient: { x: number; y: number }, endClient: { x: number; y: number }) {
  const s = gameState.value;
  const occ = occupancy.value;
  if (!s || !occ) return;
  const startCell = cellFromClientPoint(startClient.x, startClient.y);
  const endCell = cellFromClientPoint(endClient.x, endClient.y);
  if (!startCell || !endCell) {
    clearGmBulkSelection();
    return;
  }
  const rectCells = cellsInGridRect(startCell.x, startCell.y, endCell.x, endCell.y, s.width, s.height);
  if (gmSelectTargetKind.value === "tiles") {
    setGmBulkSelection({ kind: "tiles", coords: rectCells });
    return;
  }
  if (gmSelectTargetKind.value === "players") {
    const ids = new Set<string>();
    for (const cell of rectCells) {
      const player = occ.playerByKey.get(coordKey(cell.x, cell.y));
      if (player) ids.add(player.id);
    }
    setGmBulkSelection(ids.size ? { kind: "players", ids: [...ids] } : null);
    return;
  }
  const ids = new Set<string>();
  for (const cell of rectCells) {
    const enemy = occ.enemyByKey.get(coordKey(cell.x, cell.y));
    if (enemy) ids.add(enemy.id);
  }
  setGmBulkSelection(ids.size ? { kind: "enemies", ids: [...ids] } : null);
}

function onMarqueePointerDown(e: PointerEvent) {
  if (props.role !== "gm" || gmActiveTool.value !== "select") return;
  if (e.button !== 0) return;
  const target = e.target as HTMLElement;
  if (target.closest(".reset-zoom-btn")) return;
  e.preventDefault();
  marqueeActive.value = true;
  marqueeStart.value = { x: e.clientX, y: e.clientY };
  marqueeEnd.value = { x: e.clientX, y: e.clientY };
  let didDrag = false;
  const onMove = (ev: PointerEvent) => {
    didDrag = true;
    marqueeEnd.value = { x: ev.clientX, y: ev.clientY };
  };
  const onUp = (_ev: PointerEvent) => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    marqueeActive.value = false;
    const start = marqueeStart.value;
    const end = marqueeEnd.value;
    marqueeStart.value = null;
    marqueeEnd.value = null;
    if (!start || !end) return;
    if (didDrag) finishMarqueeSelection(start, end);
  };
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
}

const marqueeOverlayStyle = computed(() => {
  if (!marqueeActive.value || !marqueeStart.value || !marqueeEnd.value || !viewportEl.value) return null;
  const rect = viewportEl.value.getBoundingClientRect();
  const x0 = marqueeStart.value.x - rect.left;
  const y0 = marqueeStart.value.y - rect.top;
  const x1 = marqueeEnd.value.x - rect.left;
  const y1 = marqueeEnd.value.y - rect.top;
  const left = Math.min(x0, x1);
  const top = Math.min(y0, y1);
  return {
    left: `${left}px`,
    top: `${top}px`,
    width: `${Math.abs(x1 - x0)}px`,
    height: `${Math.abs(y1 - y0)}px`,
  };
});

function tryGmDamageEffectToken(target: { kind: "player" | "enemy"; id: string }): boolean {
  if (props.role !== "gm" || gmActiveTool.value !== "damageEffect") return false;
  applyDamageEffectToToken(target);
  return true;
}

function onGmCellClick(x: number, y: number) {
  const s = gameState.value;
  if (!s) return;

  if (gmActiveTool.value === "damageEffect") {
    const occ = occupancy.value;
    const key = coordKey(x, y);
    const player = occ?.playerByKey.get(key);
    if (player) {
      applyDamageEffectToToken({ kind: "player", id: player.id });
      return;
    }
    const enemy = occ?.enemyByKey.get(key);
    if (enemy) {
      applyDamageEffectToToken({ kind: "enemy", id: enemy.id });
      return;
    }
    return;
  }

  if (gmActiveTool.value === "select") {
    if (!selectOccupantAt(x, y)) clearGmBulkSelection();
    return;
  }

  if (boardActionMode.value === "gmEnemyAttack") {
    if (handleGmEnemyAttackCellClick(x, y)) return;
    clearBoardActionMode();
    return;
  }

  if (selectOccupantAt(x, y)) return;

  const spawnName = selectedSpawnEnemyName.value;
  if (
    spawnName &&
    validateEnemyFootprint(
      s,
      x,
      y,
      getEnemyScaleByName(spawnName),
      undefined,
      occupancy.value ?? undefined,
    ) === null
  ) {
    send({ type: "addEnemy", x, y, name: spawnName });
    return;
  }

  if (tryMoveSelectedEnemy(x, y)) return;
  clearBoardSelection();
}

function tryPatternCellClick(x: number, y: number): boolean {
  if (!patternPreviewActive.value || !isDrawablePattern.value) return false;
  const s = gameState.value;
  if (!s) return false;
  return tryExtendDrawing({ x, y }, s.width, s.height);
}

function onCellClick(x: number, y: number) {
  if (tryPatternCellClick(x, y)) return;
  if (props.role === "gm") onGmCellClick(x, y);
  else onPlayerCellClick(x, y);
}

function onCellHover(x: number, y: number, key: string) {
  hoveredKey.value = key;
  hoveredCell.value = { x, y };
  setPatternHoverOrigin({ x, y });
}

function onCellUnhover() {
  hoveredKey.value = null;
  hoveredCell.value = null;
  setPatternHoverOrigin(null);
}

function onViewportClick(e: MouseEvent) {
  closeContextMenu();
  if ((e.target as HTMLElement).closest(".cell")) return;
  clearBoardSelection();
}

function onBoardDisplayClick(e: MouseEvent) {
  closeContextMenu();
  const target = e.target as HTMLElement;
  if (target.closest(".board-viewport, .reset-zoom-btn, .board-tooltip")) return;
  clearBoardSelection();
}

function removeEnemyById(enemyId: string) {
  send({ type: "removeEnemy", enemyId, entireSwarm: true });
  clearBoardSelection();
}

function removeSelectedEnemy() {
  if (!selectedEnemyId.value) return;
  removeEnemyById(selectedEnemyId.value);
}

function closeContextMenu() {
  contextMenu.value.open = false;
  contextMenu.value.items = [];
  contextMenu.value.enemyId = undefined;
  contextMenu.value.playerId = undefined;
  contextMenu.value.cellX = undefined;
  contextMenu.value.cellY = undefined;
}

function hasEffectStacks(unit: { effects?: EffectStacks } | undefined): boolean {
  if (!unit?.effects) return false;
  return Object.values(unit.effects).some((stacks) => stacks > 0);
}

function buildContextMenuItems(x: number, y: number): BoardContextMenuItem[] {
  const items: BoardContextMenuItem[] = [];
  const s = gameState.value;
  const occ = occupancy.value;
  const key = coordKey(x, y);
  const player = occ?.playerByKey.get(key);
  const enemy = occ?.enemyByKey.get(key);
  const attractor = s?.combat?.attractors?.find((a) => a.x === x && a.y === y);
  const tile = s ? tileAt(s.tiles, x, y) : undefined;
  const bulk = gmBulkSelection.value;
  const useBulk =
    props.role === "gm" &&
    !!bulk &&
    !!occ &&
    isCellInBulkSelection(x, y, occ);
  const countLabel = (n: number) => (useBulk && n > 1 ? ` (${n})` : "");

  if (useBulk && bulk.kind === "tiles") {
    const n = bulk.coords.length;
    items.push({ id: "change-tile-terrain", label: `Change terrain type${countLabel(n)}` });
    items.push({ id: "add-tile-effect", label: `Add tile effect${countLabel(n)}` });
    if (bulk.coords.some((c) => hasTileEffects(tileAt(s!.tiles, c.x, c.y)))) {
      items.push({ id: "clear-tile-effects", label: `Clear tile effects${countLabel(n)}`, danger: true });
    }
    return items;
  }

  if (useBulk && bulk.kind === "players") {
    const n = bulk.ids.length;
    items.push({ id: "add-effect", label: `Add effect${countLabel(n)}` });
    if (bulk.ids.some((id) => hasEffectStacks(s?.players.find((p) => p.id === id)))) {
      items.push({ id: "clear-effects", label: `Clear effects${countLabel(n)}`, danger: true });
    }
    return items;
  }

  if (useBulk && bulk.kind === "enemies") {
    const n = bulk.ids.length;
    items.push({ id: "add-effect", label: `Add effect${countLabel(n)}` });
    if (bulk.ids.some((id) => hasEffectStacks(s?.enemies.find((e) => e.id === id)))) {
      items.push({ id: "clear-effects", label: `Clear effects${countLabel(n)}`, danger: true });
    }
    items.push({ id: "remove-enemy", label: `Remove enemy${countLabel(n)}`, danger: true });
    return items;
  }

  const canRemoveAttractor =
    !!attractor &&
    (props.role === "gm" ||
      (props.role === "player" && yourPlayerId.value === attractor.ownerId));
  if (player || enemy) {
    items.push({ id: "add-effect", label: "Add effect" });
  }
  if (props.role === "gm") {
    items.push({ id: "change-tile-terrain", label: "Change terrain type" });
    items.push({ id: "add-tile-effect", label: "Add tile effect" });
    if (hasTileEffects(tile)) {
      items.push({ id: "clear-tile-effects", label: "Clear tile effects", danger: true });
    }
  }
  if (props.role === "gm" && hasEffectStacks(player ?? enemy)) {
    items.push({ id: "clear-effects", label: "Clear effects", danger: true });
  }
  if (props.role === "gm" && enemy) {
    items.push({ id: "remove-enemy", label: "Remove enemy", danger: true });
  }
  if (canRemoveAttractor) {
    items.push({ id: "remove-attractor", label: "Remove attractors", danger: true });
  }
  return items;
}

function onBoardContextMenu(e: MouseEvent) {
  if (!gameState.value) return;
  e.preventDefault();

  const cell = (e.target as HTMLElement).closest("[data-cell-x]") as HTMLElement | null;
  if (!cell) {
    closeContextMenu();
    return;
  }

  const x = Number(cell.dataset.cellX);
  const y = Number(cell.dataset.cellY);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;

  const items = buildContextMenuItems(x, y);
  if (items.length === 0) {
    closeContextMenu();
    return;
  }

  const occ = occupancy.value;
  const key = coordKey(x, y);
  const player = occ?.playerByKey.get(key);
  const enemy = occ?.enemyByKey.get(key);
  const inBulk =
    props.role === "gm" &&
    !!gmBulkSelection.value &&
    !!occ &&
    isCellInBulkSelection(x, y, occ);
  if (!inBulk) {
    if (enemy) selectBoardEnemy(enemy.id);
    else if (player) selectBoardPlayer(player.id, player.characterSheetId);
  }

  contextMenu.value = {
    open: true,
    x: e.clientX,
    y: e.clientY,
    items,
    enemyId: enemy?.id,
    playerId: player?.id,
    cellX: x,
    cellY: y,
  };
}

function onContextMenuSelect(id: string) {
  const bulk = gmBulkSelection.value;
  const occ = occupancy.value;
  const cellX = contextMenu.value.cellX;
  const cellY = contextMenu.value.cellY;
  const useBulk =
    !!bulk &&
    cellX != null &&
    cellY != null &&
    !!occ &&
    isCellInBulkSelection(cellX, cellY, occ);

  if (id === "add-effect") {
    if (useBulk && (bulk.kind === "players" || bulk.kind === "enemies")) {
      effectModalBulkTargets.value = bulk.ids.map((targetId) => ({
        kind: bulk.kind === "players" ? "player" : "enemy",
        id: targetId,
      }));
      effectModalTarget.value = null;
      effectModalOpen.value = true;
      closeContextMenu();
      return;
    }
    const enemyId = contextMenu.value.enemyId;
    const playerId = contextMenu.value.playerId;
    effectModalBulkTargets.value = undefined;
    if (enemyId) {
      effectModalTarget.value = { kind: "enemy", id: enemyId };
    } else if (playerId) {
      effectModalTarget.value = { kind: "player", id: playerId };
    }
    effectModalOpen.value = true;
    closeContextMenu();
    return;
  }
  if (id === "clear-effects") {
    if (useBulk && (bulk.kind === "players" || bulk.kind === "enemies")) {
      for (const targetId of bulk.ids) {
        send({
          type: "clearEffects",
          target: { kind: bulk.kind === "players" ? "player" : "enemy", id: targetId },
        });
      }
      closeContextMenu();
      return;
    }
    const enemyId = contextMenu.value.enemyId;
    const playerId = contextMenu.value.playerId;
    if (enemyId) {
      send({ type: "clearEffects", target: { kind: "enemy", id: enemyId } });
    } else if (playerId) {
      send({ type: "clearEffects", target: { kind: "player", id: playerId } });
    }
    closeContextMenu();
    return;
  }
  if (id === "add-tile-effect") {
    if (useBulk && bulk.kind === "tiles") {
      tileEffectModalBulkCoords.value = bulk.coords;
      tileEffectModalCoords.value = null;
      tileEffectModalOpen.value = true;
      closeContextMenu();
      return;
    }
    const x = contextMenu.value.cellX;
    const y = contextMenu.value.cellY;
    if (x != null && y != null) {
      tileEffectModalBulkCoords.value = undefined;
      tileEffectModalCoords.value = { x, y };
      tileEffectModalOpen.value = true;
    }
    closeContextMenu();
    return;
  }
  if (id === "change-tile-terrain") {
    if (useBulk && bulk.kind === "tiles") {
      tileTerrainModalBulkCoords.value = bulk.coords;
      tileTerrainModalCoords.value = null;
      tileTerrainModalOpen.value = true;
      closeContextMenu();
      return;
    }
    const x = contextMenu.value.cellX;
    const y = contextMenu.value.cellY;
    if (x != null && y != null) {
      tileTerrainModalBulkCoords.value = undefined;
      tileTerrainModalCoords.value = { x, y };
      tileTerrainModalOpen.value = true;
    }
    closeContextMenu();
    return;
  }
  if (id === "clear-tile-effects") {
    if (useBulk && bulk.kind === "tiles") {
      for (const coords of bulk.coords) {
        send({ type: "clearTileEffects", x: coords.x, y: coords.y });
      }
      closeContextMenu();
      return;
    }
    const x = contextMenu.value.cellX;
    const y = contextMenu.value.cellY;
    if (x != null && y != null) {
      send({ type: "clearTileEffects", x, y });
    }
    closeContextMenu();
    return;
  }
  if (id === "remove-enemy") {
    if (useBulk && bulk.kind === "enemies") {
      for (const enemyId of bulk.ids) removeEnemyById(enemyId);
      closeContextMenu();
      return;
    }
    if (contextMenu.value.enemyId) {
      removeEnemyById(contextMenu.value.enemyId);
    }
    closeContextMenu();
    return;
  }
  if (id === "remove-attractor") {
    const x = contextMenu.value.cellX;
    const y = contextMenu.value.cellY;
    if (x != null && y != null) {
      send({ type: "removeAttractor", x, y });
    }
    closeContextMenu();
    return;
  }
  closeContextMenu();
}

function endEnemyTurn(enemyId: string): boolean {
  const s = gameState.value;
  if (!s) return false;
  const enemy = s.enemies.find((e) => e.id === enemyId);
  if (!enemy || enemy.exhausted || isTowerEnemy(enemy) || !canGmMoveEnemies(s)) return false;
  send({ type: "gmEnemyAction", action: { action: "exhaust", enemyId: enemy.id } });
  return true;
}

function tryEndGmTokenTurn(): boolean {
  const id = selectedEnemyId.value;
  if (!id) return false;
  return endEnemyTurn(id);
}

function tryEndPlayerTurn(): boolean {
  const s = gameState.value;
  const id = yourPlayerId.value;
  if (!s || !id || props.role !== "player") return false;
  if (s.roundPhase !== "playerTurn") return false;
  if (s.turn?.role !== "player" || s.turn.playerId !== id) return false;
  send({ type: "phaseAction", action: "endPlayerTurn" });
  return true;
}

function onKeydown(e: KeyboardEvent) {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
    return;
  }

  if (e.key === "e" && e.ctrlKey && !e.metaKey && !e.altKey) {
    if (props.role === "gm" && tryEndGmTokenTurn()) {
      e.preventDefault();
      return;
    }
    if (tryEndPlayerTurn()) {
      e.preventDefault();
      return;
    }
  }

  if ((e.key === "r" || e.key === "R") && !e.metaKey && !e.ctrlKey && !e.altKey) {
    if (patternPreviewActive.value && selectedPattern.value?.directional) {
      e.preventDefault();
      cyclePatternDirection();
      return;
    }
    const mode = boardActionMode.value;
    if (
      mode === "attack" ||
      mode === "omnistrike" ||
      mode === "equipmentCorridor" ||
      mode === "equipmentForceProjection" ||
      mode === "equipmentRedirect" ||
      mode === "varunastraBorrow"
    ) {
      if (mode === "omnistrike" && omnistrikeStep.value === "selectBombs") return;
      if (mode === "equipmentRedirect" && redirectStep.value === "selectAttack") {
        const s = gameState.value;
        const sourceId = redirectSourceEnemyId.value;
        if (s && sourceId) {
          const source = s.enemies.find((e) => e.id === sourceId);
          if (source?.name) {
            const indices = listRedirectableEnemyAttackIndices(source.name);
            const cur = redirectAttackIndex.value ?? indices[0]!;
            const pos = indices.indexOf(cur);
            redirectAttackIndex.value = indices[(pos + 1) % indices.length]!;
          }
        }
        e.preventDefault();
        return;
      }
      e.preventDefault();
      rotateAttackDirection();
      if (mode === "attack" || mode === "equipmentForceProjection") {
        const ctx = attackContext.value;
        if (ctx && !usesAnchoredPatternPlacement(ctx.spec)) attackAimed.value = true;
      } else if (mode === "equipmentRedirect" && redirectStep.value === "confirmPattern") {
        attackAimed.value = true;
      } else if (mode === "varunastraBorrow") {
        const ctx = borrowContext.value;
        if (ctx && !usesAnchoredPatternPlacement(ctx.spec)) attackAimed.value = true;
      }
      return;
    }
  }

  if (contextMenu.value.open && e.key === "Escape") {
    e.preventDefault();
    closeContextMenu();
    return;
  }

  if (props.role === "gm") {
    if (e.key === "Escape") {
      if (gmActiveTool.value || gmBulkSelection.value) {
        clearActiveTool();
        return;
      }
      if (selectedSpawnEnemyName.value) {
        clearSpawnEnemySelection();
        return;
      }
      clearBoardSelection();
      return;
    }
    if ((e.key === "Delete" || e.key === "Backspace") && selectedEnemyId.value) {
      e.preventDefault();
      removeSelectedEnemy();
      return;
    }
    const selected = selectedEnemyId.value;
    const s = gameState.value;
    if (selected && s) {
      const enemy = s.enemies.find((e) => e.id === selected);
      if (enemy) {
        const anchor = arrowTarget(e.key, enemy);
        if (anchor) {
          e.preventDefault();
          tryMoveSelectedEnemyToDest(anchor.x, anchor.y);
        }
      }
    }
    return;
  }

  const me = yourPlayer.value;
  if (!me) return;
  const t = arrowTarget(e.key, me);
  if (!t) return;
  e.preventDefault();
  tryMove(t.x, t.y);
}

onMounted(() => {
  void loadSheets();
  window.addEventListener("keydown", onKeydown);
});

watch(viewportEl, (el, prev) => {
  observeViewport(el, prev);
});

onUnmounted(() => {
  if (previewHoverTimer) clearTimeout(previewHoverTimer);
  if (teleportFinishTimer) clearTimeout(teleportFinishTimer);
  if (enemyMoveFinishTimer) clearTimeout(enemyMoveFinishTimer);
  window.removeEventListener("keydown", onKeydown);
  overlayInsetObserver?.disconnect();
  disconnectViewport();
});
</script>

<template>
  <div class="game-board">
    <div v-if="gameState" class="board-display" @click="onBoardDisplayClick">
      <div
        ref="viewportEl"
        class="board-viewport"
        @pointerdown="onMarqueePointerDown"
        @click="onViewportClick"
        @contextmenu="onBoardContextMenu"
        @wheel.prevent="onWheel"
      >
        <div
          v-if="marqueeOverlayStyle"
          class="marquee-overlay"
          :style="marqueeOverlayStyle"
          aria-hidden="true"
        />
        <div class="board-stage" :style="stageStyle">
          <div class="board" :style="gridStyle">
            <BoardCell
                v-for="row in boardCellRows"
                :key="row.key"
                v-memo="[
                  row.cell,
                  row.isHovered,
                  draggingDeploy,
                  row.isPlayerSelected,
                  row.isEnemySelected,
                  row.isBulkTileSelected,
                  row.playerHp,
                  row.enemyHp,
                  row.enemyDying,
                  showHealthBars,
                  showEnemyHealthBars,
                  row.enemyAnimating,
                  row.playerTeleporting,
                  row.enemyPendingRemoval,
                  row.enemyDefeated,
                ]"
                :x="row.x"
                :y="row.y"
                :cell="row.cell"
                :is-hovered="row.isHovered"
                :dragging-deploy="draggingDeploy"
                :can-drag-deploy="row.canDragDeploy"
                :is-player-selected="row.isPlayerSelected"
                :is-enemy-selected="row.isEnemySelected"
                :is-bulk-tile-selected="row.isBulkTileSelected"
                :player-hue="row.playerHue"
                :show-health-bars="showHealthBars"
                :show-enemy-health-bars="showEnemyHealthBars"
                :enemy-dying="row.enemyDying"
                :enemy-defeated="row.enemyDefeated"
                :player-teleporting="row.playerTeleporting"
                :enemy-animating="row.enemyAnimating"
                @click="onCellClick(row.x, row.y)"
                @hover="onCellHover(row.x, row.y, row.key)"
                @unhover="onCellUnhover"
                @player-click="onBoardPlayerClick(row.x, row.y, row.cell.player!.id, row.cell.player!.characterSheetId)"
                @enemy-click="onEnemyCellClick(row.x, row.y, row.cell.enemyAnchor!.id)"
                @enemy-dblclick="onEnemyCellDblClick(row.x, row.y, row.cell.enemyAnchor!.id)"
                @deploy-pointer-down="onDeployPointerDown($event, row.cell.player!)"
              />
          </div>
        </div>

        <div v-if="tooltipData" class="board-tooltip popover-tooltip" :style="tooltipStyle ?? undefined">
          <div class="tooltip-section">
            <span class="tooltip-row">({{ tooltipData.x }}, {{ tooltipData.y }})</span>
            <span class="tooltip-row">Terrain: {{ terrainTooltipLabel(tooltipData.tile.terrain) }}</span>
            <span class="tooltip-row">Elevation: {{ tooltipData.tile.elevation }}</span>
          </div>
          <div v-if="tooltipData.players.length" class="tooltip-section">
            <span class="tooltip-heading">Players</span>
            <div v-for="player in tooltipData.players" :key="player.id" class="tooltip-unit">
              <span class="tooltip-row">
                {{ playerLabel(player) }} · HP {{ formatHp(player.hp, getPlayerMaxHp(player)) }}
              </span>
              <span
                v-for="effect in effectEntries(player.effects)"
                :key="effect.id"
                class="tooltip-row tooltip-effect"
              >
                {{ effectTooltipLabel(effect.id, effect.stacks) }}
              </span>
            </div>
          </div>
          <div v-if="tooltipData.towers.length" class="tooltip-section">
            <span class="tooltip-heading">Towers</span>
            <div v-for="tower in tooltipData.towers" :key="tower.id" class="tooltip-unit">
              <span class="tooltip-row">
                {{ enemyLabel(tower) }}<template v-if="props.role === 'gm'"> · HP {{ formatHp(tower.hp, getEnemyMaxHp(tower)) }}</template>
              </span>
            </div>
          </div>
          <div v-if="tooltipData.enemies.length" class="tooltip-section">
            <span class="tooltip-heading">Enemies</span>
            <div v-for="enemy in tooltipData.enemies" :key="enemy.id" class="tooltip-unit">
              <span class="tooltip-row">
                {{ enemy.displayName }}<template v-if="props.role === 'gm'"> · HP {{ formatHp(enemy.displayHp, enemy.displayMaxHp) }}</template>
              </span>
              <span
                v-for="effect in effectEntries(enemy.effects)"
                :key="effect.id"
                class="tooltip-row tooltip-effect"
              >
                {{ effectTooltipLabel(effect.id, effect.stacks) }}
              </span>
            </div>
          </div>
          <div v-if="tooltipData.attractors.length" class="tooltip-section">
            <span class="tooltip-heading">Attractors</span>
            <span
              v-for="attractor in tooltipData.attractors"
              :key="attractor.id"
              class="tooltip-row"
            >
              {{ attractorTooltipLabel(attractor) }}
            </span>
          </div>
          <div v-if="tooltipData.objects.length" class="tooltip-section">
            <span class="tooltip-heading">Objects</span>
            <span
              v-for="object in tooltipData.objects"
              :key="object.id"
              class="tooltip-row"
            >
              {{ terrainObjectLabel(object) }}
            </span>
          </div>
          <div v-if="effectEntries(tooltipData.tile.tileEffects).length" class="tooltip-section">
            <span class="tooltip-heading">Tile effects</span>
            <span
              v-for="effect in effectEntries(tooltipData.tile.tileEffects)"
              :key="effect.id"
              class="tooltip-row tooltip-effect"
            >
              {{ formatTileEffectTooltipLabel(effect.id, effect.stacks) }}
            </span>
          </div>
        </div>

        <div
          v-for="indicator in damageIndicators"
          :key="indicator.id"
          class="damage-indicator"
          :style="damageIndicatorStyle(indicator.x, indicator.y)"
        >
          <span class="damage-indicator-text">-{{ indicator.amount }}</span>
        </div>

        <div
          v-if="enemyMoveOverlayStyle"
          class="enemy-move-overlay"
          :class="{
            'enemy-move-overlay-animating': enemyMoveOverlayAtDest,
            'has-portrait': !!enemyMoveOverlayPortraitUrl,
            'fortification-overlay': enemyMoveOverlayIsFortification,
          }"
          :style="[
            enemyMoveOverlayStyle,
            enemyMoveOverlayBg ? { background: enemyMoveOverlayBg } : undefined,
          ]"
          @transitionend="onEnemyMoveOverlayTransitionEnd"
        >
          <img
            v-if="enemyMoveOverlayPortraitUrl"
            :src="enemyMoveOverlayPortraitUrl"
            alt=""
            class="portrait-img"
          />
        </div>

        <div
          v-if="teleportOverlayStyle && teleportOverlayPlayer"
          class="teleport-overlay"
          :class="{ 'teleport-overlay-animating': teleportOverlayAtDest }"
          :style="[
            teleportOverlayStyle,
            !teleportOverlayPlayer.characterSheetId || !portraitUrlFor(teleportOverlayPlayer.characterSheetId)
              ? { background: `hsl(${hueFromId(teleportOverlayPlayer.id)} 70% 45%)` }
              : undefined,
          ]"
          @transitionend="onTeleportOverlayTransitionEnd"
        >
          <img
            v-if="teleportOverlayPlayer.characterSheetId && portraitUrlFor(teleportOverlayPlayer.characterSheetId)"
            :src="portraitUrlFor(teleportOverlayPlayer.characterSheetId)!"
            alt=""
            class="portrait-img"
          />
        </div>
      </div>
      <button v-if="isTransformed" class="reset-zoom-btn" type="button" @click="fitToView(true)">
        Reset zoom
      </button>
    </div>

    <p v-else class="loading">Loading board…</p>

    <BoardContextMenu
      :open="contextMenu.open"
      :x="contextMenu.x"
      :y="contextMenu.y"
      :items="contextMenu.items"
      @select="onContextMenuSelect"
      @close="closeContextMenu"
    />

    <AddEffectModal
      :open="effectModalOpen"
      :target="effectModalTarget"
      :bulk-targets="effectModalBulkTargets"
      @close="effectModalOpen = false; effectModalBulkTargets = undefined"
    />

    <AddTileEffectModal
      :open="tileEffectModalOpen"
      :coords="tileEffectModalCoords"
      :bulk-coords="tileEffectModalBulkCoords"
      @close="tileEffectModalOpen = false; tileEffectModalBulkCoords = undefined"
    />

    <ChangeTileTerrainModal
      :open="tileTerrainModalOpen"
      :coords="tileTerrainModalCoords"
      :bulk-coords="tileTerrainModalBulkCoords"
      @close="tileTerrainModalOpen = false; tileTerrainModalBulkCoords = undefined"
    />

    <BreakerPromptModal
      :open="breakerPromptOpen"
      :sethian-hint="breakerSethianHint"
      @close="onBreakerCancel"
      @confirm="onBreakerConfirm"
    />

    <ProvokePromptModal
      :open="provokePromptOpen"
      :triggers="provokeTriggers"
      @close="onProvokeCancel"
      @confirm="onProvokeConfirm"
    />

    <SwarmChipModal
      :open="swarmChipOpen"
      :enemy-name="swarmChipEnemyName"
      :targets="swarmChipTargets"
      @close="onSwarmChipClose"
      @confirm="onSwarmChipConfirm"
    />

    <GmSwarmAttackModal
      v-if="swarmAttackModalProps"
      :open="swarmAttackModalOpen"
      :enemy-id="swarmAttackModalProps.enemyId"
      :attack-index="swarmAttackModalProps.attackIndex"
      :attack-text="swarmAttackModalProps.attackText"
      :target-player-id="swarmAttackModalProps.targetPlayerId"
      :target-player-name="swarmAttackModalProps.targetPlayerName"
      :max-strikes="swarmAttackModalProps.maxStrikes"
      :damage-override="swarmAttackModalProps.damageOverride"
      @close="onSwarmAttackClose"
      @confirm="onSwarmAttackConfirm"
    />
  </div>
</template>

<style scoped>
.game-board {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  width: 100%;
}

.board-display {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.board-viewport {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.marquee-overlay {
  position: absolute;
  z-index: 10;
  pointer-events: none;
  border: 1px dashed var(--color-accent-bright);
  background: var(--color-accent-subtle-bg);
  opacity: 0.45;
}

.reset-zoom-btn {
  position: absolute;
  bottom: 0.75rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 2;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg-board);
  color: var(--color-text);
  padding: 0.35rem 0.75rem;
  font-size: 0.8rem;
  cursor: pointer;
}

.reset-zoom-btn:hover {
  background: var(--color-surface);
  border-color: var(--color-accent-muted);
}

.board-stage {
  transform-origin: 0 0;
  will-change: transform;
}

.board {
  width: fit-content;
  display: grid;
  gap: 3px;
  aspect-ratio: v-bind(boardAspectRatio);
}

.board-tooltip {
  position: absolute;
  white-space: nowrap;
  z-index: 3;
}

.teleport-overlay {
  position: absolute;
  z-index: 5;
  pointer-events: none;
  border-radius: 50%;
  overflow: hidden;
  background: var(--color-surface);
  transition: left 350ms ease, top 350ms ease;
}

.teleport-overlay .portrait-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  border-radius: 50%;
}

.enemy-move-overlay {
  position: absolute;
  z-index: 5;
  pointer-events: none;
  border-radius: 50%;
  background: var(--color-enemy-piece);
  box-sizing: border-box;
  transition: left 350ms ease, top 350ms ease;
  overflow: hidden;
}

.enemy-move-overlay.has-portrait {
  background: linear-gradient(to top, var(--color-on-dark) 0%, transparent 50%), var(--color-surface-raised);
}

.enemy-move-overlay.fortification-overlay {
  border-radius: 4px;
}

.enemy-move-overlay .portrait-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
  border-radius: 50%;
}

.enemy-move-overlay.fortification-overlay .portrait-img {
  border-radius: 4px;
}

.damage-indicator {
  position: absolute;
  z-index: 4;
  pointer-events: none;
}

.damage-indicator-text {
  display: inline-block;
  font-size: 1.7rem;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  color: var(--color-danger);
  text-shadow: var(--shadow-text);
  opacity: 0;
  animation: damage-indicator 2s ease-in-out forwards;
}

@keyframes damage-indicator {
  0% {
    opacity: 0;
    transform: translateY(var(--damage-rise, 10px));
  }
  12% {
    opacity: 1;
    transform: translateY(0);
  }
  75% {
    opacity: 1;
    transform: translateY(0);
  }
  100% {
    opacity: 0;
    transform: translateY(0);
  }
}

.tooltip-section + .tooltip-section {
  margin-top: 0.35rem;
  padding-top: 0.35rem;
  border-top: 1px solid var(--color-border);
}

.tooltip-heading {
  display: block;
  margin-bottom: 0.15rem;
  color: var(--color-muted);
  text-transform: uppercase;
  font-family: inherit;
  font-size: 0.65rem;
  font-weight: 600;
  letter-spacing: 0.04em;
}

.tooltip-row {
  display: block;
}

.tooltip-unit + .tooltip-unit {
  margin-top: 0.35rem;
}

.tooltip-effect {
  padding-left: 0.5rem;
  color: var(--color-muted);
  font-size: 0.72rem;
}
</style>
