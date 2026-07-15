import type { Enemy, GameState, Player } from "../types.js";
import { enemyLabel, playerLabel } from "../console.js";
import { getEnemyAttack } from "../enemy-data.js";
import { applyGmForceMove, validateGmForceMove } from "../game.js";
import {
  applyDamageToEnemy,
  applyDamageToPlayer,
  enemyDirectAttackTargetEnemyIds,
  enemyDirectAttackTargetPlayerIds,
  enemyPatternOrigins,
} from "./attack.js";
import { applyPatternEnemyAttack } from "./enemy-attack-resolve.js";
import { stainwalkKind, tileIsStained } from "./stainwalk.js";
import type { EnemyAttackSpec } from "./types.js";
import type { PatternDirection } from "../pattern-data.js";

export function isGorgenaut(enemy: Pick<Enemy, "name">): boolean {
  return stainwalkKind(enemy) === "gorgenaut";
}

export { enemyAttackNeedsStainTeleport } from "./attack.js";

const GORGENAUT_CONE_SPEC: EnemyAttackSpec = {
  targeting: "pattern",
  patternId: "cone",
  size: 3,
  damage: "5",
  effects: ["Pull:1"],
};

const STAIN_TELEPORT_SPEC: EnemyAttackSpec = {
  targeting: "select",
  damage: "10",
  adjacent: true,
  specialId: "stain-teleport",
};

export function applyGorgenautConeAttack(
  state: GameState,
  enemy: Enemy,
  direction: PatternDirection,
  damage: number,
): string {
  const spec = getEnemyAttack(enemy.name, 0)?.attack ?? GORGENAUT_CONE_SPEC;
  const origins = enemyPatternOrigins(enemy, direction, spec.patternId ?? "cone");
  return applyPatternEnemyAttack(state, enemy, spec, direction, {
    damage,
    origin: origins[0],
  });
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
  attackSpec?: EnemyAttackSpec,
): string | null {
  const spec = attackSpec ?? STAIN_TELEPORT_SPEC;
  if (opts.targetPlayerId) {
    const valid = enemyDirectAttackTargetPlayerIds(state, enemy.id, spec);
    if (!valid.includes(opts.targetPlayerId)) return "Target out of range";
  } else if (opts.targetEnemyId) {
    const valid = enemyDirectAttackTargetEnemyIds(state, enemy.id, spec);
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
