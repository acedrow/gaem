<script setup lang="ts">
import type { ClientMessage, GameState, ServerMessage } from "@gaem/shared";
import { computed, onMounted, onUnmounted, ref } from "vue";

const wsUrl =
  import.meta.env.VITE_WS_URL ??
  (import.meta.env.DEV
    ? `ws://${location.hostname}:3001/ws`
    : `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/ws`);

const connection = ref<"connecting" | "open" | "closed">("connecting");
const gameState = ref<GameState | null>(null);
const yourPlayerId = ref<string | null>(null);
const lastError = ref<string | null>(null);

let socket: WebSocket | null = null;

function hueFromId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % 360;
}

const gridStyle = computed(() => {
  const s = gameState.value;
  if (!s) return {};
  return {
    gridTemplateColumns: `repeat(${s.width}, minmax(0, 1fr))`,
    gridTemplateRows: `repeat(${s.height}, minmax(0, 1fr))`,
  };
});

const cells = computed(() => {
  const s = gameState.value;
  if (!s) return [] as { x: number; y: number; key: string }[];
  const out: { x: number; y: number; key: string }[] = [];
  for (let y = 0; y < s.height; y++) {
    for (let x = 0; x < s.width; x++) {
      out.push({ x, y, key: `${x}-${y}` });
    }
  }
  return out;
});

const boardAspectRatio = computed(() => {
  const s = gameState.value;
  if (!s) return "1 / 1";
  return `${s.width} / ${s.height}`;
});

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
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(msg));
  }
}

function tryMove(x: number, y: number) {
  lastError.value = null;
  if (!yourPlayerId.value || !gameState.value) return;
  if (!isAdjacentToYou(x, y)) return;
  send({ type: "move", x, y });
}

function onKeydown(e: KeyboardEvent) {
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
    connection.value = "open";
    send({ type: "join" });
  });

  socket.addEventListener("close", () => {
    connection.value = "closed";
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

onMounted(() => {
  connect();
  window.addEventListener("keydown", onKeydown);
});

onUnmounted(() => {
  window.removeEventListener("keydown", onKeydown);
  socket?.close();
});
</script>

<template>
  <header class="header">
    <h1 class="title">Gaem</h1>
    <p class="meta">
      Status:
      <span :class="['pill', connection]">{{ connection }}</span>
      <template v-if="yourPlayerId">
        · You:
        <code class="id">{{ yourPlayerId.slice(0, 8) }}…</code>
      </template>
    </p>
    <p class="hint">Click an adjacent tile or use arrow keys to move.</p>
    <p v-if="lastError" class="error">{{ lastError }}</p>
  </header>

  <div v-if="gameState" class="board-wrap">
    <div class="board" :style="gridStyle">
      <button
        v-for="c in cells"
        :key="c.key"
        type="button"
        class="cell"
        :class="{
          wall: gameState.tiles[c.y][c.x] === 'wall',
          movable:
            gameState.tiles[c.y][c.x] === 'empty' &&
            isAdjacentToYou(c.x, c.y) &&
            !playerAt(c.x, c.y),
        }"
        :disabled="
          gameState.tiles[c.y][c.x] === 'wall' ||
          !isAdjacentToYou(c.x, c.y) ||
          !!playerAt(c.x, c.y)
        "
        @click="tryMove(c.x, c.y)"
      >
        <span
          v-if="playerAt(c.x, c.y)"
          class="piece"
          :style="{
            background: `hsl(${hueFromId(playerAt(c.x, c.y)!.id)} 70% 45%)`,
            outline:
              playerAt(c.x, c.y)!.id === yourPlayerId
                ? '2px solid #fff'
                : undefined,
          }"
          :title="playerAt(c.x, c.y)!.nickname ?? playerAt(c.x, c.y)!.id"
        />
      </button>
    </div>
  </div>

  <p v-else class="loading">Loading board…</p>
</template>

<style scoped>
.header {
  margin-bottom: 1.25rem;
}

.title {
  margin: 0 0 0.35rem;
  font-size: 1.75rem;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.meta {
  margin: 0;
  color: #8b949e;
  font-size: 0.95rem;
}

.hint {
  margin: 0.5rem 0 0;
  color: #6e7681;
  font-size: 0.875rem;
}

.error {
  margin: 0.75rem 0 0;
  color: #f85149;
  font-size: 0.9rem;
}

.id {
  color: #79c0ff;
  font-size: 0.85rem;
}

.pill {
  display: inline-block;
  padding: 0.1rem 0.45rem;
  border-radius: 999px;
  font-size: 0.8rem;
  font-weight: 600;
  text-transform: capitalize;
}

.pill.connecting {
  background: #3d444d;
  color: #d29922;
}

.pill.open {
  background: #23863633;
  color: #3fb950;
}

.pill.closed {
  background: #f8514933;
  color: #f85149;
}

.board-wrap {
  overflow: auto;
  border-radius: 12px;
  border: 1px solid #30363d;
  background: #161b22;
  padding: 0.75rem;
}

.board {
  display: grid;
  gap: 3px;
  width: min(100%, 520px);
  aspect-ratio: v-bind(boardAspectRatio);
}

.cell {
  position: relative;
  border: none;
  border-radius: 4px;
  min-height: 28px;
  padding: 0;
  cursor: default;
  background: #21262d;
}

.cell.wall {
  background: #484f58;
  cursor: not-allowed;
}

.cell.movable:not(:disabled) {
  cursor: pointer;
  outline: 1px dashed #388bfd66;
}

.cell:disabled:not(.wall) {
  opacity: 0.85;
}

.piece {
  position: absolute;
  inset: 4px;
  border-radius: 50%;
  display: block;
}

.loading {
  color: #8b949e;
}
</style>
