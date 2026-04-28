import type { ClientMessage, ServerMessage } from "@gaem/shared";
import {
  addPlayer,
  applyMove,
  createInitialState,
  removePlayer,
  validateMove,
} from "@gaem/shared";

import type { Env } from "./env.js";

type Attachment = { playerId: string | null; playerKey: string | null };
type PlayerProfile = {
  nickname?: string;
  moveCount: number;
  lastSeenAt: string;
};

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
      const profile = await this.readPlayerProfile(playerKey);
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
      if (p) p.nickname = parsed.nickname ?? profile?.nickname;
      ws.serializeAttachment({ playerId, playerKey } satisfies Attachment);
      await this.writePlayerProfile(playerKey, {
        nickname: p?.nickname,
        moveCount: profile?.moveCount ?? 0,
        lastSeenAt: new Date().toISOString(),
      });
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
        const profile = await this.readPlayerProfile(key);
        const movedPlayer = this.gameState.players.find((pl) => pl.id === id);
        await this.writePlayerProfile(key, {
          nickname: movedPlayer?.nickname ?? profile?.nickname,
          moveCount: (profile?.moveCount ?? 0) + 1,
          lastSeenAt: new Date().toISOString(),
        });
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
        const profile = await this.readPlayerProfile(playerKey);
        await this.writePlayerProfile(playerKey, {
          nickname: movedPlayer?.nickname ?? profile?.nickname,
          moveCount: profile?.moveCount ?? 0,
          lastSeenAt: new Date().toISOString(),
        });
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

  private profileKey(playerKey: string): string {
    return `player:${playerKey}:profile`;
  }

  private async readPlayerProfile(playerKey: string): Promise<PlayerProfile | null> {
    return this.env.PLAYER_KV.get<PlayerProfile>(this.profileKey(playerKey), "json");
  }

  private async writePlayerProfile(
    playerKey: string,
    profile: PlayerProfile
  ): Promise<void> {
    await this.env.PLAYER_KV.put(this.profileKey(playerKey), JSON.stringify(profile));
  }
}
