import baseUpgradesJson from "./data/rules/base-upgrades.json" with { type: "json" };

export type BaseUpgradeCost = {
  hellsteel?: number;
  soulfire?: number;
  brimstone?: number;
};

export type BaseUpgradeOptions = {
  weapons: string[];
  armor: string[];
  classes: string[];
  equipment: string[];
  gear: string[];
  haloSystems: string[];
};

export type BaseUpgrade = {
  id: string;
  name: string;
  flavor: string;
  cost: BaseUpgradeCost;
  prerequisites: string[];
  primaryUnlock: string;
  options: BaseUpgradeOptions;
  layout: { x: number; y: number };
};

export const BASE_UPGRADES = baseUpgradesJson as BaseUpgrade[];

const byId = new Map(BASE_UPGRADES.map((u) => [u.id, u]));

export function getBaseUpgradeById(id: string): BaseUpgrade | undefined {
  return byId.get(id);
}

export const BASE_UPGRADE_CARD_WIDTH = 280;
export const BASE_UPGRADE_CARD_HEIGHT = 320;
