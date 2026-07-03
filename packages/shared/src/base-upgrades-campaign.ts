import {
  BASE_UPGRADES,
  getBaseUpgradeById,
  type BaseUpgradeCost,
} from "./base-upgrades-data.js";
import { isCampaignFeatureUnlocked } from "./base-upgrades-unlocks.js";
import type { BaseCampaignAction, GameState, PartyResourceKey, PartyResources } from "./types.js";

const RESOURCE_LABELS: Record<PartyResourceKey, string> = {
  hellsteel: "Hellsteel",
  soulfire: "Soulfire",
  brimstone: "Brimstone",
};

export function defaultPartyResources(): PartyResources {
  return { hellsteel: 0, soulfire: 0, brimstone: 0 };
}

export function ensureCampaignState(state: GameState): void {
  if (!state.partyResources) state.partyResources = defaultPartyResources();
  if (!state.constructedBaseUpgrades) state.constructedBaseUpgrades = [];
}

export function canAffordCost(resources: PartyResources, cost: BaseUpgradeCost): boolean {
  for (const key of Object.keys(cost) as PartyResourceKey[]) {
    const amount = cost[key];
    if (amount != null && amount > 0 && (resources[key] ?? 0) < amount) return false;
  }
  return true;
}

function applyCost(resources: PartyResources, cost: BaseUpgradeCost): void {
  for (const key of Object.keys(cost) as PartyResourceKey[]) {
    const amount = cost[key];
    if (amount != null && amount > 0) resources[key] -= amount;
  }
}

function refundCost(resources: PartyResources, cost: BaseUpgradeCost): void {
  for (const key of Object.keys(cost) as PartyResourceKey[]) {
    const amount = cost[key];
    if (amount != null && amount > 0) resources[key] += amount;
  }
}

export function formatCostDelta(cost: BaseUpgradeCost, sign: "+" | "−"): string {
  const parts: string[] = [];
  for (const key of ["hellsteel", "soulfire", "brimstone"] as PartyResourceKey[]) {
    const amount = cost[key];
    if (amount != null && amount > 0) parts.push(`${sign}${amount} ${RESOURCE_LABELS[key]}`);
  }
  return parts.join(", ");
}

function mergeCost(into: BaseUpgradeCost, add: BaseUpgradeCost): void {
  for (const key of ["hellsteel", "soulfire", "brimstone"] as PartyResourceKey[]) {
    const amount = add[key];
    if (amount != null && amount > 0) into[key] = (into[key] ?? 0) + amount;
  }
}

function totalConstructCost(ids: string[]): BaseUpgradeCost {
  const total: BaseUpgradeCost = {};
  for (const id of ids) {
    const upgrade = getBaseUpgradeById(id);
    if (upgrade) mergeCost(total, upgrade.cost);
  }
  return total;
}

function collectMissingPrereqs(constructedSet: Set<string>, upgradeId: string, into: Set<string>) {
  const upgrade = getBaseUpgradeById(upgradeId);
  if (!upgrade) return;
  for (const prereqId of upgrade.prerequisites) {
    if (constructedSet.has(prereqId)) continue;
    into.add(prereqId);
    collectMissingPrereqs(constructedSet, prereqId, into);
  }
}

function topoSortUpgradeIds(ids: Set<string>): string[] | null {
  const order: string[] = [];
  const remaining = new Set(ids);
  while (remaining.size > 0) {
    let picked: string | null = null;
    for (const id of remaining) {
      const upgrade = getBaseUpgradeById(id);
      if (!upgrade) return null;
      if (upgrade.prerequisites.every((p) => !remaining.has(p))) {
        picked = id;
        break;
      }
    }
    if (!picked) return null;
    order.push(picked);
    remaining.delete(picked);
  }
  return order;
}

export function planConstructUpgrade(
  constructedIds: readonly string[],
  upgradeId: string,
): string[] | null {
  if (!getBaseUpgradeById(upgradeId)) return null;
  const constructedSet = new Set(constructedIds);
  if (constructedSet.has(upgradeId)) return null;

  const prereqsToBuild = new Set<string>();
  collectMissingPrereqs(constructedSet, upgradeId, prereqsToBuild);
  const prereqOrder = topoSortUpgradeIds(prereqsToBuild);
  if (!prereqOrder) return null;
  return [...prereqOrder, upgradeId];
}

