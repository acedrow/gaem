import type { Env } from "./env.js";
import { GameRoom } from "./game-room.js";
import { createPlayerProfile, listPlayerProfiles } from "./player-profiles.js";

export { GameRoom };

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
      return Response.json({ profiles });
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

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
