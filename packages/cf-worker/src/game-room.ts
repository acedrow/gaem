import type { ClientMessage, ServerMessage } from "@gaem/shared";
import {
  addPlayer,
  applyMove,
  createInitialState,
  removePlayer,
  validateMove,
} from "@gaem/shared";

import type { Env } from "./env.js";

type Attachment = { playerId: string };

export class GameRoom {
  private gameState = createInitialState();

  constructor(
    private readonly ctx: DurableObjectState,
    _env: Env
  ) {}

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    this.ctx.acceptWebSocket(server);

    const playerId = crypto.randomUUID();
    server.serializeAttachment({ playerId } satisfies Attachment);

    const joined = addPlayer(this.gameState, {
      id: playerId,
      x: 0,
      y: 0,
    });
    if (!joined) {
      server.close(1013, "Board full");
      return new Response(null, { status: 101, webSocket: client });
    }

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
    const id = att?.playerId;
    if (!id) {
      this.sendError(ws, "Not joined");
      return;
    }

    if (parsed.type === "join") {
      const p = this.gameState.players.find((pl) => pl.id === id);
      if (p) p.nickname = parsed.nickname;
      this.broadcastState();
      return;
    }

    if (parsed.type === "move") {
      const err = validateMove(this.gameState, id, parsed.x, parsed.y);
      if (err) {
        this.sendError(ws, err);
        return;
      }
      applyMove(this.gameState, id, parsed.x, parsed.y);
      this.broadcastState();
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    const att = ws.deserializeAttachment() as Attachment | null;
    const playerId = att?.playerId;
    if (playerId) {
      removePlayer(this.gameState, playerId);
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
}
