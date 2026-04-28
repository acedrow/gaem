import { randomUUID } from "node:crypto";
import { createServer } from "node:http";

import type {
  ClientMessage,
  PlayerProfile,
  ServerMessage,
} from "@gaem/shared";
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
app.use(express.json());
app.use((_, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  next();
});
app.options("*", (_req, res) => {
  res.sendStatus(204);
});

const playerProfiles = new Map<string, PlayerProfile>();

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/player-profiles", (_req, res) => {
  const active = new Set(
    [...socketProfile.entries()]
      .filter(([ws, profileId]) => !!profileId && !!socketPlayer.get(ws))
      .map(([, profileId]) => profileId as string)
  );
  res.json({
    profiles: [...playerProfiles.values()].map((p) => ({
      ...p,
      isActive: active.has(p.id),
    })),
  });
});

app.post("/api/player-profiles", (req, res) => {
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  if (!name) {
    res.status(400).json({ error: "Name is required" });
    return;
  }
  const now = new Date().toISOString();
  const profile: PlayerProfile = {
    id: randomUUID(),
    name,
    createdAt: now,
    updatedAt: now,
    data: {},
  };
  playerProfiles.set(profile.id, profile);
  res.status(201).json({ profile });
});

const httpServer = createServer(app);

const wss = new WebSocketServer({ noServer: true });

let gameState = createInitialState();

/** socket -> playerId when joined as player, else null for GM */
const socketPlayer = new Map<WebSocket, string | null>();
/** socket -> player profile id when joined as player */
const socketProfile = new Map<WebSocket, string | null>();

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
  socketPlayer.set(ws, null);
  socketProfile.set(ws, null);
  broadcastState();

  ws.on("message", (raw) => {
    let parsed: ClientMessage;
    try {
      parsed = JSON.parse(String(raw)) as ClientMessage;
    } catch {
      sendError(ws, "Invalid JSON");
      return;
    }

    if (parsed.type === "join") {
      const role = parsed.role ?? "player";
      const currentId = socketPlayer.get(ws) ?? null;
      const currentProfileId = socketProfile.get(ws) ?? null;

      if (role === "gm") {
        if (currentId) {
          removePlayer(gameState, currentId);
        }
        socketPlayer.set(ws, null);
        socketProfile.set(ws, null);
        broadcastState();
        return;
      }

      const requestedProfileId = parsed.playerKey ?? currentProfileId ?? null;
      if (!requestedProfileId || !playerProfiles.has(requestedProfileId)) {
        sendError(ws, "Invalid player profile");
        return;
      }

      const profileInUse = [...socketProfile.entries()].some(
        ([otherWs, otherProfileId]) =>
          otherWs !== ws &&
          otherProfileId === requestedProfileId &&
          !!socketPlayer.get(otherWs)
      );
      if (profileInUse) {
        sendError(ws, "That player profile is already in use");
        return;
      }

      if (!currentId) {
        const playerId = randomUUID();
        const joined = addPlayer(gameState, { id: playerId, x: 0, y: 0 });
        if (!joined) {
          sendError(ws, "Board full");
          return;
        }
        socketPlayer.set(ws, playerId);
      }

      const id = socketPlayer.get(ws);
      if (id) {
        const p = gameState.players.find((pl) => pl.id === id);
        const profile = playerProfiles.get(requestedProfileId);
        if (p) p.nickname = profile?.name ?? parsed.nickname;
      }
      socketProfile.set(ws, requestedProfileId);
      broadcastState();
      return;
    }

    if (parsed.type === "move") {
      const id = socketPlayer.get(ws);
      if (!id) {
        sendError(ws, "Only players can move");
        return;
      }
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
    const id = socketPlayer.get(ws);
    if (id) removePlayer(gameState, id);
    socketPlayer.delete(ws);
    socketProfile.delete(ws);
    broadcastState();
  });
});

httpServer.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
