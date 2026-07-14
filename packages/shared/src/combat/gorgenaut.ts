import type { Enemy, GameState, Player } from "../types.js";
import { enemyLabel, playerLabel } from "../console.js";
import { applyGmForceMove, validateGmForceMove } from "../game.js";
import {
  applyDamageToEnemy,
  applyDamageToPlayer,
  enemyDirectAttackTargetEnemyIds,
  enemyDirectAttackTargetPlayerIds,
  parseEnemyAttackString,
} from "./attack.js";
import { applyPatternEnemyAttack } from "./enemy-attack-resolve.js";
import { stainwalkKind, tileIsStained } from "./stainwalk.js";
import type { PatternDirection } from "../pattern-data.js";

export function isGorgenaut(enemy: Pick<Enemy, "name">): boolean {
  return stainwalkKind(enemy) === "gorgenaut";
}

export { enemyAttackNeedsStainTeleport } from "./attack.js";

export function applyGorgenautConeAttack(
  state: GameState,
  enemy: Enemy,
  direction: PatternDirection,
  damage: number,
): string {
  const parsed = parseEnemyAttackString(
    "Cone:3. Deal 5 damage and pull any unit 1 space towards RETIARIUS.",
  );
  return applyPatternEnemyAttack(state, enemy, parsed, direction, { damage });
}

export function validateGorgenautStainTeleport(
  state: GameState,
  enemy: Enemy,
  opts: {
    targetPlayerId?: string;
    targetEnemyId?: string;
    destX?: number;
    destY?: number;
  },
): string | null {
  const parsed = parseEnemyAttackString(
    "Deal 10 damage to an adjacent unit. Move that unit to any stained square.",
  );
  if (opts.targetPlayerId) {
    const valid = enemyDirectAttackTargetPlayerIds(state, enemy.id, parsed);
    if (!valid.includes(opts.targetPlayerId)) return "Target out of range";
  } else if (opts.targetEnemyId) {
    const valid = enemyDirectAttackTargetEnemyIds(state, enemy.id, parsed);
    if (!valid.includes(opts.targetEnemyId)) return "Target out of range";
  } else {
    return "Select target";
  }
  if (opts.destX == null || opts.destY == null) return "Select stained destination";
  if (!tileIsStained(state, opts.destX, opts.destY)) return "Destination must be stained";

  if (opts.targetPlayerId) {
    return validateGmForceMove(
      state,
      { kind: "player", id: opts.targetPlayerId },
      opts.destX,
      opts.destY,
    );
  }
  return validateGmForceMove(
    state,
    { kind: "enemy", id: opts.targetEnemyId! },
    opts.destX,
    opts.destY,
  );
}

export function applyGorgenautStainTeleport(
  state: GameState,
  enemy: Enemy,
  opts: {
    targetPlayerId?: string;
    targetEnemyId?: string;
    destX: number;
    destY: number;
    damage: number;
  },
): string {
  if (opts.targetPlayerId) {
    const target = state.players.find((p) => p.id === opts.targetPlayerId) as Player;
    applyDamageToPlayer(target, opts.damage, state);
    applyGmForceMove(state, { kind: "player", id: target.id }, opts.destX, opts.destY);
    return `${enemyLabel(enemy)} → ${playerLabel(target)} for ${opts.damage}, moved to (${opts.destX}, ${opts.destY})`;
  }
  const target = state.enemies.find((e) => e.id === opts.targetEnemyId)!;
  applyDamageToEnemy(target, opts.damage, state);
  applyGmForceMove(state, { kind: "enemy", id: target.id }, opts.destX, opts.destY);
  return `${enemyLabel(enemy)} → ${enemyLabel(target)} for ${opts.damage}, moved to (${opts.destX}, ${opts.destY})`;
}
