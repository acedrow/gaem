import type { ClientMessage, ConsoleActor, ConsoleLogEntry, GaemRole, GameState, ServerMessage } from "@gaem/shared";
import {
  addEnemy,
  addPlayer,
  applyEnemyMove,
  applyMove,
  applyPhaseAction,
  applyBaseCampaignAction,
  applySetEnforceTurns,
  characterTargetLabel,
  CONSOLE_MSG_CONNECTED,
  CONSOLE_MSG_DISCONNECTED,
  createInitialStateFromMap,
  DEFAULT_MAP_ID,
  enemyLabel,
  handleCombatMessage,
  logSyncPlayerLoadoutChanges,
  normalizeGameState,
  removeEnemy,
  removePlayer,
  resolvePlayerForJoin,
  setPlayerHp,
  syncCharacterSheetWeaponsFromPlayer,
  syncPlayerSheet,
  validateEnemyMove,
  validateMove,
  validatePhaseAction,
  validateBaseCampaignAction,
} from "@gaem/shared";

import type { Env } from "./env.js";
import { appendConsole, loadConsoleEntries } from "./console-log.js";
import { getCharacterSheet, listCharacterSheets, saveCharacterSheet } from "./character-sheets.js";
import { getMap } from "./maps.js";
import { getPlayerProfile, savePlayerProfile } from "./player-profiles.js";

type Attachment = { playerId: string | null; playerKey: string | null; role: GaemRole | null };

const GAME_STATE_KEY = "gameState";

