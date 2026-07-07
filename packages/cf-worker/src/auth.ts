import type { CharacterSheet, GaemRole } from "@gaem/shared";
import { verifyAuthToken } from "@gaem/shared";

import type { Env } from "./env.js";

export type AuthContext = {
  role: GaemRole;
  playerKey: string | null;
};

export async function verifyAuth(
  request: Request,
  env: Env
): Promise<AuthContext | Response> {
  const header = request.headers.get("Authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : "";
  const payload = await verifyAuthToken(token, env.AUTH_SECRET);
  if (!payload) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }
  const playerKey = request.headers.get("X-Gaem-Player-Key");
  if (payload.role === "player" && !playerKey) {
    return Response.json({ error: "X-Gaem-Player-Key required for player role" }, { status: 401 });
  }
  return { role: payload.role, playerKey };
}

export function canViewSheet(auth: AuthContext): boolean {
  return auth.role === "gm" || auth.role === "player";
}

export function canEditSheet(auth: AuthContext, sheet: CharacterSheet): boolean {
  if (auth.role === "gm") return true;
  return sheet.player === auth.playerKey;
}

export function canAccessSheet(auth: AuthContext, _sheet: CharacterSheet): boolean {
  return canViewSheet(auth);
}

export function canCreateForPlayer(auth: AuthContext, _playerId: string): boolean {
  return auth.role === "gm";
}
