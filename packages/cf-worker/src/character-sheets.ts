import type { CharacterSheet } from "@gaem/shared";
import { actorForAuth, logSheetFieldChanges, validateCharacterSheetRefs } from "@gaem/shared";

import type { AuthContext } from "./auth.js";
import { canAccessSheet, canCreateForPlayer, canEditSheet } from "./auth.js";
import { logConsole } from "./console-log.js";
import type { Env } from "./env.js";
import { getPlayerProfile } from "./player-profiles.js";

const PREFIX = "character-sheet:";

function key(id: string): string {
  return `${PREFIX}${id}`;
}

export async function listCharacterSheets(env: Env): Promise<CharacterSheet[]> {
  const { keys } = await env.PLAYER_KV.list({ prefix: PREFIX });
  const sheets = await Promise.all(
    keys.map(({ name }) => env.PLAYER_KV.get<CharacterSheet>(name, "json"))
  );
  return sheets.filter((s): s is CharacterSheet => !!s);
}

export async function getCharacterSheet(
  env: Env,
  id: string
): Promise<CharacterSheet | null> {
  return env.PLAYER_KV.get<CharacterSheet>(key(id), "json");
}

export async function saveCharacterSheet(
  env: Env,
  sheet: CharacterSheet
): Promise<void> {
  await env.PLAYER_KV.put(key(sheet.id), JSON.stringify(sheet));
}

export async function deleteCharacterSheet(env: Env, id: string): Promise<void> {
  await env.PLAYER_KV.delete(key(id));
}

export async function deletePortrait(env: Env, portraitKey: string | null): Promise<void> {
  if (portraitKey) {
    await env.PORTRAIT_R2.delete(portraitKey);
  }
}

export function portraitObjectKey(sheetId: string, ext: string): string {
  return `portraits/${sheetId}/${crypto.randomUUID()}.${ext}`;
}

const PORTRAIT_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function portraitExt(contentType: string): string | null {
  return PORTRAIT_TYPES[contentType] ?? null;
}

type CreateBody = {
  player?: unknown;
  name?: unknown;
  class?: unknown;
  armor?: unknown;
  weapon?: unknown;
};

export async function handleListCharacterSheets(
  env: Env,
  auth: AuthContext
): Promise<Response> {
  const all = await listCharacterSheets(env);
  const sheets =
    auth.role === "gm"
      ? all
      : all.filter((s) => s.player === auth.playerKey);
  return Response.json({ sheets });
}

