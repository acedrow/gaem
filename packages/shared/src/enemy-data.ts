import paracletusJson from "./data/enemies/paracletus.json" with { type: "json" };

export type EnemyListing = {
  name: string;
  codename?: string;
  title?: string;
  description?: string;
  hp: number;
  agnosiaHp?: number;
  crown?: number;
  scale?: number;
  speed?: number;
  actions?: string;
  tags?: string[];
  attacks?: string[];
  agnosia?: string;
  special?: string;
  stainwalk?: string;
};

type EnemyFaction = {
  enemies: EnemyListing[];
};

const ENEMY_FACTIONS = [paracletusJson] as EnemyFaction[];

export function listEnemyListings(): EnemyListing[] {
  return ENEMY_FACTIONS.flatMap((faction) => faction.enemies);
}

function findEnemyListing(name: string | undefined): EnemyListing | undefined {
  if (!name) return undefined;
  const normalized = name.trim().toLowerCase();
  for (const faction of ENEMY_FACTIONS) {
    for (const enemy of faction.enemies) {
      if (enemy.name.toLowerCase() === normalized) return enemy;
      if (enemy.codename?.toLowerCase() === normalized) return enemy;
    }
  }
  return undefined;
}

export function getEnemyListingByName(name: string | undefined): EnemyListing | undefined {
  return findEnemyListing(name);
}

export function getEnemyMaxHpByName(name: string | undefined): number {
  return findEnemyListing(name)?.hp ?? 0;
}
