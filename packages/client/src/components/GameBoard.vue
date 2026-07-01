<script setup lang="ts">
import type { ClientMessage, GameState, MapTile, ServerMessage } from "@gaem/shared";
import { isWalkable, tileAt } from "@gaem/shared";
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";

import { useGameConnection } from "../composables/useGameConnection.js";

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
const gameState = ref<GameState | null>(null);
const yourPlayerId = ref<string | null>(null);
const lastError = ref<string | null>(null);
const hoveredKey = ref<string | null>(null);
const viewportEl = ref<HTMLElement | null>(null);
const scale = ref(1);
const panX = ref(0);
const panY = ref(0);
let socket: WebSocket | null = null;

const MIN_SCALE = 0.2;
const MAX_SCALE = 4;

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
}));

function fitToView() {
  const el = viewportEl.value;
  const s = gameState.value;
  if (!el || !s) return;
  const pad = 24;
  const w = boardWidthPx.value + pad;
  const h = w * (s.height / s.width) + pad;
  const vw = el.clientWidth;
  const vh = el.clientHeight;
  if (w <= vw && h <= vh) {
    scale.value = 1;
    panX.value = (vw - w) / 2;
    panY.value = (vh - h) / 2;
  } else {
    const fit = Math.min((vw - 16) / w, (vh - 16) / h, 1);
    scale.value = fit;
    panX.value = (vw - w * fit) / 2;
    panY.value = (vh - h * fit) / 2;
  }
}

function onWheel(e: WheelEvent) {
  if (!viewportEl.value) return;
  e.preventDefault();
  const rect = viewportEl.value.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  if (e.ctrlKey || e.metaKey) {
    const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale.value * Math.exp(-e.deltaY * 0.002)));
    const ratio = next / scale.value;
    panX.value = mx - (mx - panX.value) * ratio;
    panY.value = my - (my - panY.value) * ratio;
    scale.value = next;
  } else {
    panX.value -= e.deltaX;
    panY.value -= e.deltaY;
  }
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
  send({ type: "move", x, y });
}

function onKeydown(e: KeyboardEvent) {
  if (props.role !== "player") return;
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

  socket.addEventListener("open", () => {
    connection.value = "connected";
    send({
      type: "join",
      role: props.role,
      playerKey: props.role === "player" ? props.playerProfile?.id : undefined,
      nickname: props.role === "player" ? props.playerProfile?.name : undefined,
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
      gameState.value = msg.state;
      yourPlayerId.value = msg.yourPlayerId;
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

onUnmounted(() => {
  window.removeEventListener("keydown", onKeydown);
  socket?.close();
  connection.value = "disconnected";
});
</script>

<template>
  <div class="game-board">
    <p v-if="lastError" class="error">{{ lastError }}</p>

    <div v-if="gameState" ref="viewportEl" class="board-viewport" @wheel.prevent="onWheel">
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
                  !playerAt(c.x, c.y),
              }"
              :disabled="
                props.role !== 'player' ||
                !isWalkable(getTile(c.x, c.y)) ||
                !isAdjacentToYou(c.x, c.y) ||
                !!playerAt(c.x, c.y)
              "
              @click="tryMove(c.x, c.y)"
              @mouseenter="hoveredKey = c.key"
              @mouseleave="hoveredKey = null"
            >
              <div v-if="hoveredKey === c.key && getTile(c.x, c.y)" class="tile-tooltip">
                <span class="tooltip-row">({{ c.x }}, {{ c.y }})</span>
                <span class="tooltip-row">Terrain: {{ getTile(c.x, c.y)!.terrain.join(", ") }}</span>
                <span class="tooltip-row">Elevation: {{ getTile(c.x, c.y)!.elevation }}</span>
              </div>
              <span
                v-if="playerAt(c.x, c.y)"
                class="piece"
                :style="{
                  background: `hsl(${hueFromId(playerAt(c.x, c.y)!.id)} 70% 45%)`,
                  outline:
                    playerAt(c.x, c.y)!.id === yourPlayerId ? '2px solid #fff' : undefined,
                }"
                :title="playerAt(c.x, c.y)!.nickname ?? playerAt(c.x, c.y)!.id"
              />
            </button>
          </div>
        </div>
      </div>
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
.board-viewport {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  border-radius: 12px;
  border: 1px solid #30363d;
  background: #161b22;
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
.cell.movable:not(:disabled) { cursor: pointer; outline: 1px dashed #388bfd66; }
.cell:disabled:not(.impassable):not(.obstacle):not(.void) { opacity: 0.85; }
.piece { position: absolute; inset: 4px; border-radius: 50%; display: block; z-index: 1; }
.tile-tooltip {
  position: absolute;
  bottom: calc(100% + 4px);
  left: 50%;
  transform: translateX(-50%);
  z-index: 2;
  min-width: 120px;
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
.tooltip-row { display: block; }
.loading { color: #8b949e; }
</style>
