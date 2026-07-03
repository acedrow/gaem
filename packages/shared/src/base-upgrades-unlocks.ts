import { getBaseUpgradeById, type BaseUpgradeOptions } from "./base-upgrades-data.js";

export type UnlockCategory = keyof BaseUpgradeOptions;

export type CampaignFeature =
  | "reversals"
  | "equipmentSlot"
  | "gearSlot"
  | "secondWeaponSlot"
  | "vehicles"
  | "offGridMunitions"
  | "haloUnits"
  | "limitBreak"
  | "roles"
  | "triumph"
  | "legendaryArms"
  | "crossClassDevelopment"
  | "preBattleGridManipulation";

export const STARTER_UNLOCKS: BaseUpgradeOptions = {
  weapons: [
    "Ten Thousand Year Reign Shattering Blade",
    "She Speaks The Language Of Kings",
    "Sethian Externalized Annihilation Cannon",
  ],
  armor: ["MALAKBEL", "KUSHIEL", "ASMODEL"],
  classes: ["HARPE", "KOPIS", "SHARUR"],
  equipment: [],
  gear: [],
  haloSystems: [],
};

const UPGRADE_FEATURES: Record<string, CampaignFeature[]> = {
  "ignorance-devouring-anchor": ["reversals"],
  "ancilia-tactical-production": ["equipmentSlot"],
  "pronoia-arms-modification": ["gearSlot"],
  "choic-spatial-manipulation": ["secondWeaponSlot"],
  "synthetic-spinther-manufacturing": ["vehicles"],
  "hebdomas-aerial-support": ["offGridMunitions"],
  "archontic-pneuma-engineering-bay": ["haloUnits"],
  "aponoia-expedited-enlightenment": ["limitBreak"],
  "syzygos-automated-adulation": ["roles"],
  "agnoia-triumph-chamber": ["triumph"],
  "eros-management-vault": ["legendaryArms"],
  "gnostic-synthesis-chamber": ["crossClassDevelopment"],
  "anoint-reality-manipulation": ["preBattleGridManipulation"],
};

const OPTION_KEYS = Object.keys(STARTER_UNLOCKS) as UnlockCategory[];

function emptyOptionSets(): Record<UnlockCategory, Set<string>> {
  return {
    weapons: new Set(),
    armor: new Set(),
    classes: new Set(),
    equipment: new Set(),
    gear: new Set(),
    haloSystems: new Set(),
  };
}

export function getUnlockedOptions(constructedIds: readonly string[]): BaseUpgradeOptions {
  const sets = emptyOptionSets();
  for (const key of OPTION_KEYS) {
    for (const name of STARTER_UNLOCKS[key]) sets[key].add(name);
  }
  for (const id of constructedIds) {
    const upgrade = getBaseUpgradeById(id);
    if (!upgrade) continue;
    for (const key of OPTION_KEYS) {
      for (const name of upgrade.options[key]) sets[key].add(name);
    }
  }
  return {
    weapons: [...sets.weapons],
    armor: [...sets.armor],
    classes: [...sets.classes],
    equipment: [...sets.equipment],
    gear: [...sets.gear],
    haloSystems: [...sets.haloSystems],
  };
}

export function getUnlockedOptionSets(
  constructedIds: readonly string[],
): Record<UnlockCategory, Set<string>> {
  const sets = emptyOptionSets();
  for (const key of OPTION_KEYS) {
    for (const name of STARTER_UNLOCKS[key]) sets[key].add(name);
  }
  for (const id of constructedIds) {
    const upgrade = getBaseUpgradeById(id);
    if (!upgrade) continue;
    for (const key of OPTION_KEYS) {
      for (const name of upgrade.options[key]) sets[key].add(name);
    }
  }
  return sets;
}

export function isOptionUnlocked(
  category: UnlockCategory,
  name: string,
  constructedIds: readonly string[],
): boolean {
  return getUnlockedOptionSets(constructedIds)[category].has(name);
}

export function getUnlockedFeatures(constructedIds: readonly string[]): Set<CampaignFeature> {
  const features = new Set<CampaignFeature>();
  for (const id of constructedIds) {
    for (const feature of UPGRADE_FEATURES[id] ?? []) features.add(feature);
  }
  return features;
}

export function isCampaignFeatureUnlocked(
  feature: CampaignFeature,
  constructedIds: readonly string[],
): boolean {
  return getUnlockedFeatures(constructedIds).has(feature);
}

export type CharacterSheetLoadoutFields = {
  class?: string;
  armor?: string;
  weapon?: string;
  equipment?: string;
  gear?: string;
  weapon2?: string;
};

export function validateCharacterSheetLoadout(
  fields: CharacterSheetLoadoutFields,
  constructedIds: readonly string[],
  existing?: CharacterSheetLoadoutFields,
): string | null {
  const unlocked = getUnlockedOptionSets(constructedIds);
  const features = getUnlockedFeatures(constructedIds);

  if (fields.class !== undefined) {
    if (!unlocked.classes.has(fields.class) && fields.class !== existing?.class) {
      return `Class not unlocked: ${fields.class}`;
    }
  }
  if (fields.armor !== undefined) {
    if (!unlocked.armor.has(fields.armor) && fields.armor !== existing?.armor) {
      return `Armor not unlocked: ${fields.armor}`;
    }
  }
  if (fields.weapon !== undefined) {
    if (!unlocked.weapons.has(fields.weapon) && fields.weapon !== existing?.weapon) {
      return `Weapon not unlocked: ${fields.weapon}`;
    }
  }
  if (fields.equipment !== undefined) {
    if (fields.equipment && !features.has("equipmentSlot")) {
      return "Equipment slot not unlocked";
    }
    if (
      fields.equipment &&
      !unlocked.equipment.has(fields.equipment) &&
      fields.equipment !== existing?.equipment
    ) {
      return `Equipment not unlocked: ${fields.equipment}`;
    }
  }
  if (fields.gear !== undefined) {
    if (fields.gear && !features.has("gearSlot")) {
      return "Gear slot not unlocked";
    }
    if (fields.gear && !unlocked.gear.has(fields.gear) && fields.gear !== existing?.gear) {
      return `Gear not unlocked: ${fields.gear}`;
    }
  }
  if (fields.weapon2 !== undefined) {
    if (fields.weapon2 && !features.has("secondWeaponSlot")) {
      return "Second weapon slot not unlocked";
    }
    if (
      fields.weapon2 &&
      !unlocked.weapons.has(fields.weapon2) &&
      fields.weapon2 !== existing?.weapon2
    ) {
      return `Weapon not unlocked: ${fields.weapon2}`;
    }
  }

  return null;
}
