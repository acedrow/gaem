import "dotenv/config";

import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type {
  ClientMessage,
  ConsoleActor,
  ConsoleLogEntry,
  GaemRole,
  GameState,
  PlayerProfile,
  ServerMessage,
} from "@gaem/shared";
import {
  addEnemy,
  applyEnemyMove,
  applyMove,
  applyPhaseAction,
  characterTargetLabel,
  CONSOLE_MSG_CONNECTED,
  CONSOLE_MSG_DISCONNECTED,
  createInitialStateFromMap,
  DEFAULT_MAP_ID,
  enemyLabel,
  handleCombatMessage,
  normalizeGameState,
  parseGameMap,
  removeEnemy,
  removePlayer,
  resolvePlayerForJoin,
  setPlayerHp,
  syncPlayerSheet,
  validateEnemyMove,
  validateMove,
  validatePhaseAction,
} from "@gaem/shared";
import express from "express";
import { WebSocketServer, type WebSocket } from "ws";

import {
  appendConsole,
  getConsoleEntries,
  registerConsoleBroadcaster,
} from "./console-log.js";
import {
  createSheetHandler,
  deleteSheetHandler,
  getPortraitHandler,
  getSheetHandler,
  listSheetsHandler,
  patchSheetHandler,
  putPortraitHandler,
  characterSheets,
} from "./character-sheets.js";
import { parseAuth } from "./auth.js";
import { randomIntegersHandler, rollDiceHandler } from "./random-integers.js";

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

app.get("/api/random-integers", (req, res) => {
  void randomIntegersHandler(req, res);
});

