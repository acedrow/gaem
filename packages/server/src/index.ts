import { randomUUID } from "node:crypto";
import { createServer } from "node:http";

import type { ClientMessage, ServerMessage } from "@gaem/shared";
import express from "express";
import { WebSocketServer, type WebSocket } from "ws";

import {
  addPlayer,
  applyMove,
  createInitialState,
  removePlayer,
  validateMove,
} from "@gaem/shared";

const PORT = Number(process.env.PORT) || 3001;

const app = express();
app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

const httpServer = createServer(app);

const wss = new WebSocketServer({ noServer: true });

let gameState = createInitialState();

/** socket -> playerId once joined */
const socketPlayer = new Map<WebSocket, string>();

function cloneState() {
  return structuredClone(gameState);
}

function broadcastState(): void {
  const snapshot = cloneState();
  for (const ws of wss.clients) {
    if (ws.readyState !== ws.OPEN) continue;
    const yourId = socketPlayer.get(ws) ?? null;
    const msg: ServerMessage = {
      type: "state",
      state: snapshot,
      yourPlayerId: yourId,
    };
    ws.send(JSON.stringify(msg));
  }
}

function sendError(ws: WebSocket, message: string): void {
  const msg: ServerMessage = { type: "error", message };
  ws.send(JSON.stringify(msg));
}

httpServer.on("upgrade", (request, socket, head) => {
  const host = request.headers.host ?? "localhost";
  try {
    const url = new URL(request.url ?? "/", `http://${host}`);
    if (url.pathname !== "/ws") {
      socket.destroy();
      return;
    }
  } catch {
    socket.destroy();
    return;
  }

  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit("connection", ws, request);
  });
});

wss.on("connection", (ws: WebSocket) => {
  const playerId = randomUUID();

  const joined = addPlayer(gameState, { id: playerId, x: 0, y: 0 });
  if (!joined) {
    sendError(ws, "Board full");
    ws.close();
    return;
  }

  socketPlayer.set(ws, playerId);
  broadcastState();

  ws.on("message", (raw) => {
    let parsed: ClientMessage;
    try {
      parsed = JSON.parse(String(raw)) as ClientMessage;
    } catch {
      sendError(ws, "Invalid JSON");
      return;
    }

    const id = socketPlayer.get(ws);
    if (!id) {
      sendError(ws, "Not joined");
      return;
    }

    if (parsed.type === "join") {
      const p = gameState.players.find((pl) => pl.id === id);
      if (p) p.nickname = parsed.nickname;
      broadcastState();
      return;
    }

    if (parsed.type === "move") {
      const err = validateMove(gameState, id, parsed.x, parsed.y);
      if (err) {
        sendError(ws, err);
        return;
      }
      applyMove(gameState, id, parsed.x, parsed.y);
      broadcastState();
    }
  });

  ws.on("close", () => {
    socketPlayer.delete(ws);
    removePlayer(gameState, playerId);
    broadcastState();
  });
});

httpServer.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
