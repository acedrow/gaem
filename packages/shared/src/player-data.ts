import armorJson from "./data/player/armor.json" with { type: "json" };
import classesJson from "./data/player/classes.json" with { type: "json" };
import equipmentJson from "./data/player/equipment.json" with { type: "json" };
import gearJson from "./data/player/gear.json" with { type: "json" };
import weaponsJson from "./data/player/weapons.json" with { type: "json" };
import type { CharacterSheet, Player } from "./types.js";
import { RULE_EFFECTS, getEffectSummary as getEffectSummaryFromData } from "./effects-data.js";
import type { RuleEffect } from "./effects-data.js";
import type { ClassActiveKind, ActionTier, StructuredArmorAction, WeaponAttackSpec } from "./combat/types.js";
import type { AbilityText } from "./rule-text.js";
import {
  validateCharacterSheetLoadout,
  type CharacterSheetLoadoutFields,
} from "./base-upgrades-unlocks.js";
import { applyGearPassivesOnLoadout } from "./combat/gear.js";
import { isValidYadathanTowerName, isYadathanArmorName, YADATHAN_ARMOR_NAME } from "./combat/yadathan.js";

export type { StructuredArmorAction, WeaponAttackSpec, AbilityText };

type ClassJson = (typeof classesJson)[number];
type ArmorJson = (typeof armorJson)[number];
type WeaponJson = (typeof weaponsJson)[number];
type EquipmentJson = (typeof equipmentJson)[number];
type GearJson = (typeof gearJson)[number];

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
export type PlayerEquipment = EquipmentJson & {
  placement?: {
    tiles?: readonly (readonly [number, number])[];
    anchorTile?: readonly [number, number];
    patternId?: string;
    size?: number;
    width?: number;
    directional?: boolean;
  };
};
export type PlayerGear = GearJson;
export type EffectGlossaryEntry = RuleEffect;

export const PLAYER_CLASSES = classesJson as PlayerClass[];
export const PLAYER_ARMOR = armorJson as PlayerArmor[];
export const PLAYER_WEAPONS = weaponsJson as PlayerWeapon[];
export const PLAYER_EQUIPMENT = equipmentJson as PlayerEquipment[];
export const PLAYER_GEAR = gearJson as PlayerGear[];
export const EFFECT_GLOSSARY = RULE_EFFECTS;

const classNames = new Set(PLAYER_CLASSES.map((c) => c.name));
const armorNames = new Set(PLAYER_ARMOR.map((a) => a.name));
const weaponNames = new Set(PLAYER_WEAPONS.map((w) => w.name));
const equipmentNames = new Set(PLAYER_EQUIPMENT.map((e) => e.name));
const gearNames = new Set(PLAYER_GEAR.map((g) => g.name));

export function getClassByName(name: string): PlayerClass | undefined {
  return PLAYER_CLASSES.find((c) => c.name === name);
}

export function getClassActiveTier(className: string | undefined): ActionTier {
  const cls = getClassByName(className ?? "");
  return (cls as { activeTier?: ActionTier })?.activeTier ?? "support";
}

export function getClassActiveKind(className: string | undefined): ClassActiveKind | undefined {
  return (getClassByName(className ?? "") as { activeKind?: ClassActiveKind })?.activeKind;
}

export { classGrantsSecondWeapon, classGrantsDualGear } from "./base-upgrades-unlocks.js";

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

export function getEquipmentByName(name: string): PlayerEquipment | undefined {
  return PLAYER_EQUIPMENT.find((e) => e.name === name);
}

export function getGearByName(name: string): PlayerGear | undefined {
  return PLAYER_GEAR.find((g) => g.name === name);
}

export function getArmorSpeed(armorName: string | undefined): number {
  if (!armorName) return 4;
  return getArmorByName(armorName)?.speed ?? 4;
}

