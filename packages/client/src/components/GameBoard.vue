<script setup lang="ts">
import type { EffectStacks, Enemy, MapTile, PatternDirection, Player, TerrainObject } from "@gaem/shared";
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
  OMNISTRIKE_DIRECTION,
  previewPlayerAttack,
  PATTERN_DIRECTIONS,
  rangeAttackTileKeys,
  rangeTargetDistance,
  rangeTargetMax,
  rangedPatternPlacementKeys,
  recoilTilesInBounds,
  resolveCombatAttackSpec,
  tileAt,
  usesAnchoredPatternPlacement,
  validateEnemyFootprint,
  warhookAdjacentLandingTiles,
  warhookNearestLandings,
  warhookRangeKeys,
  warhookValidTargetKeys,
  isWarhookTargetAt,
} from "@gaem/shared";
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from "vue";

import { useBoardActionMode } from "../composables/useBoardActionMode.js";
import { useCombatActions } from "../composables/useCombatActions.js";
import { useBoardSelection } from "../composables/useBoardSelection.js";
import { useBoardViewport } from "../composables/useBoardViewport.js";
import { useDamageIndicators } from "../composables/useDamageIndicators.js";
import { useEnemyDeathAnimations } from "../composables/useEnemyDeathAnimations.js";
import { usePlayerTeleportAnimation } from "../composables/usePlayerTeleportAnimation.js";
import { useCharacterSheetSelection } from "../composables/useCharacterSheetSelection.js";
import { useCharacterSheets } from "../composables/useCharacterSheets.js";
import { useEnemySpawnSelection } from "../composables/useEnemySpawnSelection.js";
import { useGameSocket } from "../composables/useGameSocket.js";
import { showToast } from "../composables/useToasts.js";
import { usePortraitCache } from "../composables/usePortraitCache.js";
import { useGameState } from "../composables/useGameState.js";
import { useInfoDataSelection } from "../composables/useInfoDataSelection.js";
import { usePatternSelection } from "../composables/usePatternSelection.js";
import { usePlayerSettings } from "../composables/usePlayerSettings.js";
import BoardCell, { type CellRenderState } from "./BoardCell.vue";
import BoardContextMenu, { type BoardContextMenuItem } from "./BoardContextMenu.vue";
import AddEffectModal from "./AddEffectModal.vue";

const props = defineProps<{
  role: "gm" | "player";
  playerProfile?: { id: string; name: string } | null;
}>();

const wsUrl =
  import.meta.env.VITE_WS_URL ??
  (import.meta.env.DEV
    ? `ws://${location.hostname}:3001/ws`
    : `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/ws`);

const { selectedSheetId } = useCharacterSheetSelection();
const {
  boardSelection,
  selectedEnemyId,
  clearBoardSelection,
  selectBoardPlayer,
  selectBoardEnemy,
  isPlayerSelected,
  isEnemySelected,
} = useBoardSelection();

const selectedPlayerId = computed(() =>
  boardSelection.value?.kind === "player" ? boardSelection.value.id : null,
);
const { gameState, yourPlayerId } = useGameState();
const activePlayerSelected = computed(
  () => !!yourPlayerId.value && selectedPlayerId.value === yourPlayerId.value,
);
const { showHealthBars } = usePlayerSettings();
const showEnemyHealthBars = computed(() => showHealthBars.value && props.role === "gm");
const { indicators: damageIndicators } = useDamageIndicators(gameState);
const { sheets, loadSheets } = useCharacterSheets();
const boardPlayers = computed(() => gameState.value?.players);
const { portraitUrlFor } = usePortraitCache(sheets, boardPlayers);
const { dataCategory } = useInfoDataSelection();
const { selectedSpawnEnemyName, clearSpawnEnemySelection } = useEnemySpawnSelection();
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
  clearMode: clearBoardActionMode,
} = useBoardActionMode();
const { sendPlayerAction, sendMovePath } = useCombatActions();

const hoveredKey = ref<string | null>(null);
const hoveredCell = ref<{ x: number; y: number } | null>(null);
const draggingDeploy = ref(false);
const contextMenu = ref<{
  open: boolean;
  x: number;
  y: number;
  items: BoardContextMenuItem[];
  enemyId?: string;
  playerId?: string;
}>({ open: false, x: 0, y: 0, items: [] });
const effectModalOpen = ref(false);
const effectModalTarget = ref<{ kind: "player" | "enemy"; id: string } | null>(null);
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
);

