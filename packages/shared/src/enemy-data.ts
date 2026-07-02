import paracletusJson from "./data/enemies/paracletus.json" with { type: "json" };

import type { Enemy } from "./types.js";

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

export function getEnemyScaleByName(name: string | undefined): number {
  const scale = findEnemyListing(name)?.scale;
  return scale != null && scale >= 1 ? Math.trunc(scale) : 1;
}

export function getEnemyScale(enemy: Pick<Enemy, "scale" | "name">): number {
  if (enemy.scale != null && enemy.scale >= 1) return Math.trunc(enemy.scale);
  return getEnemyScaleByName(enemy.name);
}

export function enemyFootprintTiles(
  x: number,
  y: number,
  scale: number,
): { x: number; y: number }[] {
  const tiles: { x: number; y: number }[] = [];
  for (let dy = 0; dy < scale; dy++) {
    for (let dx = 0; dx < scale; dx++) {
      tiles.push({ x: x + dx, y: y + dy });
    }
  }
  return tiles;
}

export function enemyOccupiesTile(
  enemy: Pick<Enemy, "x" | "y" | "scale" | "name">,
  x: number,
  y: number,
): boolean {
  const scale = getEnemyScale(enemy);
  return x >= enemy.x && x < enemy.x + scale && y >= enemy.y && y < enemy.y + scale;
}