export function applyLoadoutToPlayer(
  player: Player,
  loadout: {
    className: string;
    armor: string;
    weapon: string;
    equipment?: string;
    gear?: string;
    weapon2?: string;
    gearArmor?: string;
    yadathanTower?: string;
  },
): void {
  player.class = loadout.className;
  player.armor = loadout.armor;
  player.weapon = loadout.weapon;
  player.equipment = loadout.equipment || undefined;
  player.gear = loadout.gear || undefined;
  player.gearArmor = loadout.gearArmor || undefined;
  player.weapon2 = loadout.weapon2 || undefined;
  player.speed = getArmorSpeed(loadout.armor);
  const armor = getArmorByName(loadout.armor);
  if (armor?.reversal?.charges != null) {
    player.reversalCharges = armor.reversal.charges;
  }
  if (player.equipmentUses === undefined) player.equipmentUses = 1;
  if (!player.counters) player.counters = {};
  if (isYadathanArmorName(loadout.armor) && loadout.yadathanTower) {
    player.yadathanTower = loadout.yadathanTower;
  } else if (!isYadathanArmorName(loadout.armor)) {
    player.yadathanTower = undefined;
  }
  applyGearPassivesOnLoadout(player);
  player.hp = normalizePlayerHp(player);
}

export function syncCharacterSheetWeaponsFromPlayer(
  sheet: CharacterSheet,
  player: Pick<Player, "characterSheetId" | "weapon" | "weapon2">,
): boolean {
  if (player.characterSheetId !== sheet.id) return false;
  const weapon = player.weapon ?? sheet.weapon;
  const weapon2 = player.weapon2;
  if (sheet.weapon === weapon && sheet.weapon2 === weapon2) return false;
  sheet.weapon = weapon;
  sheet.weapon2 = weapon2;
  sheet.updatedAt = new Date().toISOString();
  return true;
}

function normalizePlayerHp(player: Player): number {
  const maxHp = getClassMaxHp(player.class);
  const current = player.hp ?? maxHp;
  return Math.max(0, Math.min(current, maxHp));
}

export { getEffectSummaryFromData as getEffectSummary };

export function validateCharacterSheetRefs(
  fields: CharacterSheetLoadoutFields,
  constructedIds: readonly string[] = [],
  existing?: CharacterSheetLoadoutFields,
): string | null {
  if (fields.class !== undefined && !classNames.has(fields.class)) {
    return `Invalid class: ${fields.class}`;
  }
  if (fields.armor !== undefined && !armorNames.has(fields.armor)) {
    return `Invalid armor: ${fields.armor}`;
  }
  if (fields.weapon !== undefined && !weaponNames.has(fields.weapon)) {
    return `Invalid weapon: ${fields.weapon}`;
  }
  if (fields.equipment !== undefined && fields.equipment && !equipmentNames.has(fields.equipment)) {
    return `Invalid equipment: ${fields.equipment}`;
  }
  if (fields.gear !== undefined && fields.gear && !gearNames.has(fields.gear)) {
    return `Invalid gear: ${fields.gear}`;
  }
  if (fields.gearArmor !== undefined && fields.gearArmor && !gearNames.has(fields.gearArmor)) {
    return `Invalid gear: ${fields.gearArmor}`;
  }
  if (fields.weapon2 !== undefined && fields.weapon2 && !weaponNames.has(fields.weapon2)) {
    return `Invalid weapon: ${fields.weapon2}`;
  }
  const armor = fields.armor ?? existing?.armor;
  if (armor === YADATHAN_ARMOR_NAME) {
    const tower = fields.yadathanTower ?? existing?.yadathanTower;
    if (!tower || !isValidYadathanTowerName(tower)) {
      return "YADATHAN requires a tower selection";
    }
  }
  if (fields.yadathanTower !== undefined && fields.yadathanTower && !isValidYadathanTowerName(fields.yadathanTower)) {
    return `Invalid YADATHAN tower: ${fields.yadathanTower}`;
  }
  return validateCharacterSheetLoadout(fields, constructedIds, existing);
}
