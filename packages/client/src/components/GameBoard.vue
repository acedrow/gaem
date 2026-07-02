<script setup lang="ts">
import type { Enemy, MapTile, PatternDirection, Player, TerrainObject } from "@gaem/shared";
import {
  boardCellKey,
  buildBoardOccupancy,
  canGmMoveEnemies,
  canPlayerMove,
  coordKey,
  coordsToKeySet,
  drawableExpansionOptions,
  enemyFootprintTiles,
  fixedPatternTilesInBounds,
  getEnemyMaxHp,
  getEnemyScale,
  getEnemyScaleByName,
  getPlayerMaxHp,
  getWeaponAttackSpec,
  isRangeTargetAttack,
  isWalkable,
  manhattanDistance,
  playerAttackDirectionsAt,
  previewPlayerAttack,
  PATTERN_DIRECTIONS,
  rangeAttackTileKeys,
  rangeTargetDistance,
  recoilTilesInBounds,
  tileAt,
  validateEnemyFootprint,
} from "@gaem/shared";
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from "vue";

import { useBoardActionMode } from "../composables/useBoardActionMode.js";
import { useCombatActions } from "../composables/useCombatActions.js";
import { useBoardSelection } from "../composables/useBoardSelection.js";
import { useBoardViewport } from "../composables/useBoardViewport.js";
import { useCharacterSheetSelection } from "../composables/useCharacterSheetSelection.js";
import { useEnemySpawnSelection } from "../composables/useEnemySpawnSelection.js";
import { useGameSocket } from "../composables/useGameSocket.js";
import { useGameState } from "../composables/useGameState.js";
import { useInfoDataSelection } from "../composables/useInfoDataSelection.js";
import { usePatternSelection } from "../composables/usePatternSelection.js";
import BoardCell, { type CellRenderState } from "./BoardCell.vue";
import BoardContextMenu, { type BoardContextMenuItem } from "./BoardContextMenu.vue";

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
  pendingTargetEnemyId,
  pendingTargetPlayerId,
  armorLanding,
  armorPush,
  clearMode: clearBoardActionMode,
} = useBoardActionMode();
const { sendPlayerAction, sendMovePath } = useCombatActions();

const lastError = ref<string | null>(null);
const hoveredKey = ref<string | null>(null);
const hoveredCell = ref<{ x: number; y: number } | null>(null);
const draggingDeploy = ref(false);
const contextMenu = ref<{
  open: boolean;
  x: number;
  y: number;
  items: BoardContextMenuItem[];
  enemyId?: string;
}>({ open: false, x: 0, y: 0, items: [] });
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
  hasGameState,
  boardHeight,
  boardWidth,
  boardKey,
);

const playerProfileRef = computed(() => props.playerProfile ?? null);

