import type { Env } from "./env.js";
import { GameRoom } from "./game-room.js";

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

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
