import type { PatternDirection } from "../pattern-data.js";

export const ACTION_TIERS = ["main", "support", "aux"] as const;
export type ActionTier = (typeof ACTION_TIERS)[number];

export type ActionBudget = {
  main: boolean;
  support: boolean;
  aux: boolean;
  movementRemaining: number;
  movementMax: number;
  sprintRemaining?: number;
  sprintMax?: number;
};

export type EffectStacks = Record<string, number>;

export type RelativeTile = readonly [number, number];

export type WeaponPatternLevel = {
  label: string;
  damage: string;
  tiles: RelativeTile[];
};

export type WeaponBombPattern = {
  name: string;
  damage: string;
  range?: string;
  description?: string;
  tiles: RelativeTile[];
  anchorTile?: RelativeTile;
  healTiles?: RelativeTile[];
  boundsTiles?: RelativeTile[];
  heal?: boolean;
  effects?: string[];
};

export type AttackRangeSpan = { min: number; max: number };

export type WeaponAttackSpec = {
  patternId?: string;
  tiles?: RelativeTile[];
  levels?: WeaponPatternLevel[];
  bombs?: WeaponBombPattern[];
  rangeTargets?: { range: number; maxTargets: number };
  rangeSpan?: AttackRangeSpan;
  anchorTile?: RelativeTile;
  size?: number;
  range?: number;
  width?: number;
  damage: string;
  effects?: string[];
  heal?: boolean;
};

export type StructuredArmorAction =
  | { tier: "support"; kind: "teleport_adjacent" }
  | { tier: "support"; kind: "push_recoil"; push?: number }
  | { tier: "support"; kind: "place_tower"; range: number }
  | { tier: "support"; kind: "assisted" };

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
  incomingDamage?: number;
};

export type CombatState = {
  playerCountAtStart: number;
  pendingActions: PendingAction[];
  pendingReaction: PendingReaction | null;
  activeEnemyId: string | null;
};

export type PlayerAction =
  | {
      action: "attack";
      direction: PatternDirection;
      anchorX?: number;
      anchorY?: number;
      damageRoll?: number;
      targetEnemyId?: string;
      targetEnemyIds?: string[];
      weaponName?: string;
      useBreaker?: boolean;
    }
  | { action: "shove"; targetEnemyId?: string; targetPlayerId?: string }
  | { action: "sprint" }
  | { action: "sprintMove"; x: number; y: number }
  | { action: "sprintCancel" }
  | { action: "weaponSwap" }
  | { action: "selectWeaponVariant"; index: number }
  | { action: "rez"; targetPlayerId: string }
  | {
      action: "armorAction";
      targetEnemyId?: string;
      targetPlayerId?: string;
      landingX?: number;
      landingY?: number;
      push?: 1 | 2 | 3;
      x?: number;
      y?: number;
    }
  | { action: "towerTeleport"; x: number; y: number; keraunoTargetEnemyId?: string }
  | { action: "kataptyEndTurn"; targetEnemyIds?: string[] }
  | { action: "classActive"; detail?: string; targetEnemyIds?: string[]; targetPlayerIds?: string[] }
  | {
      action: "weaponActive";
      detail?: string;
      targetEnemyIds?: string[];
      targetPlayerIds?: string[];
      direction?: PatternDirection;
      omnistrike?: {
        bombIndices: [number, number];
        anchors: [{ x: number; y: number }, { x: number; y: number }];
      };
      warhook?: {
        targetEnemyId?: string;
        targetX: number;
        targetY: number;
        landingX: number;
        landingY: number;
        damageRoll?: number;
      };
    }
  | { action: "useEquipment"; detail?: string }
  | { action: "interact"; detail?: string }
  | { action: "commitHaste"; tier: ActionTier };

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
