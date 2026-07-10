import {
  FACTION_IDS,
  FACTION_QUALITY_KEYS,
  FACTIONS,
  getFactionById,
  type FactionId,
  type FactionQualityDots,
} from "./faction-data.js";
import type { FactionCampaignAction, FactionState, FactionStates, GameState } from "./types.js";

const QUALITY_LABELS: Record<keyof FactionQualityDots, string> = {
  force: "Force",
  subterfuge: "Subterfuge",
  territory: "Territory",
  assets: "Assets",
};

export function defaultFactionState(factionId: FactionId): FactionState {
  const listing = getFactionById(factionId)!;
  return {
    crown: listing.crown,
    force: listing.qualities.force,
    subterfuge: listing.qualities.subterfuge,
    territory: listing.qualities.territory,
    assets: listing.qualities.assets,
  };
}

export function defaultFactionStates(): FactionStates {
  const states = {} as FactionStates;
  for (const id of FACTION_IDS) {
    states[id] = defaultFactionState(id);
  }
  return states;
}

function clampQuality(value: number): number {
  return Math.max(0, Math.min(5, value));
}

function clampCrown(value: number): number {
  return Math.max(1, Math.min(5, value));
}

function normalizeFactionState(raw: Partial<FactionState> | undefined, factionId: FactionId): FactionState {
  const defaults = defaultFactionState(factionId);
  if (!raw) return defaults;
  return {
    crown: clampCrown(typeof raw.crown === "number" ? raw.crown : defaults.crown),
    force: clampQuality(typeof raw.force === "number" ? raw.force : defaults.force),
    subterfuge: clampQuality(typeof raw.subterfuge === "number" ? raw.subterfuge : defaults.subterfuge),
    territory: clampQuality(typeof raw.territory === "number" ? raw.territory : defaults.territory),
    assets: clampQuality(typeof raw.assets === "number" ? raw.assets : defaults.assets),
  };
}

export function ensureFactionStates(state: GameState): FactionStates {
  const existing = state.factionStates;
  const next = {} as FactionStates;
  for (const id of FACTION_IDS) {
    next[id] = normalizeFactionState(existing?.[id], id);
  }
  state.factionStates = next;
  return next;
}

export function validateFactionCampaignAction(
  state: GameState,
  action: FactionCampaignAction,
): string | null {
  ensureFactionStates(state);
  if (!FACTION_IDS.includes(action.factionId)) return "Unknown faction";
  const faction = state.factionStates![action.factionId];

  if (action.kind === "adjustCrown") {
    if (!Number.isInteger(action.delta) || action.delta === 0) return "Invalid delta";
    const next = faction.crown + action.delta;
    if (next < 1 || next > 5) return "Crown must be between 1 and 5";
    return null;
  }

  if (!FACTION_QUALITY_KEYS.includes(action.quality)) return "Unknown quality";
  if (!Number.isInteger(action.delta) || action.delta === 0) return "Invalid delta";
  const next = faction[action.quality] + action.delta;
  if (next < 0 || next > 5) return "Quality must be between 0 and 5";
  return null;
}

export function applyFactionCampaignAction(state: GameState, action: FactionCampaignAction): string {
  ensureFactionStates(state);
  const faction = state.factionStates![action.factionId];
  const name = FACTIONS.find((f) => f.id === action.factionId)?.name ?? action.factionId;

  if (action.kind === "adjustCrown") {
    faction.crown += action.delta;
    const sign = action.delta >= 0 ? "+" : "";
    return `${name} Crown ${sign}${action.delta} → ${faction.crown}`;
  }

  faction[action.quality] += action.delta;
  const sign = action.delta >= 0 ? "+" : "";
  return `${name} ${QUALITY_LABELS[action.quality]} ${sign}${action.delta} → ${faction[action.quality]}`;
}
