import type {
  GameState,
  OverworldCampaignAction,
  OverworldParty,
  OverworldRegion,
  OverworldRegionId,
} from "./types.js";
import {
  MAP_SPEED_INCHES,
  OVERWORLD_QUARTER_HEIGHT,
  OVERWORLD_QUARTER_WIDTH,
  OVERWORLD_TRAVEL_FUEL_COST,
  QUARTER_CELL_INCHES,
} from "./types.js";

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

export function defaultOverworldParty(): OverworldParty {
  return {
    qx: Math.floor((OVERWORLD_QUARTER_WIDTH - 1) / 2),
    qy: Math.floor((OVERWORLD_QUARTER_HEIGHT - 1) / 2),
    atDis: true,
    mapSpeed: 1,
    fuel: 0,
    revelations: 0,
  };
}

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function normalizeNonNeg(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, n);
}

export function ensureOverworldParty(state: GameState): OverworldParty {
  const defaults = defaultOverworldParty();
  const existing = state.overworldParty;
  if (!existing) {
    state.overworldParty = defaults;
    return state.overworldParty;
  }
  existing.qx = clampInt(existing.qx, 0, OVERWORLD_QUARTER_WIDTH - 1);
  existing.qy = clampInt(existing.qy, 0, OVERWORLD_QUARTER_HEIGHT - 1);
  existing.atDis = existing.atDis === true;
  existing.mapSpeed = normalizeNonNeg(existing.mapSpeed);
  existing.fuel = Math.floor(normalizeNonNeg(existing.fuel));
  existing.revelations = Math.floor(normalizeNonNeg(existing.revelations));
  state.overworldParty = existing;
  return existing;
}

export function overworldTravelReachQuarters(mapSpeed: number): number {
  const speed = normalizeNonNeg(mapSpeed);
  return Math.ceil((speed * MAP_SPEED_INCHES) / QUARTER_CELL_INCHES);
}

export function isOverworldQuarterInBounds(qx: number, qy: number): boolean {
  return (
    Number.isInteger(qx) &&
    Number.isInteger(qy) &&
    qx >= 0 &&
    qy >= 0 &&
    qx < OVERWORLD_QUARTER_WIDTH &&
    qy < OVERWORLD_QUARTER_HEIGHT
  );
}

export function isOverworldTravelDestination(
  from: { qx: number; qy: number },
  to: { qx: number; qy: number },
  mapSpeed: number,
): boolean {
  if (!isOverworldQuarterInBounds(to.qx, to.qy)) return false;
  if (to.qx === from.qx && to.qy === from.qy) return false;
  const reach = overworldTravelReachQuarters(mapSpeed);
  if (reach <= 0) return false;
  const dist = Math.hypot(to.qx - from.qx, to.qy - from.qy);
  return dist <= reach;
}

export function listOverworldTravelDestinations(
  party: Pick<OverworldParty, "qx" | "qy" | "mapSpeed">,
): { qx: number; qy: number }[] {
  const reach = overworldTravelReachQuarters(party.mapSpeed);
  if (reach <= 0) return [];
  const out: { qx: number; qy: number }[] = [];
  const minQx = Math.max(0, Math.floor(party.qx - reach));
  const maxQx = Math.min(OVERWORLD_QUARTER_WIDTH - 1, Math.ceil(party.qx + reach));
  const minQy = Math.max(0, Math.floor(party.qy - reach));
  const maxQy = Math.min(OVERWORLD_QUARTER_HEIGHT - 1, Math.ceil(party.qy + reach));
  for (let qy = minQy; qy <= maxQy; qy++) {
    for (let qx = minQx; qx <= maxQx; qx++) {
      if (isOverworldTravelDestination(party, { qx, qy }, party.mapSpeed)) {
        out.push({ qx, qy });
      }
    }
  }
  return out;
}

export function isOverworldDeployDestination(qx: number, qy: number): boolean {
  return isOverworldQuarterInBounds(qx, qy) && qy === OVERWORLD_QUARTER_HEIGHT - 1;
}

export function listOverworldDeployDestinations(): { qx: number; qy: number }[] {
  const qy = OVERWORLD_QUARTER_HEIGHT - 1;
  const out: { qx: number; qy: number }[] = [];
  for (let qx = 0; qx < OVERWORLD_QUARTER_WIDTH; qx++) {
    out.push({ qx, qy });
  }
  return out;
}

export function validateOverworldCampaignAction(
  state: GameState,
  action: OverworldCampaignAction,
): string | null {
  const party = ensureOverworldParty(state);
  switch (action.kind) {
    case "adjustMapSpeed": {
      if (!Number.isFinite(action.delta) || action.delta === 0) return "Invalid speed adjustment";
      if (party.mapSpeed + action.delta < 0) return "Insufficient map speed";
      return null;
    }
    case "adjustFuel": {
      if (!Number.isInteger(action.delta) || action.delta === 0) return "Invalid fuel adjustment";
      if (party.fuel + action.delta < 0) return "Insufficient fuel";
      return null;
    }
    case "adjustRevelations": {
      if (!Number.isInteger(action.delta) || action.delta === 0) return "Invalid revelations adjustment";
      if (party.revelations + action.delta < 0) return "Insufficient revelations";
      return null;
    }
    case "travel": {
      if (party.atDis) return "Party is in DIS";
      if (party.fuel < OVERWORLD_TRAVEL_FUEL_COST) return "Not enough fuel";
      if (!isOverworldTravelDestination(party, { qx: action.qx, qy: action.qy }, party.mapSpeed)) {
        return "Invalid travel destination";
      }
      return null;
    }
    case "returnToDis": {
      if (party.atDis) return "Party is already in DIS";
      return null;
    }
    case "deployToHell": {
      if (!party.atDis) return "Party is not in DIS";
      if (!isOverworldDeployDestination(action.qx, action.qy)) {
        return "Invalid deploy destination";
      }
      return null;
    }
  }
}

export function applyOverworldCampaignAction(
  state: GameState,
  action: OverworldCampaignAction,
): string {
  const party = ensureOverworldParty(state);
  switch (action.kind) {
    case "adjustMapSpeed": {
      party.mapSpeed = normalizeNonNeg(party.mapSpeed + action.delta);
      const sign = action.delta >= 0 ? "+" : "";
      return `Map Speed ${sign}${action.delta} (now ${party.mapSpeed})`;
    }
    case "adjustFuel": {
      party.fuel = Math.floor(normalizeNonNeg(party.fuel + action.delta));
      const sign = action.delta >= 0 ? "+" : "";
      return `Fuel ${sign}${action.delta} (now ${party.fuel})`;
    }
    case "adjustRevelations": {
      party.revelations = Math.floor(normalizeNonNeg(party.revelations + action.delta));
      const sign = action.delta >= 0 ? "+" : "";
      return `Revelations ${sign}${action.delta} (now ${party.revelations})`;
    }
    case "travel": {
      party.fuel -= OVERWORLD_TRAVEL_FUEL_COST;
      party.qx = action.qx;
      party.qy = action.qy;
      return `Traveled to (${action.qx}, ${action.qy}) (−${OVERWORLD_TRAVEL_FUEL_COST} Fuel)`;
    }
    case "returnToDis": {
      party.atDis = true;
      party.fuel = 0;
      party.revelations = 0;
      return "Returned to DIS (Fuel and Revelations cleared)";
    }
    case "deployToHell": {
      party.atDis = false;
      party.qx = action.qx;
      party.qy = action.qy;
      return `Deployed to Hell at (${action.qx}, ${action.qy})`;
    }
  }
}
