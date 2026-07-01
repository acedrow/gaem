import { randomUUID } from "node:crypto";

import type { CharacterSheet, ConsoleActor } from "@gaem/shared";
import { logSheetFieldChanges, validateCharacterSheetRefs } from "@gaem/shared";
import type { Request, Response } from "express";

import type { AuthContext } from "./auth.js";

export const characterSheets = new Map<string, CharacterSheet>();
export const portraits = new Map<string, { body: Buffer; contentType: string }>();

const PORTRAIT_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function portraitObjectKey(sheetId: string, ext: string): string {
  return `portraits/${sheetId}/${randomUUID()}.${ext}`;
}

function portraitExt(contentType: string): string | null {
  return PORTRAIT_TYPES[contentType] ?? null;
}

function canViewSheet(auth: AuthContext): boolean {
  return auth.role === "gm" || auth.role === "player";
}

function canEditSheet(auth: AuthContext, sheet: CharacterSheet): boolean {
  if (auth.role === "gm") return true;
  return sheet.player === auth.playerKey;
}

function canAccessSheet(auth: AuthContext, _sheet: CharacterSheet): boolean {
  return canViewSheet(auth);
}

function canCreateForPlayer(auth: AuthContext, playerId: string): boolean {
  if (auth.role === "gm") return true;
  return playerId === auth.playerKey;
}

function deletePortrait(portraitKey: string | null): void {
  if (portraitKey) portraits.delete(portraitKey);
}

export function listSheetsHandler(auth: AuthContext, res: Response): void {
  const all = [...characterSheets.values()];
  const sheets =
    auth.role === "gm"
      ? all
      : all.filter((s) => s.player === auth.playerKey);
  res.json({ sheets });
}

export function createSheetHandler(
  auth: AuthContext,
  req: Request,
  res: Response,
  hasProfile: (id: string) => boolean
): void {
  const player = typeof req.body?.player === "string" ? req.body.player.trim() : "";
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const className = typeof req.body?.class === "string" ? req.body.class.trim() : "";
  const armor = typeof req.body?.armor === "string" ? req.body.armor.trim() : "";
  const weapon = typeof req.body?.weapon === "string" ? req.body.weapon.trim() : "";

  if (!player || !name || !className || !armor || !weapon) {
    res.status(400).json({ error: "player, name, class, armor, and weapon are required" });
    return;
  }
  if (!canCreateForPlayer(auth, player)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  if (!hasProfile(player)) {
    res.status(400).json({ error: "Player profile not found" });
    return;
  }

  const refError = validateCharacterSheetRefs({ class: className, armor, weapon });
  if (refError) {
    res.status(400).json({ error: refError });
    return;
  }

  const now = new Date().toISOString();
  const sheet: CharacterSheet = {
    id: randomUUID(),
    player,
    name,
    portraitKey: null,
    class: className,
    armor,
    weapon,
    createdAt: now,
    updatedAt: now,
  };
  characterSheets.set(sheet.id, sheet);
  res.status(201).json({ sheet });
}

export function getSheetHandler(auth: AuthContext, id: string, res: Response): void {
  const sheet = characterSheets.get(id);
  if (!sheet) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (!canAccessSheet(auth, sheet)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  res.json({ sheet });
}

export function patchSheetHandler(
  auth: AuthContext,
  id: string,
  req: Request,
  res: Response,
  hasProfile: (id: string) => boolean,
  opts?: {
    actor: ConsoleActor;
    sheetOnBoard: boolean;
    logConsole: (actor: ConsoleActor, message: string) => void;
  },
): void {
  const sheet = characterSheets.get(id);
  if (!sheet) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (!canAccessSheet(auth, sheet)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  if (!canEditSheet(auth, sheet)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const prev = {
    name: sheet.name,
    class: sheet.class,
    armor: sheet.armor,
    weapon: sheet.weapon,
  };

  if (req.body?.player !== undefined) {
    if (auth.role !== "gm") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const player = typeof req.body.player === "string" ? req.body.player.trim() : "";
    if (!player || !hasProfile(player)) {
      res.status(400).json({ error: "Invalid player" });
      return;
    }
    sheet.player = player;
  }

  if (req.body?.name !== undefined) {
    const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
    if (!name) {
      res.status(400).json({ error: "Invalid name" });
      return;
    }
    sheet.name = name;
  }

  const refFields: { class?: string; armor?: string; weapon?: string } = {};
  if (req.body?.class !== undefined) {
    refFields.class = typeof req.body.class === "string" ? req.body.class.trim() : "";
  }
  if (req.body?.armor !== undefined) {
    refFields.armor = typeof req.body.armor === "string" ? req.body.armor.trim() : "";
  }
  if (req.body?.weapon !== undefined) {
    refFields.weapon = typeof req.body.weapon === "string" ? req.body.weapon.trim() : "";
  }

  const refError = validateCharacterSheetRefs(refFields);
  if (refError) {
    res.status(400).json({ error: refError });
    return;
  }

  if (refFields.class !== undefined) sheet.class = refFields.class;
  if (refFields.armor !== undefined) sheet.armor = refFields.armor;
  if (refFields.weapon !== undefined) sheet.weapon = refFields.weapon;

  sheet.updatedAt = new Date().toISOString();
  characterSheets.set(sheet.id, sheet);
  if (opts) {
    const label = sheet.name || "Character";
    logSheetFieldChanges(
      opts.logConsole,
      opts.actor,
      label,
      prev,
      {
        name: sheet.name,
        class: sheet.class,
        armor: sheet.armor,
        weapon: sheet.weapon,
      },
      opts.sheetOnBoard,
    );
  }
  res.json({ sheet });
}

export function deleteSheetHandler(auth: AuthContext, id: string, res: Response): void {
  const sheet = characterSheets.get(id);
  if (!sheet) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (!canAccessSheet(auth, sheet)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  if (!canEditSheet(auth, sheet)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  deletePortrait(sheet.portraitKey);
  characterSheets.delete(id);
  res.json({ ok: true });
}

export function putPortraitHandler(
  auth: AuthContext,
  id: string,
  req: Request,
  res: Response
): void {
  const sheet = characterSheets.get(id);
  if (!sheet) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (!canAccessSheet(auth, sheet)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  if (!canEditSheet(auth, sheet)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const contentType = req.headers["content-type"] ?? "";
  const ext = portraitExt(contentType);
  if (!ext) {
    res.status(400).json({
      error: "Content-Type must be image/jpeg, image/png, or image/webp",
    });
    return;
  }

  const body = req.body as Buffer;
  if (!Buffer.isBuffer(body) || body.length === 0) {
    res.status(400).json({ error: "Empty body" });
    return;
  }

  const newKey = portraitObjectKey(id, ext);
  portraits.set(newKey, { body, contentType });
  deletePortrait(sheet.portraitKey);
  sheet.portraitKey = newKey;
  sheet.updatedAt = new Date().toISOString();
  characterSheets.set(sheet.id, sheet);
  res.json({ sheet });
}

export function getPortraitHandler(auth: AuthContext, id: string, res: Response): void {
  const sheet = characterSheets.get(id);
  if (!sheet) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (!canAccessSheet(auth, sheet)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  if (!sheet.portraitKey) {
    res.status(404).json({ error: "No portrait" });
    return;
  }

  const portrait = portraits.get(sheet.portraitKey);
  if (!portrait) {
    res.status(404).json({ error: "Portrait not found" });
    return;
  }

  res.setHeader("Content-Type", portrait.contentType);
  res.setHeader("Cache-Control", "private, max-age=3600");
  res.send(portrait.body);
}
