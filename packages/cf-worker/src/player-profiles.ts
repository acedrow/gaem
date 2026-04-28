import type { PlayerProfile } from "@gaem/shared";

import type { Env } from "./env.js";

const PREFIX = "profile:";

function key(id: string): string {
  return `${PREFIX}${id}`;
}

export async function listPlayerProfiles(env: Env): Promise<PlayerProfile[]> {
  const { keys } = await env.PLAYER_KV.list({ prefix: PREFIX });
  const profiles = await Promise.all(
    keys.map(({ name }) => env.PLAYER_KV.get<PlayerProfile>(name, "json"))
  );
  return profiles.filter((p): p is PlayerProfile => !!p);
}

export async function getPlayerProfile(
  env: Env,
  id: string
): Promise<PlayerProfile | null> {
  return env.PLAYER_KV.get<PlayerProfile>(key(id), "json");
}

export async function createPlayerProfile(
  env: Env,
  name: string
): Promise<PlayerProfile> {
  const now = new Date().toISOString();
  const profile: PlayerProfile = {
    id: crypto.randomUUID(),
    name,
    createdAt: now,
    updatedAt: now,
    data: {},
  };
  await env.PLAYER_KV.put(key(profile.id), JSON.stringify(profile));
  return profile;
}

export async function savePlayerProfile(
  env: Env,
  profile: PlayerProfile
): Promise<void> {
  await env.PLAYER_KV.put(key(profile.id), JSON.stringify(profile));
}
