import unitEffectsJson from "./data/rules/unit-effects.json" with { type: "json" };
import weaponEffectsJson from "./data/rules/weapon-effects.json" with { type: "json" };

export type EffectStacking = "add" | "max";

export type RuleEffect = {
  id: string;
  summary: string;
  description: string;
  stacking?: EffectStacking;
  icon: string;
};

export const UNIT_EFFECTS = unitEffectsJson as RuleEffect[];
export const WEAPON_EFFECTS = weaponEffectsJson as RuleEffect[];

const unitEffectIds = new Set(UNIT_EFFECTS.map((e) => e.id));
export const RULE_EFFECTS = [
  ...UNIT_EFFECTS,
  ...WEAPON_EFFECTS.filter((e) => !unitEffectIds.has(e.id)),
] as RuleEffect[];

const effectById = new Map<string, RuleEffect>([
  ...WEAPON_EFFECTS.map((e) => [e.id, e] as const),
  ...UNIT_EFFECTS.map((e) => [e.id, e] as const),
]);
const effectIds = new Set([...UNIT_EFFECTS, ...WEAPON_EFFECTS].map((e) => e.id));

export function getEffectById(id: string): RuleEffect | undefined {
  return effectById.get(id);
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
