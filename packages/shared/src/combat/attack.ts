import type { PatternDirection } from "../pattern-data.js";
import { fixedPatternTilesInBounds } from "../patterns.js";
import { buildBoardOccupancy } from "../game.js";
import { coordKey } from "../map.js";
import type { Enemy, GameState, Player } from "../types.js";
import { getWeaponByName } from "../player-data.js";
import type { WeaponAttackSpec } from "./types.js";
import { applyBleedBonus, applyEffectStacks } from "./effects.js";
import { parseAndRollDamage } from "./damage.js";
import { clampHp, getEnemyMaxHp, getPlayerMaxHp } from "../game.js";

export type AttackTarget = {
  enemyId: string;
  x: number;
  y: number;
};

export function manhattanDistance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function enemiesInRange(
  state: GameState,
  origin: { x: number; y: number },
  range: number,
): AttackTarget[] {
  return state.enemies
    .filter((e) => {
      const d = manhattanDistance(origin, e);
      return d > 0 && d <= range;
    })
    .map((e) => ({ enemyId: e.id, x: e.x, y: e.y }));
}

export function getWeaponAttackSpec(weaponName: string | undefined): WeaponAttackSpec | null {
  if (!weaponName) return null;
  const weapon = getWeaponByName(weaponName);
  if (!weapon?.attack) return null;
  return weapon.attack as WeaponAttackSpec;
}

export function collectAttackTiles(
  state: GameState,
  origin: { x: number; y: number },
  spec: WeaponAttackSpec,
  direction: PatternDirection,
): { x: number; y: number }[] {
  if (spec.patternId === "range" && spec.range) {
    return [];
  }
  return fixedPatternTilesInBounds(
    spec.patternId,
    origin,
    spec.size,
    direction,
    state.width,
    state.height,
    spec.range || spec.width
      ? { modifiers: { range: spec.range ?? 0, width: spec.width ?? 1, recoil: 0 } }
      : undefined,
  );
}

export function enemiesInTiles(state: GameState, tiles: { x: number; y: number }[]): AttackTarget[] {
  const occ = buildBoardOccupancy(state);
  const seen = new Set<string>();
  const targets: AttackTarget[] = [];
  for (const tile of tiles) {
    const enemy = occ.enemyByKey.get(coordKey(tile.x, tile.y));
    if (enemy && !seen.has(enemy.id)) {
      seen.add(enemy.id);
      targets.push({ enemyId: enemy.id, x: tile.x, y: tile.y });
    }
  }
  return targets;
}

export function resolveAttackDamage(
  spec: WeaponAttackSpec,
  damageRoll?: number,
): { total: number; detail: string } {
  if (damageRoll !== undefined && Number.isFinite(damageRoll)) {
    return { total: damageRoll, detail: String(damageRoll) };
  }
  return parseAndRollDamage(spec.damage);
}

export function applyDamageToEnemy(enemy: Enemy, damage: number): number {
  const maxHp = getEnemyMaxHp(enemy);
  const before = enemy.hp ?? maxHp;
  const adjusted = applyBleedBonus(damage, enemy.effects);
  enemy.hp = clampHp(before - adjusted, maxHp);
  return adjusted;
}

export function applyDamageToPlayer(player: Player, damage: number): number {
  const maxHp = getPlayerMaxHp(player);
  const before = player.hp ?? maxHp;
  const adjusted = applyBleedBonus(damage, player.effects);
  player.hp = clampHp(before - adjusted, maxHp);
  return adjusted;
}

export function applyAttackToEnemies(
  state: GameState,
  spec: WeaponAttackSpec,
  origin: { x: number; y: number },
  direction: PatternDirection,
  damageRoll?: number,
): { damage: number; detail: string; targets: AttackTarget[]; effects: string[] } {
  const tiles = collectAttackTiles(state, origin, spec, direction);
  const targets = enemiesInTiles(state, tiles);
  const { total, detail } = resolveAttackDamage(spec, damageRoll);
  const effects = spec.effects ?? [];
  for (const target of targets) {
    const enemy = state.enemies.find((e) => e.id === target.enemyId);
    if (!enemy) continue;
    applyDamageToEnemy(enemy, total);
    applyEffectStacks(enemy, effects);
  }
  return { damage: total, detail, targets, effects };
}

export type ParsedEnemyAttack = {
  patternId?: string;
  size?: number;
  range?: number;
  width?: number;
  damage?: number;
  effects?: string[];
  raw: string;
};

export function parseEnemyAttackString(text: string): ParsedEnemyAttack {
  const result: ParsedEnemyAttack = { raw: text };
  const line = text.match(/Line:(\d+)/i);
  if (line) {
    result.patternId = "line";
    result.size = Number(line[1]);
  }
  const burst = text.match(/Burst:(\d+)/i);
  if (burst) {
    result.patternId = "burst";
    result.size = Number(burst[1]);
  }
  const blast = text.match(/Blast:(\d+)/i);
  if (blast) {
    result.patternId = "blast";
    result.size = Number(blast[1]);
  }
  const cone = text.match(/Cone:(\d+)/i);
  if (cone) {
    result.patternId = "cone";
    result.size = Number(cone[1]);
  }
  const range = text.match(/Range:(\d+)/i);
  if (range) result.range = Number(range[1]);
  const dmg = text.match(/deal\s+(\d+)\s+damage/i);
  if (dmg) result.damage = Number(dmg[1]);
  const effects: string[] = [];
  for (const m of text.matchAll(/(Bleed|Slow|Blazing|Pin|Push|Shock):(\d+)/gi)) {
    effects.push(`${m[1]}:${m[2]}`);
  }
  if (effects.length) result.effects = effects;
  return result;
}
