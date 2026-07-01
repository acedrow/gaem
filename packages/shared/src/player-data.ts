import armorJson from "./data/player/armor.json" with { type: "json" };
import classesJson from "./data/player/classes.json" with { type: "json" };
import weaponsJson from "./data/player/weapons.json" with { type: "json" };

export type PlayerClass = (typeof classesJson)[number];
export type PlayerArmor = (typeof armorJson)[number];
export type PlayerWeapon = (typeof weaponsJson)[number];

export const PLAYER_CLASSES = classesJson as PlayerClass[];
export const PLAYER_ARMOR = armorJson as PlayerArmor[];
export const PLAYER_WEAPONS = weaponsJson as PlayerWeapon[];

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
