import armorJson from "./data/player/armor.json" with { type: "json" };
import classesJson from "./data/player/classes.json" with { type: "json" };
import weaponsJson from "./data/player/weapons.json" with { type: "json" };
import effectsJson from "./data/rules/effects.json" with { type: "json" };
import type { Player } from "./types.js";
import type { StructuredArmorAction, WeaponAttackSpec } from "./combat/types.js";
import type { AbilityText } from "./rule-text.js";

export type { StructuredArmorAction, WeaponAttackSpec, AbilityText };

type ClassJson = (typeof classesJson)[number];
type ArmorJson = (typeof armorJson)[number];
type WeaponJson = (typeof weaponsJson)[number];

export type PlayerClass = Omit<ClassJson, "activeAbility" | "passiveAbility"> & {
  activeAbility?: AbilityText;
  passiveAbility?: AbilityText;
};
export type PlayerArmor = Omit<ArmorJson, "armorAction" | "specialMovement"> & {
  armorAction?: AbilityText;
  specialMovement?: AbilityText;
  armorActionStructured?: StructuredArmorAction;
};
export type PlayerWeapon = Omit<WeaponJson, "activeAbility" | "passiveAbility"> & {
  activeAbility?: AbilityText;
  passiveAbility?: AbilityText;
  attack?: WeaponAttackSpec;
};
export type EffectGlossaryEntry = (typeof effectsJson)[number];

export const PLAYER_CLASSES = classesJson as PlayerClass[];
export const PLAYER_ARMOR = armorJson as PlayerArmor[];
export const PLAYER_WEAPONS = weaponsJson as PlayerWeapon[];
export const EFFECT_GLOSSARY = effectsJson as EffectGlossaryEntry[];

const classNames = new Set(PLAYER_CLASSES.map((c) => c.name));
const armorNames = new Set(PLAYER_ARMOR.map((a) => a.name));
const weaponNames = new Set(PLAYER_WEAPONS.map((w) => w.name));

export function getClassByName(name: string): PlayerClass | undefined {
  return PLAYER_CLASSES.find((c) => c.name === name);
}

export function getClassMaxHp(className: string | undefined): number {
  if (!className) return 0;
  return getClassByName(className)?.hp ?? 0;
}

export function getArmorByName(name: string): PlayerArmor | undefined {
  return PLAYER_ARMOR.find((a) => a.name === name);
}

export function getWeaponByName(name: string): PlayerWeapon | undefined {
  return PLAYER_WEAPONS.find((w) => w.name === name);
}

export function getArmorSpeed(armorName: string | undefined): number {
  if (!armorName) return 4;
  return getArmorByName(armorName)?.speed ?? 4;
}

export function applyLoadoutToPlayer(
  player: Player,
  loadout: { className: string; armor: string; weapon: string },
): void {
  player.class = loadout.className;
  player.armor = loadout.armor;
  player.weapon = loadout.weapon;
  player.speed = getArmorSpeed(loadout.armor);
  const armor = getArmorByName(loadout.armor);
  if (armor?.reversal?.charges != null) {
    player.reversalCharges = armor.reversal.charges;
  }
  if (player.equipmentUses === undefined) player.equipmentUses = 1;
  player.hp = normalizePlayerHp(player);
}

function normalizePlayerHp(player: Player): number {
  const maxHp = getClassMaxHp(player.class);
  const current = player.hp ?? maxHp;
  return Math.max(0, Math.min(current, maxHp));
}

export function getEffectSummary(effectId: string): string | undefined {
  return EFFECT_GLOSSARY.find((e) => e.id === effectId)?.summary;
}

export function validateCharacterSheetRefs(fields: {
  class?: string;
  armor?: string;
  weapon?: string;
}): string | null {
  if (fields.class !== undefined && !classNames.has(fields.class)) {
    return `Invalid class: ${fields.class}`;
  }
  if (fields.armor !== undefined && !armorNames.has(fields.armor)) {
    return `Invalid armor: ${fields.armor}`;
  }
  if (fields.weapon !== undefined && !weaponNames.has(fields.weapon)) {
    return `Invalid weapon: ${fields.weapon}`;
  }
  return null;
}
