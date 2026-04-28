import type { ClientMessage, ServerMessage } from "@gaem/shared";
import {
  addPlayer,
  applyMove,
  createInitialState,
  removePlayer,
  validateMove,
} from "@gaem/shared";

import type { Env } from "./env.js";
import { getPlayerProfile, savePlayerProfile } from "./player-profiles.js";

type Attachment = { playerId: string | null; playerKey: string | null };

export class GameRoom {
  private gameState = createInitialState();
  private readonly env: Env;

  constructor(
    private readonly ctx: DurableObjectState,
    env: Env
  ) {
    this.env = env;
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
    } satisfies Attachment);

    this.broadcastState();

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
        } satisfies Attachment);
        this.broadcastState();
        return;
      }

      const playerKey = parsed.playerKey ?? currentKey ?? crypto.randomUUID();
      if (this.profileInUseByAnotherSocket(playerKey, ws)) {
        this.sendError(ws, "That player profile is already in use");
        return;
      }
      const profile = await getPlayerProfile(this.env, playerKey);
      let playerId = currentId;
      if (!playerId) {
        playerId = crypto.randomUUID();
        const joined = addPlayer(this.gameState, { id: playerId, x: 0, y: 0 });
        if (!joined) {
          this.sendError(ws, "Board full");
          return;
        }
      }

      const p = this.gameState.players.find((pl) => pl.id === playerId);
      if (p) p.nickname = parsed.nickname ?? profile?.name;
      ws.serializeAttachment({ playerId, playerKey } satisfies Attachment);
      if (profile && p?.nickname && p.nickname !== profile.name) {
        await savePlayerProfile(this.env, {
          ...profile,
          name: p.nickname,
          updatedAt: new Date().toISOString(),
        });
      }
      this.broadcastState();
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
      this.broadcastState();
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    const att = ws.deserializeAttachment() as Attachment | null;
    const playerId = att?.playerId;
    const playerKey = att?.playerKey;
    if (playerId) {
      const movedPlayer = this.gameState.players.find((pl) => pl.id === playerId);
      removePlayer(this.gameState, playerId);
      if (playerKey) {
        const profile = await getPlayerProfile(this.env, playerKey);
        if (profile) {
          await savePlayerProfile(this.env, {
            ...profile,
            name: movedPlayer?.nickname ?? profile.name,
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
      } satisfies Attachment);
      this.broadcastState();
    }
  }

  private sendError(ws: WebSocket, message: string): void {
    const msg: ServerMessage = { type: "error", message };
    ws.send(JSON.stringify(msg));
  }

  private broadcastState(): void {
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

  private profileInUseByAnotherSocket(profileId: string, socket: WebSocket): boolean {
    for (const s of this.ctx.getWebSockets()) {
      if (s === socket) continue;
      const att = s.deserializeAttachment() as Attachment | null;
      if (att?.playerId && att.playerKey === profileId) return true;
    }
    return false;
  }
}