export async function handleCreateCharacterSheet(
  env: Env,
  auth: AuthContext,
  request: Request
): Promise<Response> {
  const body = (await request.json().catch(() => null)) as CreateBody | null;
  const player = typeof body?.player === "string" ? body.player.trim() : "";
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const className = typeof body?.class === "string" ? body.class.trim() : "";
  const armor = typeof body?.armor === "string" ? body.armor.trim() : "";
  const weapon = typeof body?.weapon === "string" ? body.weapon.trim() : "";

  if (!player || !name || !className || !armor || !weapon) {
    return Response.json(
      { error: "player, name, class, armor, and weapon are required" },
      { status: 400 }
    );
  }

  if (!canCreateForPlayer(auth, player)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const profile = await getPlayerProfile(env, player);
  if (!profile) {
    return Response.json({ error: "Player profile not found" }, { status: 400 });
  }

  const refError = validateCharacterSheetRefs({
    class: className,
    armor,
    weapon,
  });
  if (refError) {
    return Response.json({ error: refError }, { status: 400 });
  }

  const now = new Date().toISOString();
  const sheet: CharacterSheet = {
    id: crypto.randomUUID(),
    player,
    name,
    portraitKey: null,
    class: className,
    armor,
    weapon,
    createdAt: now,
    updatedAt: now,
  };
  await saveCharacterSheet(env, sheet);
  return Response.json({ sheet }, { status: 201 });
}

export async function handleGetCharacterSheet(
  env: Env,
  auth: AuthContext,
  id: string
): Promise<Response> {
  const sheet = await getCharacterSheet(env, id);
  if (!sheet) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  if (!canAccessSheet(auth, sheet)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  return Response.json({ sheet });
}

type PatchBody = {
  name?: unknown;
  class?: unknown;
  armor?: unknown;
  weapon?: unknown;
  player?: unknown;
};

export async function handlePatchCharacterSheet(
  env: Env,
  auth: AuthContext,
  id: string,
  request: Request
): Promise<Response> {
  const sheet = await getCharacterSheet(env, id);
  if (!sheet) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  if (!canAccessSheet(auth, sheet)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!canEditSheet(auth, sheet)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const prev = {
    name: sheet.name,
    class: sheet.class,
    armor: sheet.armor,
    weapon: sheet.weapon,
  };

  const body = (await request.json().catch(() => null)) as PatchBody | null;
  if (!body) {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.player !== undefined) {
    if (auth.role !== "gm") {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
    const player = typeof body.player === "string" ? body.player.trim() : "";
    if (!player) {
      return Response.json({ error: "Invalid player" }, { status: 400 });
    }
    const profile = await getPlayerProfile(env, player);
    if (!profile) {
      return Response.json({ error: "Player profile not found" }, { status: 400 });
    }
    sheet.player = player;
  }

  if (body.name !== undefined) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      return Response.json({ error: "Invalid name" }, { status: 400 });
    }
    sheet.name = name;
  }

  const refFields: { class?: string; armor?: string; weapon?: string } = {};
  if (body.class !== undefined) {
    refFields.class = typeof body.class === "string" ? body.class.trim() : "";
  }
  if (body.armor !== undefined) {
    refFields.armor = typeof body.armor === "string" ? body.armor.trim() : "";
  }
  if (body.weapon !== undefined) {
    refFields.weapon = typeof body.weapon === "string" ? body.weapon.trim() : "";
  }

  const refError = validateCharacterSheetRefs(refFields);
  if (refError) {
    return Response.json({ error: refError }, { status: 400 });
  }

  if (refFields.class !== undefined) sheet.class = refFields.class;
  if (refFields.armor !== undefined) sheet.armor = refFields.armor;
  if (refFields.weapon !== undefined) sheet.weapon = refFields.weapon;

  sheet.updatedAt = new Date().toISOString();
  await saveCharacterSheet(env, sheet);

  const roomId = env.GAME_ROOM.idFromName("default");
  const stub = env.GAME_ROOM.get(roomId);
  const onBoardRes = await stub.fetch(`http://internal/internal/sheet-on-board?sheetId=${encodeURIComponent(id)}`);
  const onBoardData = (await onBoardRes.json()) as { onBoard: boolean };
  const profile = auth.playerKey ? await getPlayerProfile(env, auth.playerKey) : null;
  const actor = actorForAuth(auth.role, profile?.name);
  const label = sheet.name || "Character";
  logSheetFieldChanges(
    (a, message) => {
      void logConsole(env, a, message);
    },
    actor,
    label,
    prev,
    {
      name: sheet.name,
      class: sheet.class,
      armor: sheet.armor,
      weapon: sheet.weapon,
    },
    onBoardData.onBoard,
  );

  return Response.json({ sheet });
}

export async function handleDeleteCharacterSheet(
  env: Env,
  auth: AuthContext,
  id: string
): Promise<Response> {
  const sheet = await getCharacterSheet(env, id);
  if (!sheet) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  if (!canAccessSheet(auth, sheet)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!canEditSheet(auth, sheet)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  await deletePortrait(env, sheet.portraitKey);
  await deleteCharacterSheet(env, id);
  return Response.json({ ok: true });
}

export async function handlePutPortrait(
  env: Env,
  auth: AuthContext,
  id: string,
  request: Request
): Promise<Response> {
  const sheet = await getCharacterSheet(env, id);
  if (!sheet) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  if (!canAccessSheet(auth, sheet)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!canEditSheet(auth, sheet)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const contentType = request.headers.get("Content-Type") ?? "";
  const ext = portraitExt(contentType);
  if (!ext) {
    return Response.json(
      { error: "Content-Type must be image/jpeg, image/png, or image/webp" },
      { status: 400 }
    );
  }

  const body = await request.arrayBuffer();
  if (body.byteLength === 0) {
    return Response.json({ error: "Empty body" }, { status: 400 });
  }

  const newKey = portraitObjectKey(id, ext);
  await env.PORTRAIT_R2.put(newKey, body, {
    httpMetadata: { contentType },
  });

  if (sheet.portraitKey) {
    await deletePortrait(env, sheet.portraitKey);
  }

  sheet.portraitKey = newKey;
  sheet.updatedAt = new Date().toISOString();
  await saveCharacterSheet(env, sheet);

  return Response.json({ sheet });
}

export async function handleGetPortrait(
  env: Env,
  auth: AuthContext,
  id: string
): Promise<Response> {
  const sheet = await getCharacterSheet(env, id);
  if (!sheet) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  if (!canAccessSheet(auth, sheet)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!sheet.portraitKey) {
    return Response.json({ error: "No portrait" }, { status: 404 });
  }

  const object = await env.PORTRAIT_R2.get(sheet.portraitKey);
  if (!object) {
    return Response.json({ error: "Portrait not found" }, { status: 404 });
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Cache-Control", "private, max-age=3600");
  return new Response(object.body, { headers });
}