export function canAffordUpgradeConstruction(
  resources: PartyResources,
  constructedIds: readonly string[],
  upgradeId: string,
): boolean {
  const plan = planConstructUpgrade(constructedIds, upgradeId);
  if (!plan) return false;
  return canAffordCost(resources, totalConstructCost(plan));
}

function getDependentConstructedIds(constructedIds: Set<string>, rootId: string): string[] {
  const toRemove = new Set<string>([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const upgrade of BASE_UPGRADES) {
      if (!constructedIds.has(upgrade.id) || toRemove.has(upgrade.id)) continue;
      if (upgrade.prerequisites.some((p) => toRemove.has(p))) {
        toRemove.add(upgrade.id);
        changed = true;
      }
    }
  }

  const order: string[] = [];
  const remaining = new Set(toRemove);
  while (remaining.size > 0) {
    let picked: string | null = null;
    for (const id of remaining) {
      const hasDependentStillRemaining = [...remaining].some(
        (otherId) => otherId !== id && getBaseUpgradeById(otherId)!.prerequisites.includes(id),
      );
      if (!hasDependentStillRemaining) {
        picked = id;
        break;
      }
    }
    if (!picked) {
      order.push(...remaining);
      break;
    }
    order.push(picked);
    remaining.delete(picked);
  }
  return order;
}

export function validateBaseCampaignAction(state: GameState, action: BaseCampaignAction): string | null {
  ensureCampaignState(state);
  const resources = state.partyResources!;
  const constructed = state.constructedBaseUpgrades!;
  const constructedSet = new Set(constructed);

  switch (action.kind) {
    case "construct": {
      const upgrade = getBaseUpgradeById(action.upgradeId);
      if (!upgrade) return "Unknown upgrade";
      if (constructedSet.has(action.upgradeId)) return "Already constructed";
      const plan = planConstructUpgrade(constructed, action.upgradeId);
      if (!plan) return "Unknown upgrade";
      if (!canAffordCost(resources, totalConstructCost(plan))) return "Insufficient resources";
      return null;
    }
    case "demolish": {
      const upgrade = getBaseUpgradeById(action.upgradeId);
      if (!upgrade) return "Unknown upgrade";
      if (!constructedSet.has(action.upgradeId)) return "Not constructed";
      return null;
    }
    case "adjustResource": {
      const next = resources[action.resource] + action.delta;
      if (next < 0) return "Insufficient resources";
      return null;
    }
  }
}

export function applyBaseCampaignAction(state: GameState, action: BaseCampaignAction): string {
  ensureCampaignState(state);
  const resources = state.partyResources!;
  const constructed = state.constructedBaseUpgrades!;

  switch (action.kind) {
    case "construct": {
      const plan = planConstructUpgrade(constructed, action.upgradeId)!;
      const parts: string[] = [];
      for (let i = 0; i < plan.length; i++) {
        const id = plan[i]!;
        const upgrade = getBaseUpgradeById(id)!;
        applyCost(resources, upgrade.cost);
        constructed.push(id);
        const costStr = formatCostDelta(upgrade.cost, "−");
        const prefix = i === 0 ? "Constructed" : "also constructed";
        parts.push(`${prefix} ${upgrade.name}${costStr ? ` (${costStr})` : ""}`);
      }
      return parts.join("; ");
    }
    case "demolish": {
      const constructedSet = new Set(constructed);
      const toRemove = getDependentConstructedIds(constructedSet, action.upgradeId);
      const logOrder = [action.upgradeId, ...toRemove.filter((id) => id !== action.upgradeId)];
      for (const id of toRemove) {
        const upgrade = getBaseUpgradeById(id)!;
        refundCost(resources, upgrade.cost);
        const idx = constructed.indexOf(id);
        if (idx >= 0) constructed.splice(idx, 1);
      }
      const parts: string[] = [];
      for (const id of logOrder) {
        const upgrade = getBaseUpgradeById(id)!;
        const costStr = formatCostDelta(upgrade.cost, "+");
        const prefix = id === action.upgradeId ? "Demolished" : "also demolished";
        parts.push(`${prefix} ${upgrade.name}${costStr ? ` (${costStr})` : ""}`);
      }
      if (!isCampaignFeatureUnlocked("reversals", constructed) && state.combat) {
        state.combat.pendingReaction = null;
      }
      return parts.join("; ");
    }
    case "adjustResource": {
      resources[action.resource] += action.delta;
      const sign = action.delta >= 0 ? "+" : "";
      return `${RESOURCE_LABELS[action.resource]} ${sign}${action.delta} (party stores)`;
    }
  }
}
