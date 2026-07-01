import type { GameMap } from "@gaem/shared";
import { parseGameMap } from "@gaem/shared";

import type { Env } from "./env.js";

function mapKey(id: string): string {
  return `map:${id}`;
}

export async function getMap(env: Env, id: string): Promise<GameMap> {
  const raw = await env.MAP_KV.get(mapKey(id));
  if (!raw) {
    throw new Error(`Map not found: ${id}`);
  }
  return parseGameMap(JSON.parse(raw));
}

export async function putMap(env: Env, map: GameMap): Promise<void> {
  await env.MAP_KV.put(mapKey(map.id), JSON.stringify(map));
}
