import type { GaemRole } from "@gaem/shared";
import type { Request, Response } from "express";

export type AuthContext = {
  role: GaemRole;
  playerKey: string | null;
};

export function parseAuth(req: Request, res: Response): AuthContext | null {
  const roleHeader = req.headers["x-gaem-role"];
  if (roleHeader !== "gm" && roleHeader !== "player") {
    res.status(401).json({ error: "Missing or invalid X-Gaem-Role" });
    return null;
  }
  const playerKey =
    typeof req.headers["x-gaem-player-key"] === "string"
      ? req.headers["x-gaem-player-key"]
      : null;
  if (roleHeader === "player" && !playerKey) {
    res.status(401).json({ error: "X-Gaem-Player-Key required for player role" });
    return null;
  }
  return { role: roleHeader, playerKey };
}

export function requireAuth(
  req: Request,
  res: Response,
  next: () => void
): void {
  if (!parseAuth(req, res)) return;
  next();
}
