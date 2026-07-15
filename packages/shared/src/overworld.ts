import type {
  GameState,
  OverworldCampaignAction,
  OverworldConvoy,
  OverworldConvoyAction,
  OverworldConvoyType,
  OverworldLocation,
  OverworldLocationAction,
  OverworldParty,
  OverworldRegion,
  OverworldRegionId,
} from "./types.js";
import {
  MAP_SPEED_INCHES,
  OVERWORLD_QUARTER_HEIGHT,
  OVERWORLD_QUARTER_WIDTH,
  OVERWORLD_TRAVEL_FUEL_COST,
  OVERWORLD_WIDTH,
  QUARTER_CELL_INCHES,
} from "./types.js";
import { type FactionId } from "./faction-data.js";

const REGION_IDS: OverworldRegionId[] = ["west", "center", "east"];
const FACTION_IDS: FactionId[] = ["syncrasis", "autophyes", "paracletus"];
const CONVOY_TYPES: OverworldConvoyType[] = [
  "supply",
  "support",
  "assault",
  "diplomatic",
  "decoy",
];

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

export function regionIdForQuarter(qx: number): OverworldRegionId {
  const majorX = Math.floor(qx / 2);
  const third = OVERWORLD_WIDTH / 3;
  if (majorX < third) return "west";
  if (majorX < third * 2) return "center";
  return "east";
}

function newLocationId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function ensureOverworldLocations(state: GameState): OverworldLocation[] {
  if (!Array.isArray(state.overworldLocations)) {
    state.overworldLocations = [];
    return state.overworldLocations;
  }
  const seen = new Set<string>();
  const out: OverworldLocation[] = [];
  for (const loc of state.overworldLocations) {
    if (!loc || typeof loc !== "object") continue;
    if (typeof loc.id !== "string" || !loc.id) continue;
    if (typeof loc.name !== "string" || !loc.name.trim()) continue;
    if (!FACTION_IDS.includes(loc.factionId as FactionId)) continue;
    if (!isOverworldQuarterInBounds(loc.qx, loc.qy)) continue;
    const key = `${loc.qx},${loc.qy}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const entry: OverworldLocation = {
      id: loc.id,
      qx: loc.qx,
      qy: loc.qy,
      name: loc.name.trim(),
      factionId: loc.factionId,
    };
    if (loc.infoVisibleToPlayers === false) entry.infoVisibleToPlayers = false;
    out.push(entry);
  }
  state.overworldLocations = out;
  return out;
}

export function isLocationInfoVisibleToPlayers(loc: OverworldLocation): boolean {
  return loc.infoVisibleToPlayers !== false;
}

export function locationAtQuarter(
  state: GameState,
  qx: number,
  qy: number,
): OverworldLocation | undefined {
  return ensureOverworldLocations(state).find((loc) => loc.qx === qx && loc.qy === qy);
}

function newConvoyId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function ensureOverworldConvoys(state: GameState): OverworldConvoy[] {
  if (!Array.isArray(state.overworldConvoys)) {
    state.overworldConvoys = [];
    return state.overworldConvoys;
  }
  const seen = new Set<string>();
  const out: OverworldConvoy[] = [];
  for (const convoy of state.overworldConvoys) {
    if (!convoy || typeof convoy !== "object") continue;
    if (typeof convoy.id !== "string" || !convoy.id) continue;
    if (!CONVOY_TYPES.includes(convoy.type as OverworldConvoyType)) continue;
    if (!FACTION_IDS.includes(convoy.factionId as FactionId)) continue;
    if (!isOverworldQuarterInBounds(convoy.qx, convoy.qy)) continue;
    const key = `${convoy.qx},${convoy.qy}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: convoy.id,
      qx: convoy.qx,
      qy: convoy.qy,
      type: convoy.type,
      factionId: convoy.factionId,
      infoVisibleToPlayers: convoy.infoVisibleToPlayers === true,
    });
  }
  state.overworldConvoys = out;
  return out;
}

export function convoyAtQuarter(
  state: GameState,
  qx: number,
  qy: number,
): OverworldConvoy | undefined {
  return ensureOverworldConvoys(state).find((c) => c.qx === qx && c.qy === qy);
}

export function listOverworldConvoyDestinations(
  convoy: Pick<OverworldConvoy, "qx" | "qy">,
  mapSpeed: number,
  occupied: ReadonlySet<string>,
): { qx: number; qy: number }[] {
  const reach = overworldTravelReachQuarters(mapSpeed);
  if (reach <= 0) return [];
  const out: { qx: number; qy: number }[] = [];
  const minQx = Math.max(0, Math.floor(convoy.qx - reach));
  const maxQx = Math.min(OVERWORLD_QUARTER_WIDTH - 1, Math.ceil(convoy.qx + reach));
  const minQy = Math.max(0, Math.floor(convoy.qy - reach));
  const maxQy = Math.min(OVERWORLD_QUARTER_HEIGHT - 1, Math.ceil(convoy.qy + reach));
  for (let qy = minQy; qy <= maxQy; qy++) {
    for (let qx = minQx; qx <= maxQx; qx++) {
      if (!isOverworldTravelDestination(convoy, { qx, qy }, mapSpeed)) continue;
      if (occupied.has(`${qx},${qy}`)) continue;
      out.push({ qx, qy });
    }
  }
  return out;
}

