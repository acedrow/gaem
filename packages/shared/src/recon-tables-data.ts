import chambersJson from "./data/rules/recon-tables/chambers.json" with { type: "json" };
import corridorsJson from "./data/rules/recon-tables/corridors.json" with { type: "json" };
import scavengeJson from "./data/rules/recon-tables/scavenge.json" with { type: "json" };
import scoutJson from "./data/rules/recon-tables/scout.json" with { type: "json" };
import travelJson from "./data/rules/recon-tables/travel.json" with { type: "json" };
import vaultsJson from "./data/rules/recon-tables/vaults.json" with { type: "json" };

export type ReconTableId =
  | "chambers"
  | "corridors"
  | "vaults"
  | "scavenge"
  | "scout"
  | "travel";

export type ReconTableEntry = {
  roll: number;
  text: string;
};

export type ReconTable = {
  id: ReconTableId;
  name: string;
  die: number;
  entries: ReconTableEntry[];
};

export const RECON_TABLE_IDS: ReconTableId[] = [
  "chambers",
  "corridors",
  "vaults",
  "scavenge",
  "scout",
  "travel",
];

export const RECON_TABLES: ReconTable[] = [
  chambersJson as ReconTable,
  corridorsJson as ReconTable,
  vaultsJson as ReconTable,
  scavengeJson as ReconTable,
  scoutJson as ReconTable,
  travelJson as ReconTable,
];

const BY_ID = new Map<ReconTableId, ReconTable>(
  RECON_TABLES.map((table) => [table.id, table]),
);

export function getReconTable(id: ReconTableId | string | null | undefined): ReconTable | undefined {
  if (!id) return undefined;
  return BY_ID.get(id as ReconTableId);
}

export function listReconTables(): ReconTable[] {
  return RECON_TABLES;
}
