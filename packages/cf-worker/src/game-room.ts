import type { ClientMessage, GaemRole, GameState, ServerMessage } from "@gaem/shared";
import {
  addEnemy,
  addPlayer,
  applyEnemyMove,
  applyMove,
  createInitialStateFromMap,
  DEFAULT_MAP_ID,
  normalizeGameState,
  removeEnemy,
  removePlayer,
  resolvePlayerForJoin,
  setPlayerHp,
  syncPlayerSheet,
  validateEnemyMove,
  validateMove,
} from "@gaem/shared";

import type { Env } from "./env.js";
import { getCharacterSheet, listCharacterSheets } from "./character-sheets.js";
import { getMap } from "./maps.js";
import { getPlayerProfile, savePlayerProfile } from "./player-profiles.js";

type Attachment = { playerId: string | null; playerKey: string | null; role: GaemRole | null };

const GAME_STATE_KEY = "gameState";

async function resolveSheetForJoin(
  env: Env,
  playerKey: string,
  characterSheetId?: string
): Promise<{ className?: string; characterSheetId?: string }> {
  if (characterSheetId) {
    const sheet = await getCharacterSheet(env, characterSheetId);
    if (sheet?.player === playerKey) {
      return { className: sheet.class, characterSheetId: sheet.id };
    }
  }
  const sheets = await listCharacterSheets(env);
  const sheet = sheets.find((s) => s.player === playerKey);
  return sheet ? { className: sheet.class, characterSheetId: sheet.id } : {};
}

function canSetPlayerHp(
  role: GaemRole | null | undefined,
  socketPlayerId: string | null | undefined,
  targetPlayerId: string
): boolean {
  if (role === "gm") return true;
  return role === "player" && socketPlayerId === targetPlayerId;
}

async function canSyncPlayerSheet(
  env: Env,
  role: GaemRole | null | undefined,
  playerKey: string | null | undefined,
  characterSheetId: string
): Promise<boolean> {
  if (role === "gm") return true;
  const sheet = await getCharacterSheet(env, characterSheetId);
  return role === "player" && !!playerKey && sheet?.player === playerKey;
}

export class GameRoom {
  private gameState!: GameState;
  private readonly env: Env;

