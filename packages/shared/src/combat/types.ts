import type { PatternDirection } from "../pattern-data.js";

export const ACTION_TIERS = ["main", "support", "aux"] as const;
export type ActionTier = (typeof ACTION_TIERS)[number];

export type ActionBudget = {
  main: boolean;
  support: boolean;
  aux: boolean;
  movementRemaining: number;
  movementMax: number;
};

export type EffectStacks = Record<string, number>;

export type WeaponAttackSpec = {
  patternId: string;
  size: number;
  range?: number;
  width?: number;
  damage: string;
  effects?: string[];
};

export type StructuredArmorAction = {
  tier: "support";
  kind: "teleport_adjacent" | "push_recoil" | "assisted";
  push?: number;
};

export type AssistedActionKind =
  | "classActive"
  | "weaponActive"
  | "useEquipment"
  | "interact"
  | "enemyAttack"
  | "enemySpecial"
  | "reversal";

export type PendingAction = {
  id: string;
  actorPlayerId?: string;
  actorEnemyId?: string;
  kind: AssistedActionKind;
  label: string;
  detail?: string;
  targetEnemyIds?: string[];
  targetPlayerIds?: string[];
  direction?: PatternDirection;
  damage?: number;
  effects?: string[];
  createdAt: number;
};

export type PendingReaction = {
  playerId: string;
  sourceEnemyId?: string;
  trigger: string;
  label: string;
};

export type CombatState = {
  playerCountAtStart: number;
  pendingActions: PendingAction[];
  pendingReaction: PendingReaction | null;
  activeEnemyId: string | null;
};

export type PlayerAction =
  | { action: "attack"; direction: PatternDirection; damageRoll?: number; targetEnemyId?: string }
  | { action: "shove"; targetEnemyId?: string; targetPlayerId?: string }
  | { action: "sprint"; path: { x: number; y: number }[] }
  | { action: "weaponSwap" }
  | { action: "rez"; targetPlayerId: string }
  | { action: "armorAction"; targetEnemyId?: string; targetPlayerId?: string; landingX?: number; landingY?: number; push?: 1 | 2 | 3 }
  | { action: "classActive"; detail?: string; targetEnemyIds?: string[]; targetPlayerIds?: string[] }
  | { action: "weaponActive"; detail?: string; targetEnemyIds?: string[]; targetPlayerIds?: string[]; direction?: PatternDirection }
  | { action: "useEquipment"; detail?: string }
  | { action: "interact"; detail?: string };

export type GmEnemyAction =
  | { action: "move"; enemyId: string; path: { x: number; y: number }[] }
  | { action: "attack"; enemyId: string; attackIndex: number; direction?: PatternDirection; damage?: number; targetPlayerId?: string }
  | { action: "assisted"; enemyId: string; label: string; detail?: string; damage?: number; targetPlayerId?: string; effects?: string[] }
  | { action: "exhaust"; enemyId: string };

export type AssistedOutcome = {
  pendingId: string;
  damageByEnemyId?: Record<string, number>;
  damageByPlayerId?: Record<string, number>;
  effectsByEnemyId?: Record<string, string[]>;
  effectsByPlayerId?: Record<string, string[]>;
  healByPlayerId?: Record<string, number>;
  reject?: boolean;
};

export function createDefaultActionBudget(speed: number): ActionBudget {
  return {
    main: true,
    support: true,
    aux: true,
    movementRemaining: speed,
    movementMax: speed,
  };
}

export function createDefaultCombatState(playerCount: number): CombatState {
  return {
    playerCountAtStart: playerCount,
    pendingActions: [],
    pendingReaction: null,
    activeEnemyId: null,
  };
}