app.post("/api/random-integers", (req, res) => {
  const auth = parseAuth(req, res);
  if (!auth) return;
  void rollDiceHandler(req, res, (message) => {
    broadcastConsole(actorForAuth(auth), message);
  });
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

function resolveSheetForJoin(
  playerKey: string,
  characterSheetId?: string
): { className?: string; characterSheetId?: string; armor?: string; weapon?: string } {
  if (characterSheetId) {
    const sheet = characterSheets.get(characterSheetId);
    if (sheet?.player === playerKey) {
      return {
        className: sheet.class,
        characterSheetId: sheet.id,
        armor: sheet.armor,
        weapon: sheet.weapon,
      };
    }
  }
  const sheet = [...characterSheets.values()].find((s) => s.player === playerKey);
  return sheet
    ? {
        className: sheet.class,
        characterSheetId: sheet.id,
        armor: sheet.armor,
        weapon: sheet.weapon,
      }
    : {};
}

function canSetPlayerHp(
  role: GaemRole | null | undefined,
  socketPlayerId: string | null | undefined,
  targetPlayerId: string
): boolean {
  if (role === "gm") return true;
  return role === "player" && socketPlayerId === targetPlayerId;
}

function canSyncPlayerSheet(
  role: GaemRole | null | undefined,
  playerKey: string | null | undefined,
  characterSheetId: string
): boolean {
  if (role === "gm") return true;
  const sheet = characterSheets.get(characterSheetId);
  return role === "player" && !!playerKey && sheet?.player === playerKey;
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
  patchSheetHandler(auth, req.params.id, req, res, hasProfile, {
    actor: actorForAuth(auth),
    sheetOnBoard: gameState.players.some((p) => p.characterSheetId === req.params.id),
    logConsole: appendConsole,
  });
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
/** socket -> role after join */
const socketRole = new Map<WebSocket, GaemRole | null>();

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
  delete gameState.damageEvents;
}

function actorForAuth(auth: { role: GaemRole; playerKey: string | null }): ConsoleActor {
  if (auth.role === "gm") return { name: "GM", role: "gm" };
  const profile = auth.playerKey ? playerProfiles.get(auth.playerKey) : undefined;
  return { name: profile?.name ?? "Player", role: "player" };
}

function actorForSocket(ws: WebSocket): ConsoleActor {
  const role = socketRole.get(ws);
  if (role === "gm") return { name: "GM", role: "gm" };
  const profileId = socketProfile.get(ws);
  const profile = profileId ? playerProfiles.get(profileId) : undefined;
  const playerId = socketPlayer.get(ws);
  const player = playerId
    ? gameState.players.find((p) => p.id === playerId)
    : undefined;
  return { name: profile?.name ?? player?.nickname ?? "Player", role: "player" };
}

function targetLabelForPlayer(playerId: string): string {
  const player = gameState.players.find((p) => p.id === playerId);
  const sheet = player?.characterSheetId
    ? characterSheets.get(player.characterSheetId)
    : undefined;
  return characterTargetLabel(player, sheet?.name);
}

function broadcastConsoleEntry(entry: ConsoleLogEntry): void {
  const msg: ServerMessage = { type: "console", entry };
  const payload = JSON.stringify(msg);
  for (const ws of wss.clients) {
    if (ws.readyState === ws.OPEN) ws.send(payload);
  }
}

function broadcastConsole(actor: ConsoleActor, message: string): void {
  appendConsole(actor, message);
}

registerConsoleBroadcaster(broadcastConsoleEntry);

function sendConsoleSync(ws: WebSocket): void {
  const msg: ServerMessage = { type: "consoleSync", entries: getConsoleEntries() };
  ws.send(JSON.stringify(msg));
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
  socketRole.set(ws, null);
  sendConsoleSync(ws);
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
        socketRole.set(ws, "gm");
        broadcastConsole(actorForSocket(ws), CONSOLE_MSG_CONNECTED);
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
      const sheetJoin = resolveSheetForJoin(
        requestedProfileId,
        parsed.characterSheetId
      );
      const resolved = resolvePlayerForJoin(gameState, {
        playerKey: requestedProfileId,
        nickname,
        preferredId: currentId,
        newId: randomUUID(),
        className: sheetJoin.className,
        characterSheetId: sheetJoin.characterSheetId,
        armor: sheetJoin.armor,
        weapon: sheetJoin.weapon,
      });
      if ("error" in resolved) {
        sendError(ws, "Board full");
        return;
      }
      socketPlayer.set(ws, resolved.playerId);
      socketProfile.set(ws, requestedProfileId);
      socketRole.set(ws, "player");
      broadcastConsole(actorForSocket(ws), CONSOLE_MSG_CONNECTED);
      broadcastState();
      return;
    }

    const role = socketRole.get(ws);
    if (parsed.type === "moveEnemy" || parsed.type === "addEnemy" || parsed.type === "removeEnemy") {
      if (role !== "gm") {
        sendError(ws, "Only the game master can manage enemies");
        return;
      }
      if (parsed.type === "moveEnemy") {
        const enemy = gameState.enemies.find((e) => e.id === parsed.enemyId);
        const err = validateEnemyMove(gameState, parsed.enemyId, parsed.x, parsed.y);
        if (err) {
          sendError(ws, err);
          return;
        }
        applyEnemyMove(gameState, parsed.enemyId, parsed.x, parsed.y);
        if (enemy) {
          broadcastConsole(actorForSocket(ws), `moved ${enemyLabel(enemy)} to (${parsed.x}, ${parsed.y})`);
        }
      } else if (parsed.type === "addEnemy") {
        const id = randomUUID();
        const err = addEnemy(gameState, {
          id,
          x: parsed.x,
          y: parsed.y,
          ...(parsed.name !== undefined ? { name: parsed.name } : {}),
        });
        if (err) {
          sendError(ws, err);
          return;
        }
        const enemy = gameState.enemies.find((e) => e.id === id);
        if (enemy) {
          broadcastConsole(actorForSocket(ws), `spawned ${enemyLabel(enemy)} at (${parsed.x}, ${parsed.y})`);
        }
      } else {
        const enemy = gameState.enemies.find((e) => e.id === parsed.enemyId);
        if (!removeEnemy(gameState, parsed.enemyId)) {
          sendError(ws, "Unknown enemy");
          return;
        }
        if (enemy) {
          broadcastConsole(actorForSocket(ws), `removed ${enemyLabel(enemy)}`);
        }
      }
      broadcastState();
      return;
    }

    if (parsed.type === "setPlayerHp") {
      const role = socketRole.get(ws);
      const playerId = socketPlayer.get(ws);
      if (!canSetPlayerHp(role, playerId, parsed.playerId)) {
        sendError(ws, "Forbidden");
        return;
      }
      if (!Number.isFinite(parsed.hp)) {
        sendError(ws, "Invalid HP");
        return;
      }
      const err = setPlayerHp(gameState, parsed.playerId, Math.trunc(parsed.hp));
      if (err) {
        sendError(ws, err);
        return;
      }
      broadcastConsole(
        actorForSocket(ws),
        `set ${targetLabelForPlayer(parsed.playerId)} HP to ${Math.trunc(parsed.hp)}`,
      );
      broadcastState();
      return;
    }

    if (parsed.type === "syncPlayerSheet") {
      const role = socketRole.get(ws);
      const playerKey = socketProfile.get(ws);
      if (!canSyncPlayerSheet(role, playerKey, parsed.characterSheetId)) {
        sendError(ws, "Forbidden");
        return;
      }
      const sheet = characterSheets.get(parsed.characterSheetId);
      const err = syncPlayerSheet(
        gameState,
        parsed.characterSheetId,
        parsed.class,
        parsed.armor,
        parsed.weapon,
      );
      if (err) {
        sendError(ws, err);
        return;
      }
      broadcastConsole(
        actorForSocket(ws),
        `set ${sheet?.name ?? "Character"} class to ${parsed.class}`,
      );
      broadcastState();
      return;
    }

    if (parsed.type === "setEnforceTurns") {
      if (socketRole.get(ws) !== "gm") {
        sendError(ws, "Only the game master can do that");
        return;
      }
      gameState.enforceTurns = parsed.enforceTurns;
      broadcastConsole(
        actorForSocket(ws),
        parsed.enforceTurns ? "Enforce turns enabled" : "Enforce turns disabled",
      );
      broadcastState();
      return;
    }

    const combatCtx = { role: role ?? "player", playerId: socketPlayer.get(ws) ?? null };

    const combatResult = handleCombatMessage(gameState, parsed, combatCtx);
    if (combatResult.handled) {
      if ("error" in combatResult) {
        sendError(ws, combatResult.error);
        return;
      }
      broadcastConsole(actorForSocket(ws), combatResult.message);
      broadcastState();
      return;
    }

    if (parsed.type === "phaseAction") {
      if (!role) {
        sendError(ws, "Not joined");
        return;
      }
      const ctx = { role, playerId: socketPlayer.get(ws) ?? null };
      const err = validatePhaseAction(gameState, parsed.action, ctx);
      if (err) {
        sendError(ws, err);
        return;
      }
      const message = applyPhaseAction(gameState, parsed.action, ctx);
      broadcastConsole(actorForSocket(ws), message);
      broadcastState();
      return;
    }

    if (parsed.type === "move") {
      const id = socketPlayer.get(ws);
      if (!id) {
        sendError(ws, "Only players can move");
        return;
      }
      if (gameState.roundPhase === "playerTurn") {
        const result = handleCombatMessage(
          gameState,
          { type: "movePath", path: [{ x: parsed.x, y: parsed.y }] },
          { role: role ?? "player", playerId: id },
        );
        if (result.handled && "error" in result) {
          sendError(ws, result.error);
          return;
        }
        if (result.handled && "message" in result) {
          broadcastConsole(actorForSocket(ws), result.message);
          broadcastState();
        }
        return;
      }
      const err = validateMove(gameState, id, parsed.x, parsed.y);
      if (err) {
        sendError(ws, err);
        return;
      }
      applyMove(gameState, id, parsed.x, parsed.y);
      broadcastConsole(actorForSocket(ws), `moved to (${parsed.x}, ${parsed.y})`);
      broadcastState();
    }
  });

  ws.on("close", () => {
    const actor = actorForSocket(ws);
    if (socketRole.get(ws)) {
      broadcastConsole(actor, CONSOLE_MSG_DISCONNECTED);
    }
    socketPlayer.delete(ws);
    socketProfile.delete(ws);
    socketRole.delete(ws);
  });
});

async function loadMap(): Promise<void> {
  const mapsDir = join(
    fileURLToPath(new URL(".", import.meta.url)),
    "../../maps"
  );
  const raw = await readFile(join(mapsDir, `${DEFAULT_MAP_ID}.json`), "utf8");
  const map = parseGameMap(JSON.parse(raw));
  gameState = normalizeGameState(createInitialStateFromMap(map));
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
