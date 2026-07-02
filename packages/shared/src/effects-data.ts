import effectsJson from "./data/rules/effects.json" with { type: "json" };

export type EffectStacking = "add" | "max";

export type RuleEffect = {
  id: string;
  summary: string;
  description: string;
  stacking?: EffectStacking;
  icon: string;
};

export const RULE_EFFECTS = effectsJson as RuleEffect[];

const effectById = new Map(RULE_EFFECTS.map((e) => [e.id, e]));
const effectIds = new Set(RULE_EFFECTS.map((e) => e.id));

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
