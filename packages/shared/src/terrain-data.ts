import terrainTypesJson from "./data/rules/terrain-types.json" with { type: "json" };
import { TERRAIN_TYPES, type TerrainType } from "./types.js";

export type TerrainTypeEntry = {
  id: TerrainType;
  name: string;
  summary: string;
  description: string;
};

const entries = terrainTypesJson as TerrainTypeEntry[];

const entryById = new Map<TerrainType, TerrainTypeEntry>(entries.map((entry) => [entry.id, entry]));

for (const id of TERRAIN_TYPES) {
  if (!entryById.has(id)) {
    throw new Error(`terrain-types.json is missing entry for "${id}"`);
  }
}

export const TERRAIN_TYPE_ENTRIES = TERRAIN_TYPES.map((id) => entryById.get(id)!);

export function getTerrainTypeById(id: string): TerrainTypeEntry | undefined {
  const byId = entryById.get(id as TerrainType);
  if (byId) return byId;
  const normalized = id.toLowerCase();
  return entries.find((entry) => entry.name.toLowerCase() === normalized);
}

export function terrainTypeDisplayName(id: string): string {
  return entryById.get(id as TerrainType)?.name ?? id;
}
