import {
  listEnemyListings,
  PLAYER_ARMOR,
  PLAYER_CLASSES,
  PLAYER_WEAPONS,
} from "@gaem/shared";

import type { DataFocusKind } from "../composables/useInfoDataSelection.js";

export type GameDataSearchResult = {
  kind: DataFocusKind;
  name: string;
  subtitle?: string;
  score: number;
};

type SearchEntry = {
  kind: DataFocusKind;
  name: string;
  subtitle?: string;
  haystack: string;
};

function haystack(...parts: (string | undefined)[]): string {
  return parts.filter(Boolean).join(" ").toLowerCase();
}

const SEARCH_INDEX: SearchEntry[] = [
  ...PLAYER_CLASSES.map((item) => ({
    kind: "classes" as const,
    name: item.name,
    subtitle: item.summary,
    haystack: haystack(item.name, item.summary, item.description, item.activeAbility, item.passiveAbility),
  })),
  ...PLAYER_ARMOR.map((item) => ({
    kind: "armor" as const,
    name: item.name,
    subtitle: item.summary,
    haystack: haystack(
      item.name,
      item.summary,
      item.description,
      item.specialMovement,
      item.armorAction,
      item.reversal?.description,
      item.reversal?.effect,
      item.reversal?.trigger,
    ),
  })),
  ...PLAYER_WEAPONS.map((item) => ({
    kind: "weapons" as const,
    name: item.name,
    haystack: haystack(item.name, item.description, item.activeAbility, item.passiveAbility),
  })),
  ...listEnemyListings().map((item) => ({
    kind: "enemy" as const,
    name: item.name,
    subtitle: item.title,
    haystack: haystack(
      item.name,
      item.codename,
      item.title,
      item.description,
      item.tags?.join(" "),
    ),
  })),
];

function scoreMatch(name: string, haystack: string, query: string): number {
  const normalizedName = name.toLowerCase();
  if (normalizedName === query) return 100;
  if (normalizedName.startsWith(query)) return 80;
  if (normalizedName.includes(query)) return 60;
  if (haystack.includes(query)) return 40;
  const terms = query.split(/\s+/).filter(Boolean);
  if (terms.length > 1 && terms.every((term) => haystack.includes(term))) return 30;
  return 0;
}

export function searchGameData(query: string, limit = 12): GameDataSearchResult[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return [];

  const results: GameDataSearchResult[] = [];
  for (const entry of SEARCH_INDEX) {
    const score = scoreMatch(entry.name, entry.haystack, trimmed);
    if (score > 0) {
      results.push({
        kind: entry.kind,
        name: entry.name,
        subtitle: entry.subtitle,
        score,
      });
    }
  }

  return results
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, limit);
}

export function kindLabel(kind: DataFocusKind): string {
  if (kind === "classes") return "Class";
  if (kind === "armor") return "Armor";
  if (kind === "weapons") return "Weapon";
  return "Enemy";
}
