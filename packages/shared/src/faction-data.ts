import autophyesJson from "./data/factions/autophyes.json" with { type: "json" };
import paracletusJson from "./data/factions/paracletus.json" with { type: "json" };
import syncrasisJson from "./data/factions/syncrasis.json" with { type: "json" };

import type { OverworldRegionId } from "./types.js";

export type FactionId = "syncrasis" | "autophyes" | "paracletus";

export type FactionQualityDots = {
  force: number;
  subterfuge: number;
  territory: number;
  assets: number;
};

export type FactionLocation = {
  name: string;
  description: string;
  type?: string;
  purpose?: string;
  terrain?: string;
  defenses?: string;
  quality?: Partial<FactionQualityDots>;
  buildTime?: number;
  requires?: string;
};

export type FactionStratcomAction = {
  name: string;
  flavor?: string;
  description: string;
  crownCost?: number;
  requires?: string;
};

export type FactionUpgrade = {
  name: string;
  flavor?: string;
  ichorCost: number;
  effect: string;
  requires?: string;
};

export type FactionListing = {
  id: FactionId;
  name: string;
  tagline: string;
  threat: number;
  description: string;
  force: number;
  subterfuge: number;
  territory: number;
  assets: number;
  uniqueMechanics?: { name: string; effect: string }[];
  startingLocations: FactionLocation[];
  uniqueLocations: FactionLocation[];
  stratcomActions: FactionStratcomAction[];
  upgrades: FactionUpgrade[];
};

export const OVERWORLD_REGION_FACTIONS: Record<OverworldRegionId, FactionId> = {
  west: "syncrasis",
  center: "autophyes",
  east: "paracletus",
};

export const FACTIONS: FactionListing[] = [
  syncrasisJson as FactionListing,
  autophyesJson as FactionListing,
  paracletusJson as FactionListing,
];

const FACTION_BY_ID = new Map<FactionId, FactionListing>(
  FACTIONS.map((faction) => [faction.id, faction]),
);

export function getFactionById(id: FactionId | string | null | undefined): FactionListing | undefined {
  if (!id) return undefined;
  return FACTION_BY_ID.get(id as FactionId);
}

export function getFactionForRegion(regionId: OverworldRegionId): FactionListing {
  return FACTION_BY_ID.get(OVERWORLD_REGION_FACTIONS[regionId])!;
}
