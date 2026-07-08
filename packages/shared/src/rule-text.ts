import { findEffectByName, RULE_EFFECTS } from "./effects-data.js";
import { getGameTermByName } from "./game-terms-data.js";
import { findModifierByName, findPatternByName } from "./pattern-data.js";
import { getTerrainTypeById } from "./terrain-data.js";

export type AbilitySection = {
  title?: string;
  options: string[];
};

export type StructuredAbility = {
  name: string;
  intro?: string;
  sections?: AbilitySection[];
  outro?: string;
};

export type AbilityText = string | StructuredAbility;

export type RuleTermTooltip = {
  title: string;
  summary: string;
  description: string;
};

export type RuleTextSegment =
  | { kind: "text"; text: string }
  | { kind: "term"; text: string; tooltip?: RuleTermTooltip };

const EFFECT_IDS = RULE_EFFECTS.map((e) => e.id);

const EXTRA_EFFECT_NAMES = [
  "Retaliation",
  "Compel",
  "Pressure",
  "Throw",
  "Bounce",
  "Pull",
  "Push",
  "Haste",
  "Transference",
  "Brand",
  "Charge",
  "Mark",
  "Burst",
  "Arc",
  "Uneasy",
  "Fortified",
  "Cover",
  "Advantageous",
  "Void",
  "Provoke",
  "Breaker",
  "Swarm",
  "Swarmed",
  "Flying",
  "Minion",
  "Fortification",
  "Stationary",
  "Immobile",
  "Link",
  "Stained",
  "Temporary HP",
  "Shared HP",
  "Spin Charge",
  "Combo Tag",
  "Combo Tags",
  "Equipment",
  "Reversal",
  "TACCOM",
  "HELLPIERCERS",
  "Effects",
  "Pattern",
  "Damage",
  "Healing",
  "Blazing",
  "Bleed",
  "Lingering",
  "Pin",
  "Aegis",
  "Shock",
  "Slow",
  "Bound",
  "Countdown",
];

const LITERAL_TERMS = [
  "Main Action",
  "Support Action",
  "Aux Action",
  "free action",
  "regular attack",
  "weapon attack",
  "armor action",
  "Void terrain",
  "Advantageous Terrain",
  "Advantageous terrain",
  "miniboss",
  "line of sight",
  "Breaker tag",
  "Swarm trait",
];

const LITERAL_TERM_LOOKUP: Record<string, string> = {
  "breaker tag": "Breaker",
  "swarm trait": "Swarm",
  "void terrain": "Void",
  "advantageous terrain": "Advantageous",
};

type TermMatch = { start: number; end: number; text: string };

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildTermPatterns(): RegExp[] {
  const patterns: RegExp[] = [];

  for (const term of LITERAL_TERMS) {
    patterns.push(new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"));
  }

  const effectNames = [...new Set([...EFFECT_IDS, ...EXTRA_EFFECT_NAMES])].sort(
    (a, b) => b.length - a.length,
  );
  for (const name of effectNames) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    patterns.push(new RegExp(`\\b${escaped}:\\d+\\b`, "g"));
    if (!name.includes(" ")) {
      patterns.push(new RegExp(`\\b${escaped}\\b`, "g"));
    }
  }

  patterns.push(/\bRange: ?\d+(?:-\d+)?\b/gi);
  patterns.push(/\bSpeed: ?\d+\b/gi);
  patterns.push(/\b\+?\d+ Damage\b/gi);
  patterns.push(/\bHP\b/g);

  return patterns;
}

const TERM_PATTERNS = buildTermPatterns();

function findTermMatches(text: string): TermMatch[] {
  const matches: TermMatch[] = [];

  for (const pattern of TERM_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      matches.push({
        start: match.index,
        end: match.index + match[0].length,
        text: match[0],
      });
    }
  }

  matches.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));

  const filtered: TermMatch[] = [];
  for (const match of matches) {
    const prev = filtered[filtered.length - 1];
    if (!prev) {
      filtered.push(match);
      continue;
    }
    if (match.start >= prev.end) {
      filtered.push(match);
      continue;
    }
    if (match.start === prev.start && match.end > prev.end) {
      filtered[filtered.length - 1] = match;
    }
  }

  return filtered;
}

function lookupName(name: string): RuleTermTooltip | undefined {
  const effect = findEffectByName(name);
  if (effect) {
    return { title: effect.id, summary: effect.summary, description: effect.description };
  }

  const terrain = getTerrainTypeById(name);
  if (terrain) {
    return { title: terrain.name, summary: terrain.summary, description: terrain.description };
  }

  const pattern = findPatternByName(name);
  if (pattern) {
    return { title: pattern.name, summary: pattern.description, description: pattern.description };
  }

  const modifier = findModifierByName(name);
  if (modifier) {
    return { title: modifier.name, summary: modifier.description, description: modifier.description };
  }

  const gameTerm = getGameTermByName(name);
  if (gameTerm) {
    return {
      title: gameTerm.id,
      summary: gameTerm.summary,
      description: gameTerm.description,
    };
  }

  return undefined;
}

export function resolveRuleTermTooltip(match: string): RuleTermTooltip | undefined {
  const trimmed = match.trim();
  const literalTarget = LITERAL_TERM_LOOKUP[trimmed.toLowerCase()];
  if (literalTarget) return lookupName(literalTarget);

  const stacked = trimmed.match(/^(.+?):(\d+(?:-\d+)?)$/);
  const baseName = stacked?.[1] ?? trimmed;
  return lookupName(baseName);
}

export function parseRuleText(text: string): RuleTextSegment[] {
  if (!text) return [];

  const matches = findTermMatches(text);
  if (matches.length === 0) return [{ kind: "text", text }];

  const segments: RuleTextSegment[] = [];
  let cursor = 0;

  for (const match of matches) {
    if (match.start > cursor) {
      segments.push({ kind: "text", text: text.slice(cursor, match.start) });
    }
    segments.push({
      kind: "term",
      text: match.text,
      tooltip: resolveRuleTermTooltip(match.text),
    });
    cursor = match.end;
  }

  if (cursor < text.length) {
    segments.push({ kind: "text", text: text.slice(cursor) });
  }

  return segments;
}

export function isStructuredAbility(value: AbilityText | undefined): value is StructuredAbility {
  return !!value && typeof value === "object" && "name" in value;
}

export function parseAbilityNameBody(text: string): { name: string; body: string } | null {
  const idx = text.indexOf(" — ");
  if (idx <= 0) return null;
  return {
    name: text.slice(0, idx),
    body: text.slice(idx + 3),
  };
}

export function abilityTextToPlain(value: AbilityText | undefined): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  const parts = [value.name, value.intro, value.outro];
  for (const section of value.sections ?? []) {
    if (section.title) parts.push(section.title);
    parts.push(...section.options);
  }
  return parts.filter(Boolean).join(" ");
}

export function formatRuleText(text: string): string {
  return parseRuleText(text)
    .map((segment) => {
      if (segment.kind === "text") return escapeHtml(segment.text);
      const classes = segment.tooltip ? "rule-term rule-term--defined" : "rule-term";
      return `<span class="${classes}">${escapeHtml(segment.text)}</span>`;
    })
    .join("");
}