export function validateOverworldLocationAction(
  state: GameState,
  action: OverworldLocationAction,
): string | null {
  ensureOverworldLocations(state);
  switch (action.kind) {
    case "place": {
      if (!isOverworldQuarterInBounds(action.qx, action.qy)) return "Out of bounds";
      if (!FACTION_IDS.includes(action.factionId as FactionId)) return "Unknown faction";
      const name = typeof action.name === "string" ? action.name.trim() : "";
      if (!name) return "Location name is required";
      if (locationAtQuarter(state, action.qx, action.qy)) {
        return "A location is already placed here";
      }
      return null;
    }
    case "remove": {
      if (typeof action.locationId !== "string" || !action.locationId) {
        return "Location id is required";
      }
      if (!state.overworldLocations!.some((loc) => loc.id === action.locationId)) {
        return "Location not found";
      }
      return null;
    }
    case "setInfoVisible": {
      if (typeof action.locationId !== "string" || !action.locationId) {
        return "Location id is required";
      }
      if (typeof action.visible !== "boolean") return "Visibility must be a boolean";
      if (!state.overworldLocations!.some((loc) => loc.id === action.locationId)) {
        return "Location not found";
      }
      return null;
    }
  }
}

export function applyOverworldLocationAction(
  state: GameState,
  action: OverworldLocationAction,
): string {
  const locations = ensureOverworldLocations(state);
  switch (action.kind) {
    case "place": {
      const name = action.name.trim();
      locations.push({
        id: newLocationId(),
        qx: action.qx,
        qy: action.qy,
        name,
        factionId: action.factionId,
      });
      return `Placed location "${name}" at (${action.qx}, ${action.qy})`;
    }
    case "remove": {
      const idx = locations.findIndex((loc) => loc.id === action.locationId);
      const removed = locations[idx]!;
      locations.splice(idx, 1);
      return `Removed location "${removed.name}"`;
    }
    case "setInfoVisible": {
      const loc = locations.find((l) => l.id === action.locationId)!;
      if (action.visible) delete loc.infoVisibleToPlayers;
      else loc.infoVisibleToPlayers = false;
      return action.visible
        ? `Revealed location "${loc.name}" to players`
        : `Hid location "${loc.name}" from players`;
    }
  }
}

export function validateOverworldConvoyAction(
  state: GameState,
  action: OverworldConvoyAction,
): string | null {
  ensureOverworldConvoys(state);
  const party = ensureOverworldParty(state);
  switch (action.kind) {
    case "place": {
      if (!isOverworldQuarterInBounds(action.qx, action.qy)) return "Out of bounds";
      if (!CONVOY_TYPES.includes(action.type)) return "Unknown convoy type";
      if (!FACTION_IDS.includes(action.factionId as FactionId)) return "Unknown faction";
      if (convoyAtQuarter(state, action.qx, action.qy)) {
        return "A convoy is already placed here";
      }
      return null;
    }
    case "remove": {
      if (typeof action.convoyId !== "string" || !action.convoyId) {
        return "Convoy id is required";
      }
      if (!state.overworldConvoys!.some((c) => c.id === action.convoyId)) {
        return "Convoy not found";
      }
      return null;
    }
    case "move": {
      if (typeof action.convoyId !== "string" || !action.convoyId) {
        return "Convoy id is required";
      }
      const convoy = state.overworldConvoys!.find((c) => c.id === action.convoyId);
      if (!convoy) return "Convoy not found";
      if (!isOverworldTravelDestination(convoy, { qx: action.qx, qy: action.qy }, party.mapSpeed)) {
        return "Invalid convoy destination";
      }
      const other = convoyAtQuarter(state, action.qx, action.qy);
      if (other && other.id !== convoy.id) return "A convoy is already placed here";
      return null;
    }
    case "setInfoVisible": {
      if (typeof action.convoyId !== "string" || !action.convoyId) {
        return "Convoy id is required";
      }
      if (typeof action.visible !== "boolean") return "Visibility must be a boolean";
      if (!state.overworldConvoys!.some((c) => c.id === action.convoyId)) {
        return "Convoy not found";
      }
      return null;
    }
  }
}

export function applyOverworldConvoyAction(
  state: GameState,
  action: OverworldConvoyAction,
): string {
  const convoys = ensureOverworldConvoys(state);
  switch (action.kind) {
    case "place": {
      convoys.push({
        id: newConvoyId(),
        qx: action.qx,
        qy: action.qy,
        type: action.type,
        factionId: action.factionId,
        infoVisibleToPlayers: false,
      });
      return `Deployed ${action.type} convoy at (${action.qx}, ${action.qy})`;
    }
    case "remove": {
      const idx = convoys.findIndex((c) => c.id === action.convoyId);
      const removed = convoys[idx]!;
      convoys.splice(idx, 1);
      return `Removed ${removed.type} convoy`;
    }
    case "move": {
      const convoy = convoys.find((c) => c.id === action.convoyId)!;
      convoy.qx = action.qx;
      convoy.qy = action.qy;
      return `Moved ${convoy.type} convoy to (${action.qx}, ${action.qy})`;
    }
    case "setInfoVisible": {
      const convoy = convoys.find((c) => c.id === action.convoyId)!;
      convoy.infoVisibleToPlayers = action.visible;
      return action.visible
        ? `Revealed ${convoy.type} convoy to players`
        : `Hid ${convoy.type} convoy from players`;
    }
  }
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