const playerProfileRef = computed(() => props.playerProfile ?? null);

const { send, connect, disconnect: disconnectSocket } = useGameSocket({
  wsUrl,
  role: computed(() => props.role),
  playerProfile: playerProfileRef,
  selectedSheetId,
  onError: (message) => {
    showToast(message);
  },
  onSelectionInvalidated: (msg) => {
    const selection = boardSelection.value;
    if (
      selection?.kind === "enemy" &&
      !msg.state.enemies.some((e) => e.id === selection.id)
    ) {
      clearBoardSelection();
    } else if (
      selection?.kind === "player" &&
      !msg.state.players.some((p) => p.id === selection.id)
    ) {
      clearBoardSelection();
    }
  },
});

function finalizeDefeatedEnemy(enemyId: string) {
  send({ type: "removeEnemy", enemyId });
}

const { isEnemyDying, dyingEnemyIds } = useEnemyDeathAnimations(gameState, finalizeDefeatedEnemy);
const {
  active: teleportAnimation,
  teleportingPlayerIds,
  startTeleport,
  finishTeleport,
} = usePlayerTeleportAnimation(gameState);
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
  cellsCache.value = out;
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

const combatTargetHeal = computed(() => {
  if (boardActionMode.value === "rez") return true;
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

const ANCHORED_ATTACK_DIRECTION: PatternDirection = "e";

const anchoredPlacementPreview = computed(() => {
  if (boardActionMode.value !== "attack") return null;
  const ctx = attackContext.value;
  const s = gameState.value;
  if (!ctx || !s || !usesAnchoredPatternPlacement(ctx.spec)) return null;
  const anchor = attackAimed.value ? attackAnchor.value : hoveredCell.value;
  if (!anchor) return null;
  return evaluateAnchoredPatternPlacement(
    ctx.me,
    anchor,
    ctx.spec,
    ANCHORED_ATTACK_DIRECTION,
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
  const anchor = hoveredCell.value;
  if (!anchor) return null;

  if (step === "placeFirst") {
    return evaluateOmnistrikePlacement(
      ctx.me,
      anchor,
      ctx.bombA,
      OMNISTRIKE_DIRECTION,
      s,
      ctx.combinedSpan,
    );
  }

  const firstAnchor = omnistrikeAnchors.value[0];
  if (!firstAnchor) return null;
  const firstTiles = collectBombPatternTiles(s, firstAnchor, ctx.bombA, OMNISTRIKE_DIRECTION);
  return evaluateOmnistrikePlacement(
    ctx.me,
    anchor,
    ctx.bombB,
    OMNISTRIKE_DIRECTION,
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
  return coordsToKeySet(collectBombPatternTiles(s, anchor, ctx.bombA, OMNISTRIKE_DIRECTION));
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
  const tilesA = collectBombPatternTiles(s, anchorA, ctx.bombA, OMNISTRIKE_DIRECTION);
  const tilesB = collectBombPatternTiles(s, anchorB, ctx.bombB, OMNISTRIKE_DIRECTION);
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

const combatAttackInvalidKeys = computed(() => {
  if (attackAimed.value) return new Set<string>();
  const preview = anchoredPlacementPreview.value;
  if (!preview) return new Set<string>();
  if (preview.tooFar) return coordsToKeySet(preview.patternTiles);
  return preview.tooCloseKeys;
});

const attackContext = computed(() => {
  const me = yourPlayer.value;
  if (boardActionMode.value !== "attack" || !me?.weapon) return null;
  const spec = resolveCombatAttackSpec(me, me.weapon);
  if (!spec) return null;
  return { me, weapon: me.weapon, spec };
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
  const map = new Map<PatternDirection, Set<string>>();
  for (const direction of PATTERN_DIRECTIONS) {
    map.set(direction, coordsToKeySet(previewPlayerAttack(s, ctx.me.id, direction, ctx.weapon)));
  }
  return map;
});

const combatAttackPrimaryKeys = computed(() => {
  if (boardActionMode.value !== "attack") return new Set<string>();
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
  if (!ctx || !s) {
    return new Set<string>();
  }

  if (isRangeTargetAttack(ctx.spec)) {
    return rangeAttackTileKeys(
      s,
      ctx.me,
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
      return rangedPatternPlacementKeys(s, ctx.me, ctx.spec.rangeSpan);
    }
    return rangeAttackTileKeys(s, ctx.me, ctx.spec.range!);
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
  if (tile.terrain.includes("cover")) return "cover";
  if (tile.terrain.includes("uneasy")) return "uneasy";
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
  if (!enemy || enemy.exhausted) return keys;
  if (s.enforceTurns !== false) {
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

  const playerCanMove =
    props.role === "player" &&
    !!yourPlayerId.value &&
    canPlayerMove(s, yourPlayerId.value);
  const isDeployment = s.roundPhase === "deployment";
  const unlimitedMove = s.enforceActionLimits === false;
  const sandboxTurns = s.enforceTurns === false;
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
    (!sandboxTurns || onPlayerTurn || inMoveMode || inSprintMode);
  const me = yourPlayer.value;
  const movementRemaining = me?.actionBudget?.movementRemaining ?? 0;
  const sprintRemaining = me?.actionBudget?.sprintRemaining ?? 0;

  for (const c of cells.value) {
    const tile = tileAt(s.tiles, c.x, c.y);
    const player = occ.playerByKey.get(coordKey(c.x, c.y));
    const enemy = occ.enemyByKey.get(coordKey(c.x, c.y));
    const enemyAnchor = occ.enemyAnchorByKey.get(coordKey(c.x, c.y));

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
      stepBase && !inSprintMode && stepCost <= movementRemaining && movementRemaining > 0;
    const showSprintStep = stepBase && inSprintMode && stepCost <= sprintRemaining && sprintRemaining > 0;

    map.set(c.key, {
      terrainClass: terrainClass(tile),
      movable:
        activePlayerSelected.value &&
        playerCanMove &&
        !isDeployment &&
        isWalkable(tile) &&
        !player &&
        !enemy &&
        unlimitedMove &&
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
      patternPrimary: patternPrimaryKeys.value.has(coordKey(c.x, c.y)),
      patternSecondary: patternSecondaryKeys.value.has(coordKey(c.x, c.y)),
      combatTargetPrimary:
        combatAttackPrimaryKeys.value.has(coordKey(c.x, c.y)) ||
        omnistrikePrimaryKeys.value.has(coordKey(c.x, c.y)) ||
        warhookPrimaryKeys.value.has(coordKey(c.x, c.y)) ||
        combatAttackSelectedKeys.value.has(coordKey(c.x, c.y)),
      combatTargetSecondary:
        combatAttackSecondaryKeys.value.has(coordKey(c.x, c.y)) ||
        omnistrikeSecondaryKeys.value.has(coordKey(c.x, c.y)) ||
        warhookSecondaryKeys.value.has(coordKey(c.x, c.y)) ||
        rezTargetKeys.value.has(coordKey(c.x, c.y)),
      combatTargetHeal: combatTargetHeal.value,
      combatTargetInvalid:
        combatAttackInvalidKeys.value.has(coordKey(c.x, c.y)) ||
        omnistrikeInvalidKeys.value.has(coordKey(c.x, c.y)),
      patternRecoil: patternRecoilKeys.value.has(coordKey(c.x, c.y)),
      tile,
      player,
      enemyAnchor,
      effectStacks: player?.effects ?? enemyAnchor?.effects,
      turnEnded: player
        ? s.roundPhase !== "deployment" && s.actedPlayerIds.includes(player.id)
        : enemy?.exhausted ?? false,
      playerDowned: player ? isPlayerDowned(player) : false,
      playerPortraitUrl: player?.characterSheetId
        ? portraitUrlFor(player.characterSheetId)
        : null,
    });
  }
  return map;
});

const tooltipData = computed(() => {
  const cell = hoveredCell.value;
  const s = gameState.value;
  const occ = occupancy.value;
  if (!cell || !s || !occ) return null;
  const key = coordKey(cell.x, cell.y);
  const tile = tileAt(s.tiles, cell.x, cell.y);
  if (!tile) return null;
  return {
    x: cell.x,
    y: cell.y,
    tile,
    players: occ.playerByKey.has(key) ? [occ.playerByKey.get(key)!] : [],
    enemies: occ.enemyByKey.has(key) ? [occ.enemyByKey.get(key)!] : [],
    objects: occ.terrainObjectsByKey.get(key) ?? [],
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

function playerLabel(player: Player): string {
  return player.nickname ?? player.id;
}

function enemyLabel(enemy: Enemy): string {
  return enemy.name ?? "Enemy";
}

function terrainObjectLabel(object: TerrainObject): string {
  return object.name ?? "Object";
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
  return `${id}: ${stacks}`;
}

function gmEnemyMoveAnchorAt(x: number, y: number): { x: number; y: number } | null {
  const s = gameState.value;
  const id = selectedEnemyId.value;
  if (!s || !id) return null;
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

function tryMoveSelectedEnemyToAnchor(anchorX: number, anchorY: number): boolean {
  const s = gameState.value;
  const selected = selectedEnemyId.value;
  if (!s || !selected) return false;
  const enemy = s.enemies.find((e) => e.id === selected);
  if (!enemy) {
    clearBoardSelection();
    return false;
  }
  if (!canGmMoveEnemies(s)) return false;
  const scale = getEnemyScale(enemy);
  if (validateEnemyFootprint(s, anchorX, anchorY, scale, selected, occupancy.value ?? undefined) !== null) {
    return false;
  }
  send({ type: "moveEnemy", enemyId: selected, x: anchorX, y: anchorY });
  return true;
}

function onEnemyCellClick(x: number, y: number, enemyId: string) {
  if (boardActionMode.value === "attack" && handleAttackCellClick(x, y, enemyId)) return;
  if (boardActionMode.value === "omnistrike" && handleOmnistrikeCellClick(x, y)) return;
  if (boardActionMode.value === "warhook" && handleWarhookCellClick(x, y)) return;
  selectBoardEnemy(enemyId);
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
    selectBoardEnemy(enemy.id);
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
  send({ type: "move", x, y });
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

function handleAttackCellClick(x: number, y: number, targetEnemyId?: string): boolean {
  const me = yourPlayer.value;
  const s = gameState.value;
  const ctx = attackContext.value;
  if (!me || !s || !ctx) return false;

  const key = coordKey(x, y);
  const attackAction = {
    action: "attack" as const,
    direction: attackDirection.value,
  };

  if (isRangeTargetAttack(ctx.spec)) {
    if (!combatAttackSecondaryKeys.value.has(key)) return false;

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
        if (next.length >= maxTargets) {
          sendPlayerAction({
            ...attackAction,
            targetEnemyIds: next,
          });
          clearBoardActionMode();
        }
      }
      return true;
    }

    if (rangeAttackTargetIds.value.length === 0) return true;
    sendPlayerAction({
      ...attackAction,
      targetEnemyIds: [...rangeAttackTargetIds.value],
    });
    clearBoardActionMode();
    return true;
  }

  if (usesAnchoredPatternPlacement(ctx.spec)) {
    if (!attackAimed.value) {
      const placement = evaluateAnchoredPatternPlacement(
        me,
        { x, y },
        ctx.spec,
        ANCHORED_ATTACK_DIRECTION,
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
      attackDirection.value = ANCHORED_ATTACK_DIRECTION;
      return true;
    }

    if (combatAttackPrimaryKeys.value.has(key)) {
      const anchor = attackAnchor.value;
      if (!anchor) return false;
      sendPlayerAction({
        action: "attack",
        direction: ANCHORED_ATTACK_DIRECTION,
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

  if (isRangedPatternAttack(ctx.spec)) {
    if (!combatAttackSecondaryKeys.value.has(key)) return false;

    const dirs = playerAttackDirectionsAt(s, me.id, x, y, ctx.weapon);
    if (dirs.length === 0) return false;

    if (attackAimed.value && (combatAttackPrimaryKeys.value.has(key) || combatAttackSecondaryKeys.value.has(key))) {
      sendPlayerAction(attackAction);
      clearBoardActionMode();
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

  if (attackAimed.value && combatAttackPrimaryKeys.value.has(key)) {
    sendPlayerAction(attackAction);
    clearBoardActionMode();
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
  if (!me || !target) return;
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
      OMNISTRIKE_DIRECTION,
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
    const firstTiles = collectBombPatternTiles(s, firstAnchor, ctx.bombA, OMNISTRIKE_DIRECTION);
    const placement = evaluateOmnistrikePlacement(
      ctx.me,
      { x, y },
      ctx.bombB,
      OMNISTRIKE_DIRECTION,
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
    if (s && id && s.enforceActionLimits === false) {
      const path = findPlayerMovementPath(s, id, { x, y });
      if (path) sendMovePath(path);
    } else {
      if (!cellStateByKey.value.get(boardCellKey(x, y))?.moveSecondary) return true;
      sendMovePath([{ x, y }]);
    }
    return true;
  }
  if (m === "attack") {
    return handleAttackCellClick(x, y, enemy?.id);
  }
  if (m === "omnistrike") {
    return handleOmnistrikeCellClick(x, y);
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
    sendPlayerAction({ action: "sprintMove", x, y });
    return true;
  }
  if (m === "armorTeleport") {
    if (!pendingTargetEnemyId.value && enemy && Math.abs(x - me.x) + Math.abs(y - me.y) === 1) {
      pendingTargetEnemyId.value = enemy.id;
      return true;
    }
    if (pendingTargetEnemyId.value && !enemy && !player) {
      sendPlayerAction({
        action: "armorAction",
        targetEnemyId: pendingTargetEnemyId.value,
        landingX: x,
        landingY: y,
      });
      clearBoardActionMode();
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

function onPlayerCellClick(x: number, y: number) {
  if (handleCombatCellClick(x, y)) return;
  if (boardActionMode.value === "attack" || boardActionMode.value === "omnistrike" || boardActionMode.value === "warhook") return;
  if (selectOccupantAt(x, y)) return;
  clearBoardSelection();
  tryMove(x, y);
}

function tryMoveSelectedEnemy(x: number, y: number): boolean {
  const anchor = gmEnemyMoveAnchorAt(x, y);
  if (!anchor) return false;
  return tryMoveSelectedEnemyToAnchor(anchor.x, anchor.y);
}

function onGmCellClick(x: number, y: number) {
  const s = gameState.value;
  if (!s) return;

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
  send({ type: "removeEnemy", enemyId });
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
}

function hasEffectStacks(unit: { effects?: EffectStacks } | undefined): boolean {
  if (!unit?.effects) return false;
  return Object.values(unit.effects).some((stacks) => stacks > 0);
}

function buildContextMenuItems(x: number, y: number): BoardContextMenuItem[] {
  const items: BoardContextMenuItem[] = [];
  const occ = occupancy.value;
  const key = coordKey(x, y);
  const player = occ?.playerByKey.get(key);
  const enemy = occ?.enemyByKey.get(key);
  if (player || enemy) {
    items.push({ id: "add-effect", label: "Add effect" });
  }
  if (props.role === "gm" && hasEffectStacks(player ?? enemy)) {
    items.push({ id: "clear-effects", label: "Clear effects", danger: true });
  }
  if (props.role === "gm" && enemy) {
    items.push({ id: "remove-enemy", label: "Remove enemy", danger: true });
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
  if (enemy) selectBoardEnemy(enemy.id);
  else if (player) selectBoardPlayer(player.id, player.characterSheetId);

  contextMenu.value = {
    open: true,
    x: e.clientX,
    y: e.clientY,
    items,
    enemyId: enemy?.id,
    playerId: player?.id,
  };
}

function onContextMenuSelect(id: string) {
  if (id === "add-effect") {
    const enemyId = contextMenu.value.enemyId;
    const playerId = contextMenu.value.playerId;
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
  if (id === "remove-enemy" && contextMenu.value.enemyId) {
    removeEnemyById(contextMenu.value.enemyId);
  }
  closeContextMenu();
}

function endEnemyTurn(enemyId: string): boolean {
  const s = gameState.value;
  if (!s) return false;
  const enemy = s.enemies.find((e) => e.id === enemyId);
  if (!enemy || enemy.exhausted || !canGmMoveEnemies(s)) return false;
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
  }

  if (contextMenu.value.open && e.key === "Escape") {
    e.preventDefault();
    closeContextMenu();
    return;
  }

  if (props.role === "gm") {
    if (e.key === "Escape") {
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
          tryMoveSelectedEnemyToAnchor(anchor.x, anchor.y);
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
  connect();
  window.addEventListener("keydown", onKeydown);
});

watch(viewportEl, (el, prev) => {
  observeViewport(el, prev);
});

onUnmounted(() => {
  if (teleportFinishTimer) clearTimeout(teleportFinishTimer);
  window.removeEventListener("keydown", onKeydown);
  disconnectViewport();
  disconnectSocket();
});
</script>

<template>
  <div class="game-board">
    <div v-if="gameState" class="board-display" @click="onBoardDisplayClick">
      <div
        ref="viewportEl"
        class="board-viewport"
        @click="onViewportClick"
        @contextmenu="onBoardContextMenu"
        @wheel.prevent="onWheel"
      >
        <div class="board-stage" :style="stageStyle">
          <div class="board" :style="gridStyle">
            <BoardCell
                v-for="c in cells"
                :key="c.key"
                v-memo="[
                  c.key,
                  cellStateByKey.get(c.key),
                  hoveredKey === c.key,
                  draggingDeploy,
                  selectedPlayerId === cellStateByKey.get(c.key)?.player?.id,
                  selectedEnemyId === cellStateByKey.get(c.key)?.enemyAnchor?.id,
                  cellStateByKey.get(c.key)?.player?.hp,
                  cellStateByKey.get(c.key)?.enemyAnchor?.hp,
                  dyingEnemyIds.size,
                  !!cellStateByKey.get(c.key)?.enemyAnchor &&
                    isEnemyDying(cellStateByKey.get(c.key)!.enemyAnchor!.id),
                  showHealthBars,
                  showEnemyHealthBars,
                  !!cellStateByKey.get(c.key)?.player &&
                    teleportingPlayerIds.has(cellStateByKey.get(c.key)!.player!.id),
                ]"
                :x="c.x"
                :y="c.y"
                :cell="cellStateByKey.get(c.key)!"
                :is-hovered="hoveredKey === c.key"
                :dragging-deploy="draggingDeploy"
                :can-drag-deploy="!!cellStateByKey.get(c.key)?.player && canDragDeploy(cellStateByKey.get(c.key)!.player!)"
                :is-player-selected="!!cellStateByKey.get(c.key)?.player && isPlayerSelected(cellStateByKey.get(c.key)!.player!.id)"
                :is-enemy-selected="!!cellStateByKey.get(c.key)?.enemyAnchor && isEnemySelected(cellStateByKey.get(c.key)!.enemyAnchor!.id)"
                :player-hue="cellStateByKey.get(c.key)?.player ? hueFromId(cellStateByKey.get(c.key)!.player!.id) : null"
                :show-health-bars="showHealthBars"
                :show-enemy-health-bars="showEnemyHealthBars"
                :enemy-dying="!!cellStateByKey.get(c.key)?.enemyAnchor && isEnemyDying(cellStateByKey.get(c.key)!.enemyAnchor!.id)"
                :player-teleporting="!!cellStateByKey.get(c.key)?.player && teleportingPlayerIds.has(cellStateByKey.get(c.key)!.player!.id)"
                @click="onCellClick(c.x, c.y)"
                @hover="onCellHover(c.x, c.y, c.key)"
                @unhover="onCellUnhover"
                @player-click="selectBoardPlayer(cellStateByKey.get(c.key)!.player!.id, cellStateByKey.get(c.key)!.player!.characterSheetId)"
                @enemy-click="onEnemyCellClick(c.x, c.y, cellStateByKey.get(c.key)!.enemyAnchor!.id)"
                @deploy-pointer-down="onDeployPointerDown($event, cellStateByKey.get(c.key)!.player!)"
              />
          </div>
        </div>

        <div v-if="tooltipData" class="board-tooltip popover-tooltip" :style="tooltipStyle ?? undefined">
          <div class="tooltip-section">
            <span class="tooltip-row">({{ tooltipData.x }}, {{ tooltipData.y }})</span>
            <span class="tooltip-row">Terrain: {{ tooltipData.tile.terrain.join(", ") }}</span>
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
          <div v-if="tooltipData.enemies.length" class="tooltip-section">
            <span class="tooltip-heading">Enemies</span>
            <div v-for="enemy in tooltipData.enemies" :key="enemy.id" class="tooltip-unit">
              <span class="tooltip-row">
                {{ enemyLabel(enemy) }}<template v-if="props.role === 'gm'"> · HP {{ formatHp(enemy.hp, getEnemyMaxHp(enemy)) }}</template>
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
      @close="effectModalOpen = false"
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
  animation: damage-indicator 3s ease-in-out forwards;
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
