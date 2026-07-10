import type { GameState, OverworldRegion, OverworldRegionId } from "./types.js";

const REGION_IDS: OverworldRegionId[] = ["west", "center", "east"];

const REGION_IMAGE_KEY_RE = /^region-images\/[0-9a-f-]+\.(png|jpe?g|webp)$/i;

export function defaultOverworldRegions(): OverworldRegion[] {
  return REGION_IDS.map((id) => ({ id }));
}

export function ensureOverworldRegions(state: GameState): OverworldRegion[] {
  if (!state.overworldRegions || state.overworldRegions.length !== 3) {
    state.overworldRegions = defaultOverworldRegions();
    return state.overworldRegions;
  }
  const byId = new Map(state.overworldRegions.map((r) => [r.id, r]));
  state.overworldRegions = REGION_IDS.map((id) => {
    const existing = byId.get(id);
    return existing ? { id, ...(existing.imageKey ? { imageKey: existing.imageKey } : {}) } : { id };
  });
  return state.overworldRegions;
}

export function validateSetOverworldRegionImage(
  state: GameState,
  regionId: OverworldRegionId,
  imageKey: string | null,
): string | null {
  ensureOverworldRegions(state);
  if (!REGION_IDS.includes(regionId)) return "Unknown region";
  if (imageKey != null && !REGION_IMAGE_KEY_RE.test(imageKey)) {
    return "Invalid region image key";
  }
  return null;
}

export function applySetOverworldRegionImage(
  state: GameState,
  regionId: OverworldRegionId,
  imageKey: string | null,
): string {
  const regions = ensureOverworldRegions(state);
  const region = regions.find((r) => r.id === regionId)!;
  if (imageKey) region.imageKey = imageKey;
  else delete region.imageKey;
  const label = regionId.charAt(0).toUpperCase() + regionId.slice(1);
  return imageKey ? `Set ${label} region image` : `Cleared ${label} region image`;
}
