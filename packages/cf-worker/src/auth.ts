import type { CharacterSheet, GaemRole } from "@gaem/shared";

export type AuthContext = {
  role: GaemRole;
  playerKey: string | null;
};

export function parseAuth(request: Request): AuthContext | Response {
  const roleHeader = request.headers.get("X-Gaem-Role");
  if (roleHeader !== "gm" && roleHeader !== "player") {
    return Response.json({ error: "Missing or invalid X-Gaem-Role" }, { status: 401 });
  }
  const playerKey = request.headers.get("X-Gaem-Player-Key");
  if (roleHeader === "player" && !playerKey) {
    return Response.json({ error: "X-Gaem-Player-Key required for player role" }, { status: 401 });
  }
  return { role: roleHeader, playerKey };
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

export function canCreateForPlayer(auth: AuthContext, playerId: string): boolean {
  if (auth.role === "gm") return true;
  return playerId === auth.playerKey;
}
