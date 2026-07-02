import { RULE_EFFECTS } from "./effects-data.js";

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
  if (!text) return "";

  const placeholders: string[] = [];
  let html = escapeHtml(text);

  for (const pattern of TERM_PATTERNS) {
    html = html.replace(pattern, (match) => {
      const key = `\x00${placeholders.length}\x00`;
      placeholders.push(`<span class="rule-term">${match}</span>`);
      return key;
    });
  }

  return html.replace(/\x00(\d+)\x00/g, (_, i) => placeholders[Number(i)]!);
}
