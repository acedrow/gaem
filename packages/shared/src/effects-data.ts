import tileEffectsJson from "./data/rules/tile-effects.json" with { type: "json" };
import unitEffectsJson from "./data/rules/unit-effects.json" with { type: "json" };
import weaponEffectsJson from "./data/rules/weapon-effects.json" with { type: "json" };

export type EffectStacking = "add" | "max";

export type RuleEffect = {
  id: string;
  summary: string;
  description: string;
  stacking?: EffectStacking;
  icon: string;
  iconFill?: boolean;
};

export const UNIT_EFFECTS = unitEffectsJson as RuleEffect[];
export const WEAPON_EFFECTS = weaponEffectsJson as RuleEffect[];
export const TILE_EFFECTS = tileEffectsJson as RuleEffect[];

const unitEffectIds = new Set(UNIT_EFFECTS.map((e) => e.id));
export const RULE_EFFECTS = [
  ...UNIT_EFFECTS,
  ...WEAPON_EFFECTS.filter((e) => !unitEffectIds.has(e.id)),
  ...TILE_EFFECTS.filter((e) => !unitEffectIds.has(e.id)),
] as RuleEffect[];

const TILE_EFFECT_DISPLAY_NAMES: Record<string, string> = {
  Stained: "Stained",
  AnnihilationCorridor: "Annihilation Corridor",
};

const TILE_EFFECTS_WITHOUT_STACK_DISPLAY = new Set(Object.keys(TILE_EFFECT_DISPLAY_NAMES));

export function tileEffectDisplayName(id: string): string {
  return TILE_EFFECT_DISPLAY_NAMES[id] ?? id;
}

export function tileEffectShowsStackCount(id: string): boolean {
  return !TILE_EFFECTS_WITHOUT_STACK_DISPLAY.has(id);
}

export function formatTileEffectTooltipLabel(id: string, stacks: number): string {
  const name = tileEffectDisplayName(id);
  if (!tileEffectShowsStackCount(id)) return name;
  return stacks > 1 ? `${name}: ${stacks}` : name;
}

const effectById = new Map<string, RuleEffect>([
  ...TILE_EFFECTS.map((e) => [e.id, e] as const),
  ...WEAPON_EFFECTS.map((e) => [e.id, e] as const),
  ...UNIT_EFFECTS.map((e) => [e.id, e] as const),
]);
const effectIds = new Set([...UNIT_EFFECTS, ...WEAPON_EFFECTS, ...TILE_EFFECTS].map((e) => e.id));

export function getEffectById(id: string): RuleEffect | undefined {
  return effectById.get(id);
}

export function findEffectByName(name: string): RuleEffect | undefined {
  const exact = effectById.get(name);
  if (exact) return exact;
  const lower = name.toLowerCase();
  return RULE_EFFECTS.find((effect) => effect.id.toLowerCase() === lower);
}

export function getEffectSummary(effectId: string): string | undefined {
  return effectById.get(effectId)?.summary;
}

export function getEffectStacking(effectId: string): EffectStacking {
  return effectById.get(effectId)?.stacking ?? "add";
}

export function isKnownEffectId(effectId: string): boolean {
  return effectIds.has(effectId);
}
