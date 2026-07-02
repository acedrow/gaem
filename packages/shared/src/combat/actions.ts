import type { ActionBudget, ActionTier } from "./types.js";
import type { Player } from "../types.js";

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
