import type { TerrainType, TileImageRotation, TilePaintPreset } from "./types.js";
import { TERRAIN_TYPES, TILE_IMAGE_ROTATIONS } from "./types.js";

export const TILE_NAME_MAX_LENGTH = 80;

const BASE_COLOR_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export function isValidTileBaseColor(hex: string): boolean {
  return BASE_COLOR_RE.test(hex);
}

export function isValidTileImageRotation(value: unknown): value is TileImageRotation {
  return typeof value === "number" && (TILE_IMAGE_ROTATIONS as readonly number[]).includes(value);
}

export function normalizeTileName(name: string): string {
  return name.trim();
}

export function parseTilePaintPreset(raw: unknown, label: string): TilePaintPreset {
  if (!raw || typeof raw !== "object") {
    throw new Error(`${label} must be an object`);
  }
  const p = raw as Record<string, unknown>;

  const elevation = p.elevation;
  if (!Number.isInteger(elevation) || (elevation as number) < -3 || (elevation as number) > 3) {
    throw new Error(`${label} elevation must be an integer from -3 to 3`);
  }

  const terrain = p.terrain;
  if (typeof terrain !== "string" || !TERRAIN_TYPES.includes(terrain as TerrainType)) {
    throw new Error(`${label} has invalid terrain type: ${terrain}`);
  }

  const tileEffectId = p.tileEffectId;
  if (typeof tileEffectId !== "string") {
    throw new Error(`${label} tileEffectId must be a string`);
  }

  const tileEffectStacks = p.tileEffectStacks;
  if (!Number.isInteger(tileEffectStacks)) {
    throw new Error(`${label} tileEffectStacks must be an integer`);
  }

  const tileName = p.tileName;
  if (typeof tileName !== "string") {
    throw new Error(`${label} tileName must be a string`);
  }
  const normalizedTileName = normalizeTileName(tileName);
  if (normalizedTileName.length > TILE_NAME_MAX_LENGTH) {
    throw new Error(`${label} tileName must be at most ${TILE_NAME_MAX_LENGTH} characters`);
  }

  const preset: TilePaintPreset = {
    elevation: elevation as number,
    terrain: terrain as TerrainType,
    tileEffectId,
    tileEffectStacks: tileEffectStacks as number,
    tileName: normalizedTileName,
  };

  const baseColor = p.baseColor;
  if (baseColor !== undefined) {
    if (typeof baseColor !== "string" || !isValidTileBaseColor(baseColor)) {
      throw new Error(`${label} baseColor must be a #RGB or #RRGGBB hex color`);
    }
    preset.baseColor = baseColor;
  }

  const appearanceKey = p.appearanceKey;
  if (appearanceKey !== undefined) {
    if (typeof appearanceKey !== "string" || !appearanceKey.trim()) {
      throw new Error(`${label} appearanceKey must be a non-empty string`);
    }
    preset.appearanceKey = appearanceKey.trim();
  }

  const featureKey = p.featureKey;
  if (featureKey !== undefined) {
    if (typeof featureKey !== "string" || !featureKey.trim()) {
      throw new Error(`${label} featureKey must be a non-empty string`);
    }
    preset.featureKey = featureKey.trim();
  }

  const imageRotation = p.imageRotation;
  if (imageRotation !== undefined) {
    if (!isValidTileImageRotation(imageRotation)) {
      throw new Error(`${label} imageRotation must be 0, 90, 180, or 270`);
    }
    if (imageRotation !== 0) preset.imageRotation = imageRotation;
  }

  const imageFlip = p.imageFlip;
  if (imageFlip !== undefined) {
    if (typeof imageFlip !== "boolean") {
      throw new Error(`${label} imageFlip must be a boolean`);
    }
    if (imageFlip) preset.imageFlip = true;
  }

  return preset;
}

export function parseTilePresets(raw: unknown): Record<string, TilePaintPreset> | undefined {
  if (raw === undefined) return undefined;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("tilePresets must be an object");
  }
  const obj = raw as Record<string, unknown>;
  const presets: Record<string, TilePaintPreset> = {};
  const seen = new Set<string>();
  for (const [name, value] of Object.entries(obj)) {
    const trimmed = name.trim();
    if (!trimmed) throw new Error("tilePresets keys must be non-empty strings");
    if (seen.has(trimmed)) throw new Error(`Duplicate tile preset name: ${trimmed}`);
    seen.add(trimmed);
    presets[trimmed] = parseTilePaintPreset(value, `tilePresets["${trimmed}"]`);
  }
  return presets;
}
