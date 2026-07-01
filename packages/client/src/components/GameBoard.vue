<script setup lang="ts">
import type { ClientMessage, Enemy, MapTile, Player, ServerMessage, TerrainObject } from "@gaem/shared";
import { getEnemyMaxHp, getPlayerMaxHp, isWalkable, tileAt } from "@gaem/shared";
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";

import { useBoardSelection } from "../composables/useBoardSelection.js";
import { useCharacterSheetSelection } from "../composables/useCharacterSheetSelection.js";
import { appendConsoleEntry, setConsoleEntries } from "../composables/useGameConsole.js";
import { useGameConnection } from "../composables/useGameConnection.js";
import { useGameState } from "../composables/useGameState.js";

const props = defineProps<{
  role: "gm" | "player";
  playerProfile?: { id: string; name: string } | null;
}>();

const wsUrl =
  import.meta.env.VITE_WS_URL ??
  (import.meta.env.DEV
    ? `ws://${location.hostname}:3001/ws`
    : `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/ws`);

const { connection } = useGameConnection();
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
const { gameState, yourPlayerId, setGameState, registerSend, clearGameState } = useGameState();
const lastError = ref<string | null>(null);
const hoveredKey = ref<string | null>(null);
const viewportEl = ref<HTMLElement | null>(null);
const scale = ref(1);
const panX = ref(0);
const panY = ref(0);
const fitScale = ref(1);
const fitPanX = ref(0);
const fitPanY = ref(0);
let socket: WebSocket | null = null;

const BOARD_PAD = 24;
const ZOOM_MAX_FACTOR = 4;
const PAN_MIN_VISIBLE_FRACTION = 0.2;

function clampPanAxis(pan: number, scaledSize: number, viewportSize: number): number {
  const minVisible = Math.min(
    scaledSize * PAN_MIN_VISIBLE_FRACTION,
    viewportSize * PAN_MIN_VISIBLE_FRACTION,
  );
  return Math.min(viewportSize - minVisible, Math.max(minVisible - scaledSize, pan));
}
function hueFromId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % 360;
}

