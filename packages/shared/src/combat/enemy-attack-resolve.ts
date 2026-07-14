import type { PatternDirection } from "../pattern-data.js";
import { enemyLabel, playerLabel } from "../console.js";
import { buildBoardOccupancy } from "../game.js";
import { coordKey } from "../map.js";
import type { EffectStacks, Enemy, GameState, Player } from "../types.js";
import {
  applyDamageToEnemy,
  applyDamageToPlayer,
  collectEnemyPatternAttackTiles,
  enemyAttackNonPushEffects,
  enemyAttackPushDistance,
  enemyPatternAttackSpec,
  parseEnemyAttackPullDistance,
  resolveEnemyPatternOrigin,
  type ParsedEnemyAttack,
} from "./attack.js";
import { parseAndRollDamage } from "./damage.js";
import { applyEffectStacks } from "./effects.js";
import { trackCountdownKinds } from "./countdown.js";
import { applyPullToward } from "./pull.js";
import { applyPushFromOrigin } from "./push.js";
import { swarmGroupForEnemy } from "./swarm.js";

function applyStacks(
  state: GameState,
  unit: Player | Enemy,
  effects: string[],
): void {
  if (!effects.length) return;
  applyEffectStacks(unit as { effects?: EffectStacks; counters?: Record<string, number> }, effects);
  trackCountdownKinds(state, unit, effects);
}

export function applyPatternEnemyAttack(
  state: GameState,
  enemy: Enemy,
  parsed: ParsedEnemyAttack,
  direction: PatternDirection,
  opts?: { damage?: number; origin?: { x: number; y: number } },
): string {
  const spec = enemyPatternAttackSpec(parsed);
  if (!spec) {
    return `${enemyLabel(enemy)} attack (no pattern)`;
  }
  const origin = resolveEnemyPatternOrigin(enemy, spec.patternId, direction, opts?.origin);
  if (!origin) {
    return `${enemyLabel(enemy)} attack (select pattern origin)`;
  }

  const rolled =
    opts?.damage != null
      ? { total: opts.damage, detail: String(opts.damage) }
      : parseAndRollDamage(String(parsed.damage ?? 0));
  const damage = rolled.total;
  const pullDistance = parseEnemyAttackPullDistance(parsed.raw);

  const tiles = collectEnemyPatternAttackTiles(
    state,
    enemy,
    {
      ...spec,
      damage: String(damage),
    },
    direction,
    origin,
  );
  const occ = buildBoardOccupancy(state);
  const hitPlayers = new Set<string>();
  const hitEnemies = new Set<string>();
  const parts: string[] = [];
  const effectTokens = enemyAttackNonPushEffects(parsed);

  for (const tile of tiles) {
    const key = coordKey(tile.x, tile.y);
    const player = occ.playerByKey.get(key);
    if (player && !hitPlayers.has(player.id) && (player.hp ?? 0) > 0) {
      hitPlayers.add(player.id);
      applyDamageToPlayer(player, damage, state);
      applyStacks(state, player, effectTokens);
      let part = `${playerLabel(player)} ${rolled.detail}`;
      if (pullDistance != null && pullDistance > 0) {
        const pullMsg = applyPullToward(state, player, enemy.x, enemy.y, pullDistance, {
          kind: "player",
        });
        if (pullMsg) part += `, ${pullMsg}`;
      }
      parts.push(part);
    }
    const enemies = occ.enemiesByKey.get(key) ?? [];
    for (const target of enemies) {
      if (target.id === enemy.id) continue;
      const canon = swarmGroupForEnemy(state, target.id)?.canonicalId ?? target.id;
      if (hitEnemies.has(canon)) continue;
      if ((target.hp ?? 0) <= 0) continue;
      hitEnemies.add(canon);
      const hit = state.enemies.find((e) => e.id === canon) ?? target;
      applyDamageToEnemy(hit, damage, state);
      applyStacks(state, hit, effectTokens);
      let part = `${enemyLabel(hit)} ${rolled.detail}`;
      if (pullDistance != null && pullDistance > 0) {
        const pullMsg = applyPullToward(state, hit, enemy.x, enemy.y, pullDistance, {
          kind: "enemy",
        });
        if (pullMsg) part += `, ${pullMsg}`;
      }
      parts.push(part);
    }
  }

  const patternLabel = `${spec.patternId[0]!.toUpperCase()}${spec.patternId.slice(1)}:${spec.size}`;
  const base = `${enemyLabel(enemy)} ${patternLabel} (${rolled.detail} dmg)`;
  if (!parts.length) return `${base} (no targets)`;
  return `${base} → ${parts.join("; ")}`;
}

export function applySelectTargetEnemyAttack(
  state: GameState,
  enemy: Enemy,
  parsed: ParsedEnemyAttack,
  opts: {
    targetPlayerId?: string;
    targetEnemyId?: string;
    damage?: number;
  },
): string | null {
  const pushDistance = enemyAttackPushDistance(parsed);
  const effectTokens = enemyAttackNonPushEffects(parsed);

  let damageTotal: number | null = null;
  let damageDetail = "";
  if (parsed.damage != null) {
    const rolled =
      opts.damage != null
        ? { total: opts.damage, detail: String(opts.damage) }
        : parseAndRollDamage(String(parsed.damage));
    damageTotal = rolled.total;
    damageDetail = rolled.detail;
  } else if (opts.damage != null) {
    damageTotal = opts.damage;
    damageDetail = String(opts.damage);
  }

  if (opts.targetPlayerId) {
    const target = state.players.find((p) => p.id === opts.targetPlayerId);
    if (!target) return null;
    const parts: string[] = [];
    if (damageTotal != null) {
      applyDamageToPlayer(target, damageTotal, state);
      parts.push(`${damageDetail} dmg`);
    }
    applyStacks(state, target, effectTokens);
    if (pushDistance != null && pushDistance > 0) {
      const pushMsg = applyPushFromOrigin(state, target, enemy.x, enemy.y, pushDistance, {
        kind: "player",
        excludeEnemyId: enemy.id,
      });
      if (pushMsg) parts.push(pushMsg);
    }
    const suffix = parts.length ? ` for ${parts.join(", ")}` : "";
    return `${enemyLabel(enemy)} → ${playerLabel(target)}${suffix}`;
  }

  if (opts.targetEnemyId) {
    const target = state.enemies.find((e) => e.id === opts.targetEnemyId);
    if (!target) return null;
    const parts: string[] = [];
    if (damageTotal != null) {
      applyDamageToEnemy(target, damageTotal, state);
      parts.push(`${damageDetail} dmg`);
    }
    applyStacks(state, target, effectTokens);
    if (pushDistance != null && pushDistance > 0) {
      const pushMsg = applyPushFromOrigin(state, target, enemy.x, enemy.y, pushDistance, {
        kind: "enemy",
        excludeEnemyId: enemy.id,
      });
      if (pushMsg) parts.push(pushMsg);
    }
    const suffix = parts.length ? ` for ${parts.join(", ")}` : "";
    return `${enemyLabel(enemy)} → ${enemyLabel(target)}${suffix}`;
  }

  return null;
}
