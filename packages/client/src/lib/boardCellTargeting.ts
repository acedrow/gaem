import type { BoardActionMode, OmnistrikeStep } from "../composables/useBoardActionMode.js";

export type BoardTargetingContext = {
  omnistrikeStep?: OmnistrikeStep;
};

export const BOARD_CELL_TARGETING_MODES = [
  "move",
  "attack",
  "omnistrike",
  "warhook",
  "shove",
  "sprint",
  "armorTeleport",
  "armorPush",
  "armorPlaceTower",
  "towerTeleport",
  "kataptyPick",
  "rez",
  "kopisMark",
  "sharurAttractor",
  "hephaestusSynesis",
  "hephaestusRestore",
  "harpeTrap",
  "varunastraBorrow",
  "assistedLaunch",
] as const satisfies readonly Exclude<BoardActionMode, null | "gmEnemyAttack">[];

const targetingModes = new Set<BoardActionMode>(BOARD_CELL_TARGETING_MODES);

export function routesTokenClickToCellTargeting(
  mode: BoardActionMode,
  ctx: BoardTargetingContext = {},
): boolean {
  if (!mode || mode === "gmEnemyAttack") return false;
  if (mode === "omnistrike" && ctx.omnistrikeStep === "selectBombs") return false;
  return targetingModes.has(mode);
}