const { send, connect, disconnect: disconnectSocket } = useGameSocket({
  wsUrl,
  role: computed(() => props.role),
  playerProfile: playerProfileRef,
  selectedSheetId,
  onError: (message) => {
    lastError.value = message;
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

const attackPreviewByDirection = computed(() => {
  const s = gameState.value;
  const me = yourPlayer.value;
  if (boardActionMode.value !== "attack" || !s || !me) {
    return new Map<PatternDirection, Set<string>>();
  }
  const spec = getWeaponAttackSpec(me.weapon);
  if (!spec || isRangeTargetAttack(spec)) {
    return new Map<PatternDirection, Set<string>>();
  }
  const map = new Map<PatternDirection, Set<string>>();
  for (const direction of PATTERN_DIRECTIONS) {
    map.set(direction, coordsToKeySet(previewPlayerAttack(s, me.id, direction)));
  }
  return map;
});

const combatAttackPrimaryKeys = computed(() => {
  if (boardActionMode.value !== "attack" || !attackAimed.value) return new Set<string>();
  const spec = getWeaponAttackSpec(yourPlayer.value?.weapon);
  if (spec && isRangeTargetAttack(spec)) return new Set<string>();
  return attackPreviewByDirection.value.get(attackDirection.value) ?? new Set<string>();
});

const combatAttackSecondaryKeys = computed(() => {
  if (boardActionMode.value !== "attack" || !gameState.value || !yourPlayer.value) {
    return new Set<string>();
  }
  const spec = getWeaponAttackSpec(yourPlayer.value.weapon);
  if (!spec) return new Set<string>();

  if (isRangeTargetAttack(spec)) {
    return rangeAttackTileKeys(
      gameState.value,
      yourPlayer.value,
      rangeTargetDistance(spec),
    );
  }

  const keys = new Set<string>();
  for (const [direction, tileKeys] of attackPreviewByDirection.value) {
    if (attackAimed.value && direction === attackDirection.value) continue;
    for (const key of tileKeys) keys.add(key);
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
  if (!enemy) return keys;
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
    if (validateEnemyFootprint(s, anchorX, anchorY, scale, id, occupancy.value) !== null) {
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
  const me = yourPlayer.value;

  for (const c of cells.value) {
    const tile = tileAt(s.tiles, c.x, c.y);
    const player = occ.playerByKey.get(coordKey(c.x, c.y));
    const enemy = occ.enemyByKey.get(coordKey(c.x, c.y));
    const enemyAnchor = occ.enemyAnchorByKey.get(coordKey(c.x, c.y));

    const adjacent =
      me != null && Math.abs(c.x - me.x) + Math.abs(c.y - me.y) === 1;

    map.set(c.key, {
      terrainClass: terrainClass(tile),
      movable:
        playerCanMove &&
        !isDeployment &&
        isWalkable(tile) &&
        adjacent &&
        !player &&
        !enemy,
      deployable:
        isDeployment &&
        props.role === "player" &&
        !!yourPlayerId.value &&
        isWalkable(tile) &&
        !player &&
        !enemy,
      gmMovable: props.role === "gm" && gmEnemyMoveTargetKeys.value.has(c.key),
      gmSpawnable: props.role === "gm" && gmSpawnableKeys.value.has(c.key),
      patternPrimary:
        patternPrimaryKeys.value.has(coordKey(c.x, c.y)) ||
        combatAttackPrimaryKeys.value.has(coordKey(c.x, c.y)),
      patternSecondary:
        patternSecondaryKeys.value.has(coordKey(c.x, c.y)) ||
        combatAttackSecondaryKeys.value.has(coordKey(c.x, c.y)),
      patternRecoil: patternRecoilKeys.value.has(coordKey(c.x, c.y)),
      tile,
      player,
      enemyAnchor,
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
const BOARD_WRAP_PAD = 12;

const tooltipStyle = computed(() => {
  const cell = hoveredCell.value;
  const s = gameState.value;
  if (!cell || !s) return null;
  const gridW = boardWidthPx.value;
  const gridH = gridW * (s.height / s.width);
  const cellW = (gridW - (s.width - 1) * BOARD_CELL_GAP) / s.width;
  const cellH = (gridH - (s.height - 1) * BOARD_CELL_GAP) / s.height;
  const cellLeft = BOARD_WRAP_PAD + cell.x * (cellW + BOARD_CELL_GAP);
  const cellTop = BOARD_WRAP_PAD + cell.y * (cellH + BOARD_CELL_GAP);
  const centerX = cellLeft + cellW / 2;
  return {
    left: `${panX.value + centerX * scale.value}px`,
    top: `${panY.value + cellTop * scale.value}px`,
    transform: "translate(-50%, calc(-100% - 6px))",
  };
});

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

function gmEnemyMoveAnchorAt(x: number, y: number): { x: number; y: number } | null {
  const s = gameState.value;
  const id = selectedEnemyId.value;
  if (!s || !id) return null;
  const enemy = s.enemies.find((e) => e.id === id);
  if (!enemy) return null;
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
      if (tile.x === x && tile.y === y) return { x: anchorX, y: anchorY };
    }
  }
  return null;
}

function onEnemyCellClick(x: number, y: number, enemyId: string) {
  if (boardActionMode.value === "attack" && handleAttackCellClick(x, y, enemyId)) return;
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
  lastError.value = null;
  if (props.role !== "player") return;
  if (!yourPlayerId.value || !gameState.value) return;
  if (!canPlayerMove(gameState.value, yourPlayerId.value)) return;
  const deploying = gameState.value.roundPhase === "deployment";
  const cell = cellStateByKey.value.get(boardCellKey(x, y));
  if (!deploying && !cell?.movable && !cell?.deployable) {
    const me = yourPlayer.value;
    if (!me || Math.abs(x - me.x) + Math.abs(y - me.y) !== 1) return;
    const occ = occupancy.value;
    if (occ?.enemyByKey.has(coordKey(x, y))) return;
  }
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
  if (!me || !s) return false;
  const spec = getWeaponAttackSpec(me.weapon);
  if (!spec) return false;

  const key = coordKey(x, y);

  if (isRangeTargetAttack(spec)) {
    if (!combatAttackSecondaryKeys.value.has(key)) return false;
    if (!targetEnemyId) return true;
    const enemy = s.enemies.find((e) => e.id === targetEnemyId);
    if (!enemy) return false;
    if (manhattanDistance(me, enemy) > rangeTargetDistance(spec)) return false;
    sendPlayerAction({
      action: "attack",
      direction: attackDirection.value,
      targetEnemyId,
    });
    clearBoardActionMode();
    return true;
  }

  const dirs = playerAttackDirectionsAt(s, me.id, x, y);
  if (dirs.length === 0) return false;

  if (attackAimed.value && combatAttackPrimaryKeys.value.has(key)) {
    sendPlayerAction({ action: "attack", direction: attackDirection.value });
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
    sendMovePath([{ x, y }]);
    return true;
  }
  if (m === "attack") {
    return handleAttackCellClick(x, y, enemy?.id);
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
    sendPlayerAction({ action: "sprint", path: [{ x, y }] });
    clearBoardActionMode();
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
  lastError.value = null;
  if (handleCombatCellClick(x, y)) return;
  if (boardActionMode.value === "attack") return;
  if (selectOccupantAt(x, y)) return;
  clearBoardSelection();
  tryMove(x, y);
}

function tryMoveSelectedEnemy(x: number, y: number): boolean {
  lastError.value = null;
  const s = gameState.value;
  const selected = selectedEnemyId.value;
  if (!s || !selected) return false;
  if (!s.enemies.some((e) => e.id === selected)) {
    clearBoardSelection();
    return false;
  }
  const anchor = gmEnemyMoveAnchorAt(x, y);
  if (canGmMoveEnemies(s) && anchor) {
    send({ type: "moveEnemy", enemyId: selected, x: anchor.x, y: anchor.y });
    return true;
  }
  return false;
}

function onGmCellClick(x: number, y: number) {
  lastError.value = null;
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
  lastError.value = null;
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
}

function buildContextMenuItems(x: number, y: number): BoardContextMenuItem[] {
  const items: BoardContextMenuItem[] = [];
  const occ = occupancy.value;
  const enemy = occ?.enemyByKey.get(coordKey(x, y));
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
  const enemy = occ?.enemyByKey.get(coordKey(x, y));
  if (enemy) selectBoardEnemy(enemy.id);

  contextMenu.value = {
    open: true,
    x: e.clientX,
    y: e.clientY,
    items,
    enemyId: enemy?.id,
  };
}

function onContextMenuSelect(id: string) {
  if (id === "remove-enemy" && contextMenu.value.enemyId) {
    removeEnemyById(contextMenu.value.enemyId);
  }
  closeContextMenu();
}

function onKeydown(e: KeyboardEvent) {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
    return;
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
        const t = arrowTarget(e.key, enemy);
        if (t) {
          e.preventDefault();
          tryMoveSelectedEnemy(t.x, t.y);
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
  connect();
  window.addEventListener("keydown", onKeydown);
});

watch(viewportEl, (el, prev) => {
  observeViewport(el, prev);
});

onUnmounted(() => {
  window.removeEventListener("keydown", onKeydown);
  disconnectViewport();
  disconnectSocket();
});
</script>

<template>
  <div class="game-board">
    <p v-if="lastError" class="error">{{ lastError }}</p>

    <div v-if="gameState" class="board-display" @click="onBoardDisplayClick">
      <div
        ref="viewportEl"
        class="board-viewport"
        @click="onViewportClick"
        @contextmenu="onBoardContextMenu"
        @wheel.prevent="onWheel"
      >
        <div class="board-stage" :style="stageStyle">
          <div class="board-wrap">
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
                @click="onCellClick(c.x, c.y)"
                @hover="onCellHover(c.x, c.y, c.key)"
                @unhover="onCellUnhover"
                @player-click="selectBoardPlayer(cellStateByKey.get(c.key)!.player!.id, cellStateByKey.get(c.key)!.player!.characterSheetId)"
                @enemy-click="onEnemyCellClick(c.x, c.y, cellStateByKey.get(c.key)!.enemyAnchor!.id)"
                @deploy-pointer-down="onDeployPointerDown($event, cellStateByKey.get(c.key)!.player!)"
              />
            </div>
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
            <span
              v-for="player in tooltipData.players"
              :key="player.id"
              class="tooltip-row"
            >
              {{ playerLabel(player) }} · HP {{ formatHp(player.hp, getPlayerMaxHp(player)) }}
            </span>
          </div>
          <div v-if="tooltipData.enemies.length" class="tooltip-section">
            <span class="tooltip-heading">Enemies</span>
            <span
              v-for="enemy in tooltipData.enemies"
              :key="enemy.id"
              class="tooltip-row"
            >
              {{ enemyLabel(enemy) }}<template v-if="props.role === 'gm'"> · HP {{ formatHp(enemy.hp, getEnemyMaxHp(enemy)) }}</template>
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
        </div>
      </div>
      <button v-if="isTransformed" class="reset-zoom-btn" type="button" @click="fitToView">
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
  border-radius: 12px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
}

.reset-zoom-btn {
  position: absolute;
  bottom: 0.75rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 2;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: #0d1117ee;
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

.board-wrap {
  width: fit-content;
  padding: 0.75rem;
}

.board {
  display: grid;
  gap: 3px;
  aspect-ratio: v-bind(boardAspectRatio);
}

.board-tooltip {
  position: absolute;
  white-space: nowrap;
  z-index: 3;
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
  font-size: 0.62rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.tooltip-row {
  display: block;
}
</style>