const boardWidthPx = computed(() => {
  const s = gameState.value;
  if (!s) return 520;
  return Math.max(s.width * 40, 280);
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

const stageStyle = computed(() => ({
  transform: `translate(${panX.value}px, ${panY.value}px) scale(${scale.value})`,
  "--board-scale": String(scale.value),
}));

const isTransformed = computed(
  () =>
    Math.abs(scale.value - fitScale.value) > 0.005 ||
    Math.abs(panX.value - fitPanX.value) > 1 ||
    Math.abs(panY.value - fitPanY.value) > 1,
);

function getBoardSize() {
  const s = gameState.value;
  if (!s) return { w: 544, h: 544 };
  const innerW = boardWidthPx.value;
  const innerH = innerW * (s.height / s.width);
  return { w: innerW + BOARD_PAD, h: innerH + BOARD_PAD };
}

function computeFitTransform(vw: number, vh: number) {
  const { w, h } = getBoardSize();
  const s = Math.min(vw / w, vh / h);
  return { scale: s, panX: (vw - w * s) / 2, panY: (vh - h * s) / 2 };
}

function updateFitState() {
  const el = viewportEl.value;
  if (!el) return;
  const fit = computeFitTransform(el.clientWidth, el.clientHeight);
  fitScale.value = fit.scale;
  fitPanX.value = fit.panX;
  fitPanY.value = fit.panY;
}

function clampView() {
  const el = viewportEl.value;
  if (!el) return;
  const minS = fitScale.value;
  const maxS = fitScale.value * ZOOM_MAX_FACTOR;
  scale.value = Math.min(maxS, Math.max(minS, scale.value));
  const { w, h } = getBoardSize();
  const scaledW = w * scale.value;
  const scaledH = h * scale.value;
  const vw = el.clientWidth;
  const vh = el.clientHeight;
  panX.value = clampPanAxis(panX.value, scaledW, vw);
  panY.value = clampPanAxis(panY.value, scaledH, vh);
}

function fitToView() {
  const el = viewportEl.value;
  if (!el || !gameState.value) return;
  const fit = computeFitTransform(el.clientWidth, el.clientHeight);
  scale.value = fit.scale;
  panX.value = fit.panX;
  panY.value = fit.panY;
  fitScale.value = fit.scale;
  fitPanX.value = fit.panX;
  fitPanY.value = fit.panY;
}

const resizeObserver = new ResizeObserver(() => {
  const wasFit = !isTransformed.value;
  nextTick(() => {
    if (wasFit) fitToView();
    else {
      updateFitState();
      clampView();
    }
  });
});

let wheelFrame = 0;
let pendingPanDx = 0;
let pendingPanDy = 0;
let pendingZoom: { deltaY: number; mx: number; my: number } | null = null;

function applyWheelUpdate() {
  wheelFrame = 0;
  const el = viewportEl.value;
  if (!el) {
    pendingPanDx = 0;
    pendingPanDy = 0;
    pendingZoom = null;
    return;
  }

  if (pendingZoom) {
    const { deltaY, mx, my } = pendingZoom;
    pendingZoom = null;
    const minS = fitScale.value;
    const maxS = fitScale.value * ZOOM_MAX_FACTOR;
    const next = Math.min(maxS, Math.max(minS, scale.value * Math.exp(-deltaY * 0.005)));
    const ratio = next / scale.value;
    panX.value = mx - (mx - panX.value) * ratio;
    panY.value = my - (my - panY.value) * ratio;
    scale.value = next;
    clampView();
    return;
  }

  const dx = pendingPanDx;
  const dy = pendingPanDy;
  pendingPanDx = 0;
  pendingPanDy = 0;
  if (dx === 0 && dy === 0) return;

  panX.value -= dx;
  panY.value -= dy;
  clampView();
}

function onWheel(e: WheelEvent) {
  if (!viewportEl.value) return;
  e.preventDefault();

  if (e.ctrlKey || e.metaKey) {
    const rect = viewportEl.value.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    if (pendingZoom) pendingZoom.deltaY += e.deltaY;
    else pendingZoom = { deltaY: e.deltaY, mx, my };
    pendingZoom.mx = mx;
    pendingZoom.my = my;
    pendingPanDx = 0;
    pendingPanDy = 0;
  } else {
    pendingPanDx += e.deltaX;
    pendingPanDy += e.deltaY;
  }

  if (!wheelFrame) wheelFrame = requestAnimationFrame(applyWheelUpdate);
}

const cells = computed(() => {
  const s = gameState.value;
  if (!s) return [] as { x: number; y: number; key: string }[];
  const out: { x: number; y: number; key: string }[] = [];
  for (let y = 0; y < s.height; y++) {
    for (let x = 0; x < s.width; x++) out.push({ x, y, key: `${x}-${y}` });
  }
  return out;
});

const boardAspectRatio = computed(() => {
  const s = gameState.value;
  if (!s) return "1 / 1";
  return `${s.width} / ${s.height}`;
});

function getTile(x: number, y: number): MapTile | undefined {
  const s = gameState.value;
  if (!s) return undefined;
  return tileAt(s.tiles, x, y);
}

function terrainClass(tile: MapTile | undefined): string | null {
  if (!tile) return null;
  if (tile.terrain.includes("impassable")) return "impassable";
  if (tile.terrain.includes("obstacle")) return "obstacle";
  if (tile.terrain.includes("void")) return "void";
  if (tile.terrain.includes("cover")) return "cover";
  if (tile.terrain.includes("uneasy")) return "uneasy";
  return null;
}

function playerAt(x: number, y: number) {
  return gameState.value?.players.find((p) => p.x === x && p.y === y);
}

function playersAt(x: number, y: number): Player[] {
  return gameState.value?.players.filter((p) => p.x === x && p.y === y) ?? [];
}

function enemyAt(x: number, y: number) {
  return gameState.value?.enemies.find((e) => e.x === x && e.y === y);
}

function enemiesAt(x: number, y: number): Enemy[] {
  return gameState.value?.enemies.filter((e) => e.x === x && e.y === y) ?? [];
}

function terrainObjectsAt(x: number, y: number): TerrainObject[] {
  return gameState.value?.terrainObjects?.filter((o) => o.x === x && o.y === y) ?? [];
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

function isEmptyWalkable(x: number, y: number): boolean {
  return isWalkable(getTile(x, y)) && !playerAt(x, y) && !enemyAt(x, y);
}

function isAdjacentToSelectedEnemy(x: number, y: number): boolean {
  const id = selectedEnemyId.value;
  const s = gameState.value;
  if (!id || !s) return false;
  const enemy = s.enemies.find((e) => e.id === id);
  if (!enemy) return false;
  return Math.abs(x - enemy.x) + Math.abs(y - enemy.y) === 1;
}

function isAdjacentToYou(x: number, y: number): boolean {
  const id = yourPlayerId.value;
  const s = gameState.value;
  if (!id || !s) return false;
  const me = s.players.find((p) => p.id === id);
  if (!me) return false;
  return Math.abs(x - me.x) + Math.abs(y - me.y) === 1;
}

function send(msg: ClientMessage) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(msg));
}

function tryMove(x: number, y: number) {
  lastError.value = null;
  if (props.role !== "player") return;
  if (!yourPlayerId.value || !gameState.value) return;
  if (!isAdjacentToYou(x, y)) return;
  if (enemyAt(x, y)) return;
  send({ type: "move", x, y });
}

function onPlayerTokenClick(player: Player) {
  selectBoardPlayer(player.id, player.characterSheetId);
}

function onEnemyTokenClick(enemy: Enemy) {
  selectBoardEnemy(enemy.id);
}

function onPlayerCellClick(x: number, y: number) {
  lastError.value = null;
  const player = playerAt(x, y);
  if (player) {
    selectBoardPlayer(player.id, player.characterSheetId);
    return;
  }
  const enemy = enemyAt(x, y);
  if (enemy) {
    selectBoardEnemy(enemy.id);
    return;
  }
  clearBoardSelection();
  tryMove(x, y);
}

function onGmCellClick(x: number, y: number) {
  lastError.value = null;
  const s = gameState.value;
  if (!s) return;

  const player = playerAt(x, y);
  if (player) {
    selectBoardPlayer(player.id, player.characterSheetId);
    return;
  }

  const enemy = enemyAt(x, y);
  if (enemy) {
    selectBoardEnemy(enemy.id);
    return;
  }

  const selected = selectedEnemyId.value;
  if (selected) {
    const selectedEnemy = s.enemies.find((e) => e.id === selected);
    if (!selectedEnemy) {
      clearBoardSelection();
      return;
    }
    if (isAdjacentToSelectedEnemy(x, y) && isEmptyWalkable(x, y)) {
      send({ type: "moveEnemy", enemyId: selected, x, y });
      return;
    }
  }

  clearBoardSelection();
}

function onCellClick(x: number, y: number) {
  if (props.role === "gm") onGmCellClick(x, y);
  else onPlayerCellClick(x, y);
}

function onViewportClick(e: MouseEvent) {
  if ((e.target as HTMLElement).closest(".cell")) return;
  clearBoardSelection();
}

function onBoardDisplayClick(e: MouseEvent) {
  const target = e.target as HTMLElement;
  if (target.closest(".board-viewport, .reset-zoom-btn")) return;
  clearBoardSelection();
}

function removeSelectedEnemy() {
  if (!selectedEnemyId.value) return;
  lastError.value = null;
  send({ type: "removeEnemy", enemyId: selectedEnemyId.value });
  clearBoardSelection();
}

function onKeydown(e: KeyboardEvent) {
  if (props.role === "gm") {
    if (e.key === "Escape") {
      clearBoardSelection();
      return;
    }
    if ((e.key === "Delete" || e.key === "Backspace") && selectedEnemyId.value) {
      e.preventDefault();
      removeSelectedEnemy();
    }
    return;
  }
  const id = yourPlayerId.value;
  const s = gameState.value;
  if (!id || !s) return;
  const me = s.players.find((p) => p.id === id);
  if (!me) return;

  const map: Record<string, { x: number; y: number }> = {
    ArrowUp: { x: me.x, y: me.y - 1 },
    ArrowDown: { x: me.x, y: me.y + 1 },
    ArrowLeft: { x: me.x - 1, y: me.y },
    ArrowRight: { x: me.x + 1, y: me.y },
  };
  const t = map[e.key];
  if (!t) return;
  e.preventDefault();
  tryMove(t.x, t.y);
}

function connect() {
  connection.value = "connecting";
  lastError.value = null;
  socket = new WebSocket(wsUrl);
  registerSend(send);

  socket.addEventListener("open", () => {
    connection.value = "connected";
    send({
      type: "join",
      role: props.role,
      playerKey: props.role === "player" ? props.playerProfile?.id : undefined,
      nickname: props.role === "player" ? props.playerProfile?.name : undefined,
      characterSheetId:
        props.role === "player" ? selectedSheetId.value ?? undefined : undefined,
    });
  });

  socket.addEventListener("close", () => {
    connection.value = "disconnected";
    socket = null;
  });

  socket.addEventListener("message", (ev) => {
    let msg: ServerMessage;
    try {
      msg = JSON.parse(String(ev.data)) as ServerMessage;
    } catch {
      lastError.value = "Invalid message from server";
      return;
    }
    if (msg.type === "state") {
      setGameState(msg.state, msg.yourPlayerId);
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
    } else if (msg.type === "consoleSync") {
      setConsoleEntries(msg.entries);
    } else if (msg.type === "console") {
      appendConsoleEntry(msg.entry);
    } else if (msg.type === "error") {
      lastError.value = msg.message;
    }
  });
}

watch(
  () => (gameState.value ? `${gameState.value.width}x${gameState.value.height}` : null),
  (key) => {
    if (key) nextTick(fitToView);
  },
);

onMounted(() => {
  connect();
  window.addEventListener("keydown", onKeydown);
});

watch(viewportEl, (el, prev) => {
  if (prev) resizeObserver.unobserve(prev);
  if (el) resizeObserver.observe(el);
});

onUnmounted(() => {
  if (wheelFrame) cancelAnimationFrame(wheelFrame);
  window.removeEventListener("keydown", onKeydown);
  resizeObserver.disconnect();
  socket?.close();
  clearGameState();
  connection.value = "disconnected";
});
</script>

<template>
  <div class="game-board">
    <p v-if="lastError" class="error">{{ lastError }}</p>

    <div v-if="gameState" class="board-display" @click="onBoardDisplayClick">
      <div ref="viewportEl" class="board-viewport" @click="onViewportClick" @wheel.prevent="onWheel">
        <div class="board-stage" :style="stageStyle">
          <div class="board-wrap">
            <div class="board" :style="gridStyle">
            <button
              v-for="c in cells"
              :key="c.key"
              type="button"
              class="cell"
              :class="{
                [terrainClass(getTile(c.x, c.y)) ?? '']: !!terrainClass(getTile(c.x, c.y)),
                movable:
                  props.role === 'player' &&
                  isWalkable(getTile(c.x, c.y)) &&
                  isAdjacentToYou(c.x, c.y) &&
                  !playerAt(c.x, c.y) &&
                  !enemyAt(c.x, c.y),
                'gm-movable':
                  props.role === 'gm' &&
                  !!selectedEnemyId &&
                  isAdjacentToSelectedEnemy(c.x, c.y) &&
                  isEmptyWalkable(c.x, c.y),
              }"
              @click="onCellClick(c.x, c.y)"
              @mouseenter="hoveredKey = c.key"
              @mouseleave="hoveredKey = null"
            >
              <div v-if="hoveredKey === c.key && getTile(c.x, c.y)" class="tile-tooltip">
                <div class="tooltip-section">
                  <span class="tooltip-row">({{ c.x }}, {{ c.y }})</span>
                  <span class="tooltip-row">Terrain: {{ getTile(c.x, c.y)!.terrain.join(", ") }}</span>
                  <span class="tooltip-row">Elevation: {{ getTile(c.x, c.y)!.elevation }}</span>
                </div>
                <div v-if="playersAt(c.x, c.y).length" class="tooltip-section">
                  <span class="tooltip-heading">Players</span>
                  <span
                    v-for="player in playersAt(c.x, c.y)"
                    :key="player.id"
                    class="tooltip-row"
                  >
                    {{ playerLabel(player) }} · HP {{ formatHp(player.hp, getPlayerMaxHp(player)) }}
                  </span>
                </div>
                <div v-if="enemiesAt(c.x, c.y).length" class="tooltip-section">
                  <span class="tooltip-heading">Enemies</span>
                  <span
                    v-for="enemy in enemiesAt(c.x, c.y)"
                    :key="enemy.id"
                    class="tooltip-row"
                  >
                    {{ enemyLabel(enemy) }} · HP {{ formatHp(enemy.hp, getEnemyMaxHp(enemy)) }}
                  </span>
                </div>
                <div v-if="terrainObjectsAt(c.x, c.y).length" class="tooltip-section">
                  <span class="tooltip-heading">Objects</span>
                  <span
                    v-for="object in terrainObjectsAt(c.x, c.y)"
                    :key="object.id"
                    class="tooltip-row"
                  >
                    {{ terrainObjectLabel(object) }}
                  </span>
                </div>
              </div>
              <span
                v-if="enemyAt(c.x, c.y)"
                class="piece enemy"
                :class="{ selected: isEnemySelected(enemyAt(c.x, c.y)!.id) }"
                @click.stop="onEnemyTokenClick(enemyAt(c.x, c.y)!)"
              />
              <span
                v-if="playerAt(c.x, c.y)"
                class="piece player-piece"
                :class="{ selected: isPlayerSelected(playerAt(c.x, c.y)!.id) }"
                :style="{
                  background: `hsl(${hueFromId(playerAt(c.x, c.y)!.id)} 70% 45%)`,
                }"
                @click.stop="onPlayerTokenClick(playerAt(c.x, c.y)!)"
              />
            </button>
            </div>
          </div>
        </div>
      </div>
      <button v-if="isTransformed" class="reset-zoom-btn" type="button" @click="fitToView">
        Reset zoom
      </button>
    </div>

    <p v-else class="loading">Loading board…</p>
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
.error { margin: 0 0 0.75rem; color: #f85149; font-size: 0.9rem; }
.board-display {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.board-viewport {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  border-radius: 12px;
  border: 1px solid #30363d;
  background: #161b22;
}
.reset-zoom-btn {
  position: absolute;
  bottom: 0.75rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 2;
  border: 1px solid #30363d;
  border-radius: 8px;
  background: #0d1117ee;
  color: #e6edf3;
  padding: 0.35rem 0.75rem;
  font-size: 0.8rem;
  cursor: pointer;
}
.reset-zoom-btn:hover {
  background: #161b22;
  border-color: #388bfd66;
}
.board-stage { transform-origin: 0 0; will-change: transform; }
.board-wrap { width: fit-content; padding: 0.75rem; }
.board { display: grid; gap: 3px; aspect-ratio: v-bind(boardAspectRatio); }
.cell { position: relative; border: none; border-radius: 4px; min-height: 28px; padding: 0; cursor: default; background: #21262d; }
.cell.impassable { background: #484f58; cursor: not-allowed; }
.cell.obstacle { background: #6e4c2a; cursor: not-allowed; }
.cell.void { background: #0d1117; cursor: not-allowed; }
.cell.cover { background: #2d4a3e; }
.cell.uneasy { background: #3d3520; }
.cell.movable { cursor: pointer; outline: 1px dashed #388bfd66; }
.cell.gm-movable { cursor: pointer; outline: 1px dashed #f8514966; }
.piece { position: absolute; inset: 4px; border-radius: 50%; display: block; z-index: 1; }
.piece.player-piece { cursor: pointer; z-index: 2; }
.piece.enemy { background: hsl(0 70% 45%); z-index: 0; }
.piece.selected { outline: 2px solid #fff; }
.tile-tooltip {
  position: absolute;
  bottom: calc(100% + 4px);
  left: 50%;
  transform: translateX(-50%) scale(calc(1 / var(--board-scale, 1)));
  transform-origin: bottom center;
  z-index: 2;
  min-width: 120px;
  max-width: 220px;
  padding: 0.35rem 0.5rem;
  border-radius: 6px;
  border: 1px solid #30363d;
  background: #0d1117;
  color: #e6edf3;
  font-size: 0.7rem;
  line-height: 1.4;
  white-space: nowrap;
  pointer-events: none;
  box-shadow: 0 4px 12px #01040966;
}
.tooltip-section + .tooltip-section {
  margin-top: 0.35rem;
  padding-top: 0.35rem;
  border-top: 1px solid #30363d;
}
.tooltip-heading {
  display: block;
  margin-bottom: 0.15rem;
  color: #8b949e;
  font-size: 0.62rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.tooltip-row { display: block; }
.loading { color: #8b949e; }
</style>
