import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type {
  ClientMessage,
  GameState,
  PlayerProfile,
  ServerMessage,
} from "@gaem/shared";
import {
  applyMove,
  createInitialStateFromMap,
  DEFAULT_MAP_ID,
  parseGameMap,
  removePlayer,
  resolvePlayerForJoin,
  validateMove,
} from "@gaem/shared";
import express from "express";
import { WebSocketServer, type WebSocket } from "ws";

import {
  createSheetHandler,
  deleteSheetHandler,
  getPortraitHandler,
  getSheetHandler,
  listSheetsHandler,
  patchSheetHandler,
  putPortraitHandler,
} from "./character-sheets.js";
import { parseAuth } from "./auth.js";

const PORT = Number(process.env.PORT) || 3001;

const app = express();
app.use(express.json());
app.use((_, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, X-Gaem-Role, X-Gaem-Player-Key"
  );
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

const portraitParser = express.raw({
  type: ["image/jpeg", "image/png", "image/webp"],
  limit: "5mb",
});

function hasProfile(id: string): boolean {
  return playerProfiles.has(id);
}

app.get("/api/character-sheets", (req, res) => {
  const auth = parseAuth(req, res);
  if (!auth) return;
  listSheetsHandler(auth, res);
});

app.post("/api/character-sheets", (req, res) => {
  const auth = parseAuth(req, res);
  if (!auth) return;
  createSheetHandler(auth, req, res, hasProfile);
});

app.get("/api/character-sheets/:id", (req, res) => {
  const auth = parseAuth(req, res);
  if (!auth) return;
  getSheetHandler(auth, req.params.id, res);
});

app.patch("/api/character-sheets/:id", (req, res) => {
  const auth = parseAuth(req, res);
  if (!auth) return;
  patchSheetHandler(auth, req.params.id, req, res, hasProfile);
});

app.delete("/api/character-sheets/:id", (req, res) => {
  const auth = parseAuth(req, res);
  if (!auth) return;
  deleteSheetHandler(auth, req.params.id, res);
});

app.put("/api/character-sheets/:id/portrait", portraitParser, (req, res) => {
  const auth = parseAuth(req, res);
  if (!auth) return;
  putPortraitHandler(auth, req.params.id, req, res);
});

app.get("/api/character-sheets/:id/portrait", (req, res) => {
  const auth = parseAuth(req, res);
  if (!auth) return;
  getPortraitHandler(auth, req.params.id, res);
});

const httpServer = createServer(app);

const wss = new WebSocketServer({ noServer: true });

let gameState: GameState;

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

      const profile = playerProfiles.get(requestedProfileId);
      const nickname = profile?.name ?? parsed.nickname;
      const resolved = resolvePlayerForJoin(gameState, {
        playerKey: requestedProfileId,
        nickname,
        preferredId: currentId,
        newId: randomUUID(),
      });
      if ("error" in resolved) {
        sendError(ws, "Board full");
        return;
      }
      socketPlayer.set(ws, resolved.playerId);
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
    socketPlayer.delete(ws);
    socketProfile.delete(ws);
  });
});

async function loadMap(): Promise<void> {
  const mapsDir = join(
    fileURLToPath(new URL(".", import.meta.url)),
    "../../maps"
  );
  const raw = await readFile(join(mapsDir, `${DEFAULT_MAP_ID}.json`), "utf8");
  const map = parseGameMap(JSON.parse(raw));
  gameState = createInitialStateFromMap(map);
}

loadMap()
  .then(() => {
    httpServer.listen(PORT, () => {
      console.log(`Server listening on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Failed to load map:", err);
    process.exit(1);
  });
