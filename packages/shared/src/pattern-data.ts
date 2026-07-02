import patternsJson from "./data/rules/patterns.json" with { type: "json" };
import modifiersJson from "./data/rules/modifiers.json" with { type: "json" };

export type PatternKind = "fixed" | "drawable";
export type ModifierKind = "modifier";
export type PatternDirection = "n" | "e" | "s" | "w";
export type PatternOrigin = "self";

export const PATTERN_DIRECTIONS: PatternDirection[] = ["n", "e", "s", "w"];

export type PatternSizeBounds = {
  min: number;
  max: number;
  default: number;
};

export type TargetingPattern = {
  id: string;
  name: string;
  description: string;
  kind: PatternKind;
  origin: PatternOrigin;
  directional: boolean;
  size: PatternSizeBounds;
  adjacency?: "orthogonal";
  metric?: "chebyshev";
  includesOrigin?: boolean;
  defaultRange?: number;
  lopsided?: boolean;
};

export type PatternModifier = {
  id: string;
  name: string;
  description: string;
  size: PatternSizeBounds;
  standalone?: boolean;
  requiresDirection?: boolean;
  appliesTo?: string[];
};

export type PatternModifierValues = {
  range: number;
  width: number;
  recoil: number;
};

export const TARGETING_PATTERNS = patternsJson as TargetingPattern[];
export const PATTERN_MODIFIERS = modifiersJson as PatternModifier[];

const patternById = new Map(TARGETING_PATTERNS.map((p) => [p.id, p]));
const modifierById = new Map(PATTERN_MODIFIERS.map((m) => [m.id, m]));

export const DEFAULT_MODIFIER_VALUES: PatternModifierValues = {
  range: 0,
  width: 0,
  recoil: 0,
};

export function getPatternById(id: string): TargetingPattern | undefined {
  return patternById.get(id);
}

export function getModifierById(id: string): PatternModifier | undefined {
  return modifierById.get(id);
}

export function clampPatternSize(pattern: TargetingPattern, size: number): number {
  return Math.max(pattern.size.min, Math.min(pattern.size.max, size));
}

export function clampModifierSize(modifier: PatternModifier, size: number): number {
  return Math.max(modifier.size.min, Math.min(modifier.size.max, size));
}

export function nextPatternDirection(current: PatternDirection): PatternDirection {
  const idx = PATTERN_DIRECTIONS.indexOf(current);
  return PATTERN_DIRECTIONS[(idx + 1) % PATTERN_DIRECTIONS.length];
}