async function resolveSheetForJoin(
  env: Env,
  playerKey: string,
  characterSheetId?: string
): Promise<{
  className?: string;
  characterSheetId?: string;
  armor?: string;
  weapon?: string;
  equipment?: string;
  gear?: string;
  weapon2?: string;
  yadathanTower?: string;
}> {
  if (characterSheetId) {
    const sheet = await getCharacterSheet(env, characterSheetId);
    if (sheet?.player === playerKey) {
      return {
        className: sheet.class,
        characterSheetId: sheet.id,
        armor: sheet.armor,
        weapon: sheet.weapon,
        equipment: sheet.equipment,
        gear: sheet.gear,
        weapon2: sheet.weapon2,
        yadathanTower: sheet.yadathanTower,
      };
    }
  }
  const sheets = await listCharacterSheets(env);
  const sheet = sheets.find((s) => s.player === playerKey);
  return sheet
    ? {
        className: sheet.class,
        characterSheetId: sheet.id,
        armor: sheet.armor,
        weapon: sheet.weapon,
        equipment: sheet.equipment,
        gear: sheet.gear,
        weapon2: sheet.weapon2,
        yadathanTower: sheet.yadathanTower,
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
      const map = await getMap(this.env, stored?.mapId ?? DEFAULT_MAP_ID);
      if (stored) {
        this.gameState = normalizeGameState(stored, map);
        if (stored.mapName !== this.gameState.mapName) {
          await this.ctx.storage.put(GAME_STATE_KEY, this.gameState);
        }
      } else {
        this.gameState = normalizeGameState(createInitialStateFromMap(map), map);
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
    if (url.pathname === "/internal/broadcast-console" && request.method === "POST") {
      const body = (await request.json()) as { entry: ConsoleLogEntry };
      this.sendConsoleEntry(body.entry);
      return new Response(null, { status: 204 });
    }
    if (url.pathname === "/internal/sheet-on-board") {
      const sheetId = url.searchParams.get("sheetId");
      const onBoard = !!sheetId && this.gameState.players.some((p) => p.characterSheetId === sheetId);
      return Response.json({ onBoard });
    }
    if (url.pathname === "/internal/campaign-unlocks") {
      return Response.json({
        constructedBaseUpgrades: this.gameState.constructedBaseUpgrades ?? [],
      });
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

    await this.sendConsoleSync(server);
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
        await this.broadcastConsole(await this.actorForSocket(ws), CONSOLE_MSG_CONNECTED);
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
        armor: sheetJoin.armor,
        weapon: sheetJoin.weapon,
        equipment: sheetJoin.equipment,
        gear: sheetJoin.gear,
        weapon2: sheetJoin.weapon2,
        yadathanTower: sheetJoin.yadathanTower,
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
      await this.broadcastConsole(await this.actorForSocket(ws), CONSOLE_MSG_CONNECTED);
      await this.broadcastState();
      return;
    }

    if (parsed.type === "moveEnemy" || parsed.type === "addEnemy" || parsed.type === "removeEnemy") {
      if (parsed.type === "removeEnemy") {
        const enemy = this.gameState.enemies.find((e) => e.id === parsed.enemyId);
        if (!enemy) {
          this.sendError(ws, "Unknown enemy");
          return;
        }
        if (att?.role !== "gm" && (enemy.hp ?? 0) > 0) {
          this.sendError(ws, "Only the game master can manage enemies");
          return;
        }
        removeEnemy(this.gameState, parsed.enemyId, { entireSwarm: true });
        if ((enemy.hp ?? 0) > 0) {
          const actor = await this.actorForSocket(ws);
          this.broadcastConsole(actor, `removed ${enemyLabel(enemy)}`);
        }
      } else {
        if (att?.role !== "gm") {
          this.sendError(ws, "Only the game master can manage enemies");
          return;
        }
        if (parsed.type === "moveEnemy") {
          const enemy = this.gameState.enemies.find((e) => e.id === parsed.enemyId);
          const err = validateEnemyMove(this.gameState, parsed.enemyId, parsed.x, parsed.y);
          if (err) {
            this.sendError(ws, err);
            return;
          }
          applyEnemyMove(this.gameState, parsed.enemyId, parsed.x, parsed.y);
          if (enemy) {
            const actor = await this.actorForSocket(ws);
            this.broadcastConsole(actor, `moved ${enemyLabel(enemy)} to (${parsed.x}, ${parsed.y})`);
          }
        } else {
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
          const enemy = this.gameState.enemies.find((e) => e.id === id);
          if (enemy) {
            const actor = await this.actorForSocket(ws);
            this.broadcastConsole(actor, `spawned ${enemyLabel(enemy)} at (${parsed.x}, ${parsed.y})`);
          }
        }
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
      const actor = await this.actorForSocket(ws);
      const target = await this.targetLabelForPlayer(parsed.playerId);
      this.broadcastConsole(actor, `set ${target} HP to ${Math.trunc(parsed.hp)}`);
      await this.broadcastState();
      return;
    }

    if (parsed.type === "syncPlayerSheet") {
      if (!(await canSyncPlayerSheet(this.env, att?.role, att?.playerKey, parsed.characterSheetId))) {
        this.sendError(ws, "Forbidden");
        return;
      }
      const sheet = await getCharacterSheet(this.env, parsed.characterSheetId);
      const player = this.gameState.players.find(
        (p) => p.characterSheetId === parsed.characterSheetId,
      );
      if (!player) {
        this.sendError(ws, "Player not on board");
        return;
      }
      const prevLoadout = {
        class: player.class ?? "",
        armor: player.armor ?? "",
        weapon: player.weapon ?? "",
        equipment: player.equipment,
        gear: player.gear,
        weapon2: player.weapon2,
        yadathanTower: player.yadathanTower,
      };
      const err = syncPlayerSheet(
        this.gameState,
        parsed.characterSheetId,
        parsed.class,
        parsed.armor,
        parsed.weapon,
        parsed.equipment,
        parsed.gear,
        parsed.weapon2,
        parsed.yadathanTower,
      );
      if (err) {
        this.sendError(ws, err);
        return;
      }
      const actor = await this.actorForSocket(ws);
      const label = sheet?.name ?? "Character";
      logSyncPlayerLoadoutChanges(
        (a, message) => {
          this.broadcastConsole(a, message);
        },
        actor,
        label,
        prevLoadout,
        {
          class: player.class ?? "",
          armor: player.armor ?? "",
          weapon: player.weapon ?? "",
          equipment: player.equipment,
          gear: player.gear,
          weapon2: player.weapon2,
          yadathanTower: player.yadathanTower,
        },
      );
      await this.broadcastState();
      return;
    }

    if (parsed.type === "setEnforceTurns") {
      if (att?.role !== "gm") {
        this.sendError(ws, "Only the game master can do that");
        return;
      }
      const message = applySetEnforceTurns(this.gameState, parsed.enforceTurns);
      const actor = await this.actorForSocket(ws);
      await this.broadcastConsole(actor, message);
      await this.broadcastState();
      return;
    }

    if (parsed.type === "setEnforceActionLimits") {
      if (att?.role !== "gm") {
        this.sendError(ws, "Only the game master can do that");
        return;
      }
      this.gameState.enforceActionLimits = parsed.enforceActionLimits;
      const actor = await this.actorForSocket(ws);
      await this.broadcastConsole(
        actor,
        parsed.enforceActionLimits
          ? "Enforce action limits enabled"
          : "Enforce action limits disabled",
      );
      await this.broadcastState();
      return;
    }

    const combatCtx = { role: att?.role ?? "player", playerId: att?.playerId ?? null };
    const combatResult = handleCombatMessage(this.gameState, parsed, combatCtx);
    if (combatResult.handled) {
      if ("error" in combatResult) {
        this.sendError(ws, combatResult.error);
        return;
      }
      if (parsed.type === "playerAction" && parsed.action.action === "weaponSwap") {
        await this.persistWeaponSwapToSheet(combatCtx.playerId);
      }
      const actor = await this.actorForSocket(ws);
      await this.broadcastConsole(actor, combatResult.message);
      await this.broadcastState();
      return;
    }

    if (parsed.type === "phaseAction") {
      if (!att?.role) {
        this.sendError(ws, "Not joined");
        return;
      }
      const ctx = { role: att.role, playerId: att.playerId };
      const err = validatePhaseAction(this.gameState, parsed.action, ctx);
      if (err) {
        this.sendError(ws, err);
        return;
      }
      const message = applyPhaseAction(this.gameState, parsed.action, ctx);
      const actor = await this.actorForSocket(ws);
      await this.broadcastConsole(actor, message);
      await this.broadcastState();
      return;
    }

    if (parsed.type === "baseCampaignAction") {
      if (!att?.role) {
        this.sendError(ws, "Not joined");
        return;
      }
      const err = validateBaseCampaignAction(this.gameState, parsed.action);
      if (err) {
        this.sendError(ws, err);
        return;
      }
      const message = applyBaseCampaignAction(this.gameState, parsed.action);
      const actor = await this.actorForSocket(ws);
      await this.broadcastConsole(actor, message);
      await this.broadcastState();
      return;
    }

    if (parsed.type === "move") {
      const id = att?.playerId;
      if (!id) {
        this.sendError(ws, "Only players can move");
        return;
      }
      if (this.gameState.roundPhase === "playerTurn") {
        const result = handleCombatMessage(
          this.gameState,
          { type: "movePath", path: [{ x: parsed.x, y: parsed.y }] },
          { role: att?.role ?? "player", playerId: id },
        );
        if (result.handled && "error" in result) {
          this.sendError(ws, result.error);
          return;
        }
        if (result.handled && "message" in result) {
          const actor = await this.actorForSocket(ws);
          await this.broadcastConsole(actor, result.message);
          await this.broadcastState();
        }
        return;
      }
      const err = validateMove(this.gameState, id, parsed.x, parsed.y);
      if (err) {
        this.sendError(ws, err);
        return;
      }
      applyMove(this.gameState, id, parsed.x, parsed.y);
      const actor = await this.actorForSocket(ws);
      this.broadcastConsole(actor, `moved to (${parsed.x}, ${parsed.y})`);
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
    if (att?.role) {
      await this.broadcastConsole(await this.actorForSocket(ws), CONSOLE_MSG_DISCONNECTED);
    }
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

  private async actorForSocket(ws: WebSocket): Promise<ConsoleActor> {
    const att = ws.deserializeAttachment() as Attachment | null;
    if (att?.role === "gm") return { name: "GM", role: "gm" };
    if (att?.playerKey) {
      const profile = await getPlayerProfile(this.env, att.playerKey);
      if (profile?.name) return { name: profile.name, role: "player" };
    }
    const player = att?.playerId
      ? this.gameState.players.find((p) => p.id === att.playerId)
      : undefined;
    return { name: player?.nickname ?? "Player", role: "player" };
  }

  private async targetLabelForPlayer(playerId: string): Promise<string> {
    const player = this.gameState.players.find((p) => p.id === playerId);
    const sheet = player?.characterSheetId
      ? await getCharacterSheet(this.env, player.characterSheetId)
      : undefined;
    return characterTargetLabel(player, sheet?.name);
  }

  private async persistWeaponSwapToSheet(playerId: string | null | undefined): Promise<void> {
    if (!playerId) return;
    const player = this.gameState.players.find((p) => p.id === playerId);
    if (!player?.characterSheetId) return;
    const sheet = await getCharacterSheet(this.env, player.characterSheetId);
    if (!sheet) return;
    if (syncCharacterSheetWeaponsFromPlayer(sheet, player)) {
      await saveCharacterSheet(this.env, sheet);
    }
  }

  private sendConsoleEntry(entry: ConsoleLogEntry): void {
    const msg: ServerMessage = { type: "console", entry };
    const payload = JSON.stringify(msg);
    for (const socket of this.ctx.getWebSockets()) {
      socket.send(payload);
    }
  }

  private async sendConsoleSync(ws: WebSocket): Promise<void> {
    const entries = await loadConsoleEntries(this.env);
    const msg: ServerMessage = { type: "consoleSync", entries };
    ws.send(JSON.stringify(msg));
  }

  private async broadcastConsole(actor: ConsoleActor, message: string): Promise<void> {
    const entry = await appendConsole(this.env, actor, message);
    this.sendConsoleEntry(entry);
  }

  private async broadcastState(): Promise<void> {
    const stored = structuredClone(this.gameState);
    delete stored.damageEvents;
    await this.ctx.storage.put(GAME_STATE_KEY, stored);
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
    delete this.gameState.damageEvents;
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
