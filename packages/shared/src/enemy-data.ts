import paracletusJson from "./data/enemies/paracletus.json" with { type: "json" };

type EnemyListing = {
  name: string;
  codename?: string;
  hp: number;
};

type EnemyFaction = {
  enemies: EnemyListing[];
};

const ENEMY_FACTIONS = [paracletusJson] as EnemyFaction[];

export function getEnemyMaxHpByName(name: string | undefined): number {
  if (!name) return 0;
  const normalized = name.trim().toLowerCase();
  for (const faction of ENEMY_FACTIONS) {
    for (const enemy of faction.enemies) {
      if (enemy.name.toLowerCase() === normalized) return enemy.hp;
      if (enemy.codename?.toLowerCase() === normalized) return enemy.hp;
    }
  }
  return 0;
}
