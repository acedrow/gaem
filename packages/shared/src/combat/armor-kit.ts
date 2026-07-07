export const MALAKBEL_ARMOR_NAME = "MALAKBEL";
export const KUSHIEL_ARMOR_NAME = "KUSHIEL";
export const ASMODEL_ARMOR_NAME = "ASMODEL";
export const MURIEL_ARMOR_NAME = "MURIEL";

export function isMalakbelArmorName(name: string | undefined): boolean {
  return name === MALAKBEL_ARMOR_NAME;
}

export function isAsmodelArmorName(name: string | undefined): boolean {
  return name === ASMODEL_ARMOR_NAME;
}