  constructor(
    private readonly ctx: DurableObjectState,
    env: Env
  ) {
    this.env = env;
    this.ctx.blockConcurrencyWhile(async () => {
      const stored = await this.ctx.storage.get<GameState>(GAME_STATE_KEY);
      if (stored) {
        this.gameState = normalizeGameState(stored);
      } else {
        const map = await getMap(this.env, DEFAULT_MAP_ID);
        this.gameState = createInitialStateFromMap(map);
        await this.ctx.storage.put(GAME_STATE_KEY, this.gameState);
      }
      this.reconcilePlayersFromSockets();
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/internal/active-profiles") {
      return Response.json({ activeProfileIds: this.activeProfileIds() });
    }

    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({
      playerId: null,
      playerKey: null,
      role: null,
    } satisfies Attachment);

    await this.broadcastState();

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(
    ws: WebSocket,
    message: string | ArrayBuffer
  ): Promise<void> {
    const text =
      typeof message === "string"
        ? message
        : new TextDecoder().decode(message);

    let parsed: ClientMessage;
    try {
      parsed = JSON.parse(text) as ClientMessage;
    } catch {
      this.sendError(ws, "Invalid JSON");
      return;
    }

    const att = ws.deserializeAttachment() as Attachment | null;
    if (parsed.type === "join") {
      const role = parsed.role ?? "player";
      const currentId = att?.playerId ?? null;
      const currentKey = att?.playerKey ?? null;

      if (role === "gm") {
        if (currentId) {
          removePlayer(this.gameState, currentId);
        }
        ws.serializeAttachment({
          playerId: null,
          playerKey: null,
          role: "gm",
        } satisfies Attachment);
        await this.broadcastState();
        return;
      }

      const playerKey = parsed.playerKey ?? currentKey ?? crypto.randomUUID();
      if (this.profileInUseByAnotherSocket(playerKey, ws)) {
        this.sendError(ws, "That player profile is already in use");
        return;
      }
      const profile = await getPlayerProfile(this.env, playerKey);
      const nickname = parsed.nickname ?? profile?.name;
      const sheetJoin = await resolveSheetForJoin(
        this.env,
        playerKey,
        parsed.characterSheetId
      );
      const resolved = resolvePlayerForJoin(this.gameState, {
        playerKey,
        nickname,
        preferredId: currentId,
        newId: crypto.randomUUID(),
        className: sheetJoin.className,
        characterSheetId: sheetJoin.characterSheetId,
      });
      if ("error" in resolved) {
        this.sendError(ws, "Board full");
        return;
      }
      const playerId = resolved.playerId;

      const p = this.gameState.players.find((pl) => pl.id === playerId);
      ws.serializeAttachment({ playerId, playerKey, role: "player" } satisfies Attachment);
      if (profile && p?.nickname && p.nickname !== profile.name) {
        await savePlayerProfile(this.env, {
          ...profile,
          name: p.nickname,
          updatedAt: new Date().toISOString(),
        });
      }
      await this.broadcastState();
      return;
    }

    if (parsed.type === "moveEnemy" || parsed.type === "addEnemy" || parsed.type === "removeEnemy") {
      if (att?.role !== "gm") {
        this.sendError(ws, "Only the game master can manage enemies");
        return;
      }
      if (parsed.type === "moveEnemy") {
        const err = validateEnemyMove(this.gameState, parsed.enemyId, parsed.x, parsed.y);
        if (err) {
          this.sendError(ws, err);
          return;
        }
        applyEnemyMove(this.gameState, parsed.enemyId, parsed.x, parsed.y);
      } else if (parsed.type === "addEnemy") {
        const id = crypto.randomUUID();
        const err = addEnemy(this.gameState, {
          id,
          x: parsed.x,
          y: parsed.y,
          ...(parsed.name !== undefined ? { name: parsed.name } : {}),
        });
        if (err) {
          this.sendError(ws, err);
          return;
        }
      } else if (!removeEnemy(this.gameState, parsed.enemyId)) {
        this.sendError(ws, "Unknown enemy");
        return;
      }
      await this.broadcastState();
      return;
    }

    if (parsed.type === "setPlayerHp") {
      if (!canSetPlayerHp(att?.role, att?.playerId, parsed.playerId)) {
        this.sendError(ws, "Forbidden");
        return;
      }
      if (!Number.isFinite(parsed.hp)) {
        this.sendError(ws, "Invalid HP");
        return;
      }
      const err = setPlayerHp(this.gameState, parsed.playerId, Math.trunc(parsed.hp));
      if (err) {
        this.sendError(ws, err);
        return;
      }
      await this.broadcastState();
      return;
    }

    if (parsed.type === "syncPlayerSheet") {
      if (!(await canSyncPlayerSheet(this.env, att?.role, att?.playerKey, parsed.characterSheetId))) {
        this.sendError(ws, "Forbidden");
        return;
      }
      const err = syncPlayerSheet(this.gameState, parsed.characterSheetId, parsed.class);
      if (err) {
        this.sendError(ws, err);
        return;
      }
      await this.broadcastState();
      return;
    }

    if (parsed.type === "move") {
      const id = att?.playerId;
      if (!id) {
        this.sendError(ws, "Only players can move");
        return;
      }
      const err = validateMove(this.gameState, id, parsed.x, parsed.y);
      if (err) {
        this.sendError(ws, err);
        return;
      }
      applyMove(this.gameState, id, parsed.x, parsed.y);
      const key = att?.playerKey;
      if (key) {
        const profile = await getPlayerProfile(this.env, key);
        if (profile) {
          const moveCount = Number(profile.data.moveCount ?? 0) + 1;
          await savePlayerProfile(this.env, {
            ...profile,
            updatedAt: new Date().toISOString(),
            data: {
              ...profile.data,
              moveCount,
              lastSeenAt: new Date().toISOString(),
            },
          });
        }
      }
      await this.broadcastState();
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    const att = ws.deserializeAttachment() as Attachment | null;
    const playerId = att?.playerId;
    const playerKey = att?.playerKey;
    if (playerKey) {
      const player = playerId
        ? this.gameState.players.find((pl) => pl.id === playerId)
        : undefined;
      const profile = await getPlayerProfile(this.env, playerKey);
      if (profile) {
        await savePlayerProfile(this.env, {
          ...profile,
          name: player?.nickname ?? profile.name,
          updatedAt: new Date().toISOString(),
          data: {
            ...profile.data,
            lastSeenAt: new Date().toISOString(),
          },
        });
      }
    }
    ws.serializeAttachment({
      playerId: null,
      playerKey: att?.playerKey ?? null,
      role: att?.role ?? null,
    } satisfies Attachment);
  }

  private sendError(ws: WebSocket, message: string): void {
    const msg: ServerMessage = { type: "error", message };
    ws.send(JSON.stringify(msg));
  }

  private async broadcastState(): Promise<void> {
    await this.ctx.storage.put(GAME_STATE_KEY, this.gameState);
    const snapshot = structuredClone(this.gameState);
    for (const socket of this.ctx.getWebSockets()) {
      const att = socket.deserializeAttachment() as Attachment | null;
      const yourId = att?.playerId ?? null;
      const msg: ServerMessage = {
        type: "state",
        state: snapshot,
        yourPlayerId: yourId,
      };
      socket.send(JSON.stringify(msg));
    }
  }

  private activeProfileIds(): string[] {
    const ids = new Set<string>();
    for (const socket of this.ctx.getWebSockets()) {
      const att = socket.deserializeAttachment() as Attachment | null;
      if (att?.playerId && att.playerKey) {
        ids.add(att.playerKey);
      }
    }
    return [...ids];
  }

  private reconcilePlayersFromSockets(): void {
    for (const socket of this.ctx.getWebSockets()) {
      const att = socket.deserializeAttachment() as Attachment | null;
      if (!att?.playerId) continue;
      if (this.gameState.players.some((p) => p.id === att.playerId)) continue;
      addPlayer(this.gameState, { id: att.playerId, x: 0, y: 0 });
    }
  }

  private profileInUseByAnotherSocket(profileId: string, socket: WebSocket): boolean {
    for (const s of this.ctx.getWebSockets()) {
      if (s === socket) continue;
      const att = s.deserializeAttachment() as Attachment | null;
      if (att?.playerId && att.playerKey === profileId) return true;
    }
    return false;
  }
}
