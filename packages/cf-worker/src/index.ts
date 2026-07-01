import type { Env } from "./env.js";
import { GameRoom } from "./game-room.js";
import {
  handleCreateCharacterSheet,
  handleDeleteCharacterSheet,
  handleGetCharacterSheet,
  handleGetPortrait,
  handleListCharacterSheets,
  handlePatchCharacterSheet,
  handlePutPortrait,
} from "./character-sheets.js";
import { parseAuth } from "./auth.js";
import { createPlayerProfile, listPlayerProfiles } from "./player-profiles.js";
import { handleRandomIntegersGet, handleRollDicePost } from "./random-integers.js";

export { GameRoom };

const SHEET_ID_RE = /^\/api\/character-sheets\/([^/]+)$/;
const PORTRAIT_RE = /^\/api\/character-sheets\/([^/]+)\/portrait$/;

export default {
  async fetch(
    request: Request,
    env: Env,
    _ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return Response.json({ ok: true });
    }

    if (url.pathname === "/ws") {
      const id = env.GAME_ROOM.idFromName("default");
      const stub = env.GAME_ROOM.get(id);
      return stub.fetch(request);
    }

    if (url.pathname === "/api/player-profiles" && request.method === "GET") {
      const profiles = await listPlayerProfiles(env);
      const id = env.GAME_ROOM.idFromName("default");
      const stub = env.GAME_ROOM.get(id);
      const activeRes = await stub.fetch("http://internal/internal/active-profiles");
      const activeData = (await activeRes.json()) as { activeProfileIds: string[] };
      const active = new Set(activeData.activeProfileIds);
      return Response.json({
        profiles: profiles.map((p) => ({ ...p, isActive: active.has(p.id) })),
      });
    }

    if (url.pathname === "/api/player-profiles" && request.method === "POST") {
      const body = (await request.json().catch(() => null)) as
        | { name?: unknown }
        | null;
      const name = typeof body?.name === "string" ? body.name.trim() : "";
      if (!name) {
        return Response.json({ error: "Name is required" }, { status: 400 });
      }
      const profile = await createPlayerProfile(env, name);
      return Response.json({ profile }, { status: 201 });
    }

    if (url.pathname === "/api/random-integers") {
      if (request.method === "GET") {
        return handleRandomIntegersGet(env, request);
      }
      if (request.method === "POST") {
        const auth = parseAuth(request);
        if (auth instanceof Response) return auth;
        return handleRollDicePost(env, auth, request);
      }
      return new Response(null, { status: 405 });
    }

    if (url.pathname === "/api/character-sheets") {
      const auth = parseAuth(request);
      if (auth instanceof Response) return auth;

      if (request.method === "GET") {
        return handleListCharacterSheets(env, auth);
      }
      if (request.method === "POST") {
        return handleCreateCharacterSheet(env, auth, request);
      }
    }

    const portraitMatch = url.pathname.match(PORTRAIT_RE);
    if (portraitMatch) {
      const auth = parseAuth(request);
      if (auth instanceof Response) return auth;
      const sheetId = portraitMatch[1];

      if (request.method === "GET") {
        return handleGetPortrait(env, auth, sheetId);
      }
      if (request.method === "PUT") {
        return handlePutPortrait(env, auth, sheetId, request);
      }
    }

    const sheetMatch = url.pathname.match(SHEET_ID_RE);
    if (sheetMatch) {
      const auth = parseAuth(request);
      if (auth instanceof Response) return auth;
      const sheetId = sheetMatch[1];

      if (request.method === "GET") {
        return handleGetCharacterSheet(env, auth, sheetId);
      }
      if (request.method === "PATCH") {
        return handlePatchCharacterSheet(env, auth, sheetId, request);
      }
      if (request.method === "DELETE") {
        return handleDeleteCharacterSheet(env, auth, sheetId);
      }
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
