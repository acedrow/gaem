import type { ActionBudget, ActionTier } from "./types.js";
import type { Player } from "../types.js";
import { removeEffectStacks } from "./effects.js";

export function hasteStacks(player: Pick<Player, "effects">): number {
  return player.effects?.Haste ?? 0;
}

export function actionTierLabel(tier: ActionTier): string {
  if (tier === "main") return "Main";
  if (tier === "support") return "Support";
  return "Aux";
}

export function spendActionTier(budget: ActionBudget | undefined, tier: ActionTier): boolean {
  if (!budget) return false;
  if (tier === "main" && !budget.main) return false;
  if (tier === "support" && !budget.support) return false;
  if (tier === "aux" && !budget.aux) return false;
  if (tier === "main") budget.main = false;
  if (tier === "support") budget.support = false;
  if (tier === "aux") budget.aux = false;
  return true;
}

export function canSpendActionTier(budget: ActionBudget | undefined, tier: ActionTier): boolean {
  if (!budget) return false;
  if (tier === "main") return budget.main;
  if (tier === "support") return budget.support;
  return budget.aux;
}

export function spendMovement(budget: ActionBudget | undefined, cost: number): boolean {
  if (!budget || budget.movementRemaining < cost) return false;
  budget.movementRemaining -= cost;
  return true;
}

export function hasShockBlockingMain(player: Player): boolean {
  return (player.effects?.Shock ?? 0) > 0 && !canSpendActionTier(player.actionBudget, "main");
}

export function effectiveActionBlocked(player: Player, tier: ActionTier): boolean {
  const shock = player.effects?.Shock ?? 0;
  if (shock <= 0) return false;
  if (tier === "aux" && shock >= 1) return true;
  if (tier === "support" && shock >= 2) return true;
  if (tier === "main" && shock >= 3) return true;
  return false;
}

export function canUseActionTier(player: Player, tier: ActionTier): boolean {
  if (effectiveActionBlocked(player, tier)) return false;
  if (canSpendActionTier(player.actionBudget, tier)) return true;
  return player.hasteActionTier === tier && hasteStacks(player) > 0;
}

export function canCommitHasteForTier(player: Player, tier: ActionTier): boolean {
  if (hasteStacks(player) <= 0) return false;
  if (player.hasteActionTier) return false;
  if (canSpendActionTier(player.actionBudget, tier)) return false;
  if (effectiveActionBlocked(player, tier)) return false;
  return true;
}

export function actionTierBlockedReason(player: Player, tier: ActionTier): string | null {
  if (effectiveActionBlocked(player, tier)) {
    if (tier === "main") return "Shock — cannot use Main";
    if (tier === "aux") return "Shock — cannot use Aux";
    return "Shock — cannot use Support";
  }
  if (canSpendActionTier(player.actionBudget, tier)) return null;
  if (player.hasteActionTier === tier && hasteStacks(player) > 0) return null;
  if (tier === "main") return "Main action spent";
  if (tier === "support") return "Support action spent";
  return "Aux action spent";
}

export function validateCommitHaste(player: Player, tier: ActionTier): string | null {
  if (canCommitHasteForTier(player, tier)) return null;
  if (hasteStacks(player) <= 0) return "No Haste";
  if (player.hasteActionTier) return "Haste already committed";
  if (canSpendActionTier(player.actionBudget, tier)) return "Action not spent";
  if (effectiveActionBlocked(player, tier)) {
    if (tier === "main") return "Shock — cannot use Main";
    if (tier === "aux") return "Shock — cannot use Aux";
    return "Shock — cannot use Support";
  }
  return "Cannot commit Haste";
}

export function applyCommitHaste(player: Player, tier: ActionTier): string {
  player.hasteActionTier = tier;
  return `committed Haste for an additional ${actionTierLabel(tier)} action`;
}

export function spendActionTierOrHaste(player: Player, tier: ActionTier): boolean {
  if (spendActionTier(player.actionBudget, tier)) return true;
  if (player.hasteActionTier !== tier || hasteStacks(player) <= 0) return false;
  removeEffectStacks(player, ["Haste:1"]);
  delete player.hasteActionTier;
  return true;
}
