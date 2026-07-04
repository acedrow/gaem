import type { PatternDirection } from "../pattern-data.js";
import { PATTERN_DIRECTIONS } from "../pattern-data.js";
import { fixedPatternTilesInBounds } from "../patterns.js";
import {
  bespokeTilesInBounds,
  parseAttackRangeSpan,
  patternOriginFromAnchor,
  usesAnchoredPatternPlacement,
} from "../weapon-patterns.js";
import { buildBoardOccupancy } from "../game.js";
import { coordKey } from "../map.js";
import type { Enemy, GameState, Player } from "../types.js";
import { getWeaponByName } from "../player-data.js";
import type { WeaponAttackSpec } from "./types.js";
import type { AttackRangeSpan } from "./types.js";
import { applyBleedBonus, applyEffectStacks, setTileEffect } from "./effects.js";
import { tileAt } from "../map.js";
import { parseAndRollDamage } from "./damage.js";
import { clampHp, getEnemyMaxHp, getPlayerMaxHp } from "../game.js";

export type AttackTarget = {
  enemyId: string;
  x: number;
  y: number;
};

export function resolveRangeAttackTargetIds(action: {
  targetEnemyId?: string;
  targetEnemyIds?: string[];
}): string[] {
  const ids = action.targetEnemyIds?.length
    ? action.targetEnemyIds
    : action.targetEnemyId
      ? [action.targetEnemyId]
      : [];
  return [...new Set(ids)];
}

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

export const SABAOTH_WEAPON_NAME = "Sabaoth-Class Obliteration Charges";
export const SABAOTH_MAX_CHARGES = 5;

export function isSabaothWeaponName(name: string | undefined | null): boolean {
  return name === SABAOTH_WEAPON_NAME;
}

export function playerHasSabaothWeapon(player: Pick<Player, "weapon" | "weapon2">): boolean {
  return isSabaothWeaponName(player.weapon) || isSabaothWeaponName(player.weapon2);
}

export function initSabaothCharges(player: Player): void {
  if (!player.counters) player.counters = {};
  if (!playerHasSabaothWeapon(player)) {
    delete player.counters.sabaothBomb;
    return;
  }
  player.counters.sabaothCharges = SABAOTH_MAX_CHARGES;
  delete player.counters.sabaothBomb;
}

export function hasSabaothBombSelected(player: Player | undefined): boolean {
  if (!player || !isSabaothWeaponName(player.weapon)) return false;
  const index = player.counters?.sabaothBomb;
  return index != null && index >= 0;
}

export function ensureSabaothCharges(player: Player): void {
  if (!playerHasSabaothWeapon(player)) return;
  if (!player.counters) player.counters = {};
  if (player.counters.sabaothCharges === undefined) {
    player.counters.sabaothCharges = SABAOTH_MAX_CHARGES;
  }
}

export function getSabaothChargesRemaining(player: Player): number | null {
  if (!isSabaothWeaponName(player.weapon)) return null;
  return player.counters?.sabaothCharges ?? SABAOTH_MAX_CHARGES;
}

export function getWeaponAttackSpec(weaponName: string | undefined): WeaponAttackSpec | null {
  if (!weaponName) return null;
  const weapon = getWeaponByName(weaponName);
  if (!weapon?.attack) return null;
  return weapon.attack as WeaponAttackSpec;
}

export function resolveAttackWeapon(player: Player, weaponName?: string): string | null {
  const equipped = player.weapon ?? null;
  if (!equipped) return null;
  if (!weaponName || weaponName === equipped) return equipped;
  return null;
}

export function resolveCombatAttackSpec(
  player: Player | undefined,
  weaponName: string | undefined,
): WeaponAttackSpec | null {
  const spec = getWeaponAttackSpec(weaponName);
  if (!spec) return null;
  if (spec.tiles?.length || spec.rangeTargets || spec.rangeSpan || (spec.patternId && spec.size != null)) {
    return spec;
  }
  if (spec.bombs?.length) {
    const bombIndex = player?.counters?.sabaothBomb;
    if (bombIndex == null || bombIndex < 0) return null;
    const bomb = spec.bombs[bombIndex];
    if (!bomb) return null;
    return {
      ...spec,
      damage: bomb.damage,
      tiles: bomb.tiles,
      effects: bomb.effects,
      rangeSpan: parseAttackRangeSpan(bomb.range) ?? undefined,
      anchorTile: bomb.anchorTile,
      heal: bomb.heal,
    };
  }
  const levelIndex = Math.max(0, Math.min((player?.counters?.heavenBurningLevel ?? 1) - 1, (spec.levels?.length ?? 1) - 1));
  const level = spec.levels?.[levelIndex] ?? spec.levels?.[0];
  if (level) {
    return {
      ...spec,
      damage: level.damage,
      tiles: level.tiles,
    };
  }
  return spec;
}

export function playerAttackDirectionsAt(
  state: GameState,
  playerId: string,
  x: number,
  y: number,
  weaponName?: string,
): PatternDirection[] {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return [];
  const weapon = resolveAttackWeapon(player, weaponName) ?? player.weapon;
  const spec = resolveCombatAttackSpec(player, weapon);
  if (!player || !spec) return [];
  const origin = { x: player.x, y: player.y };
  const dirs: PatternDirection[] = [];
  for (const direction of PATTERN_DIRECTIONS) {
    const tiles = collectAttackTiles(state, origin, spec, direction);
    if (tiles.some((t) => t.x === x && t.y === y)) dirs.push(direction);
  }
  return dirs;
}

export function rangeAttackTileKeys(
  state: GameState,
  origin: { x: number; y: number },
  range: number,
): Set<string> {
  const keys = new Set<string>();
  for (let dy = -range; dy <= range; dy++) {
    for (let dx = -range; dx <= range; dx++) {
      if (dx === 0 && dy === 0) continue;
      if (Math.abs(dx) + Math.abs(dy) > range) continue;
      const x = origin.x + dx;
      const y = origin.y + dy;
      if (x < 0 || y < 0 || x >= state.width || y >= state.height) continue;
      keys.add(coordKey(x, y));
    }
  }
  return keys;
}

export function collectAttackTiles(
  state: GameState,
  origin: { x: number; y: number },
  spec: WeaponAttackSpec,
  direction: PatternDirection,
): { x: number; y: number }[] {
  if (spec.tiles?.length) {
    return bespokeTilesInBounds(
      origin,
      spec.tiles,
      usesAnchoredPatternPlacement(spec) ? "e" : direction,
      state.width,
      state.height,
    );
  }
  if (spec.rangeTargets || (spec.patternId === "range" && spec.range)) {
    return [];
  }
  if (!spec.patternId || spec.size == null) return [];
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

export function applyDamageToEnemy(enemy: Enemy, damage: number, state?: GameState): number {
  const maxHp = getEnemyMaxHp(enemy);
  const before = enemy.hp ?? maxHp;
  const adjusted = applyBleedBonus(damage, enemy.effects);
  enemy.hp = clampHp(before - adjusted, maxHp);
  if (state) {
    if (!state.damageEvents) state.damageEvents = [];
    state.damageEvents.push({ x: enemy.x, y: enemy.y, amount: adjusted });
  }
  return adjusted;
}

export function applyDamageToPlayer(player: Player, damage: number, state?: GameState): number {
  const maxHp = getPlayerMaxHp(player);
  const before = player.hp ?? maxHp;
  const adjusted = applyBleedBonus(damage, player.effects);
  player.hp = clampHp(before - adjusted, maxHp);
  if (state) {
    if (!state.damageEvents) state.damageEvents = [];
    state.damageEvents.push({ x: player.x, y: player.y, amount: adjusted });
  }
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
    applyDamageToEnemy(enemy, total, state);
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

export const OMNISTRIKE_DIRECTION: PatternDirection = "e";

export type OmnistrikePayload = {
  bombIndices: [number, number];
  anchors: [{ x: number; y: number }, { x: number; y: number }];
};

export function resolveBombAttackSpec(
  weaponName: string | undefined,
  bombIndex: number,
): WeaponAttackSpec | null {
  const spec = getWeaponAttackSpec(weaponName);
  const bomb = spec?.bombs?.[bombIndex];
  if (!spec || !bomb) return null;
  return {
    ...spec,
    damage: bomb.damage,
    tiles: bomb.tiles,
    effects: bomb.effects,
    rangeSpan: parseAttackRangeSpan(bomb.range) ?? undefined,
    anchorTile: bomb.anchorTile,
    heal: bomb.heal,
  };
}

export function computeOmnistrikeRangeSpan(
  bombA: WeaponAttackSpec,
  bombB: WeaponAttackSpec,
): AttackRangeSpan | null {
  const spanA = bombA.rangeSpan;
  const spanB = bombB.rangeSpan;
  if (!spanA || !spanB) return null;
  return { min: Math.min(spanA.min, spanB.min), max: Math.max(spanA.max, spanB.max) };
}

export function collectBombPatternTiles(
  state: GameState,
  anchor: { x: number; y: number },
  bombSpec: WeaponAttackSpec,
  direction: PatternDirection = OMNISTRIKE_DIRECTION,
): { x: number; y: number }[] {
  const origin = patternOriginFromAnchor(anchor, bombSpec.anchorTile, direction);
  return bespokeTilesInBounds(
    origin,
    bombSpec.tiles!,
    direction,
    state.width,
    state.height,
  );
}

export function patternsAdjacentOrOverlap(
  tilesA: { x: number; y: number }[],
  tilesB: { x: number; y: number }[],
): boolean {
  const keysA = new Set(tilesA.map((t) => coordKey(t.x, t.y)));
  for (const tile of tilesB) {
    const key = coordKey(tile.x, tile.y);
    if (keysA.has(key)) return true;
    if (keysA.has(coordKey(tile.x + 1, tile.y))) return true;
    if (keysA.has(coordKey(tile.x - 1, tile.y))) return true;
    if (keysA.has(coordKey(tile.x, tile.y + 1))) return true;
    if (keysA.has(coordKey(tile.x, tile.y - 1))) return true;
  }
  return false;
}

export function unionPatternTiles(
  tilesA: { x: number; y: number }[],
  tilesB: { x: number; y: number }[],
): { x: number; y: number }[] {
  const seen = new Set<string>();
  const result: { x: number; y: number }[] = [];
  for (const tile of [...tilesA, ...tilesB]) {
    const key = coordKey(tile.x, tile.y);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(tile);
  }
  return result;
}

export type OmnistrikePlacement = {
  patternTiles: { x: number; y: number }[];
  combinedTiles: { x: number; y: number }[];
  nearestEmptySpaces: number;
  tooCloseKeys: Set<string>;
  tooFar: boolean;
  valid: boolean;
  adjacentToOther: boolean;
};

export function evaluateOmnistrikePlacement(
  user: { x: number; y: number },
  anchor: { x: number; y: number },
  bombSpec: WeaponAttackSpec,
  direction: PatternDirection,
  state: GameState,
  combinedSpan: AttackRangeSpan,
  otherPatternTiles?: { x: number; y: number }[],
): OmnistrikePlacement {
  const patternTiles = collectBombPatternTiles(state, anchor, bombSpec, direction);
  const combinedTiles = otherPatternTiles?.length
    ? unionPatternTiles(otherPatternTiles, patternTiles)
    : patternTiles;

  let nearestDist = Infinity;
  const tooCloseKeys = new Set<string>();

  for (const tile of combinedTiles) {
    const dist = manhattanDistance(user, tile);
    nearestDist = Math.min(nearestDist, dist);
    if (dist - 1 < combinedSpan.min) {
      tooCloseKeys.add(coordKey(tile.x, tile.y));
    }
  }

  const nearestEmptySpaces = nearestDist === Infinity ? Infinity : nearestDist - 1;
  const tooFar = nearestEmptySpaces > combinedSpan.max;
  const adjacentToOther = !otherPatternTiles?.length || patternsAdjacentOrOverlap(otherPatternTiles, patternTiles);
  const valid =
    patternTiles.length > 0 &&
    !tooFar &&
    tooCloseKeys.size === 0 &&
    adjacentToOther;

  return {
    patternTiles,
    combinedTiles,
    nearestEmptySpaces,
    tooCloseKeys,
    tooFar,
    valid,
    adjacentToOther,
  };
}

export function resolveOmnistrikePlacements(
  state: GameState,
  player: Player,
  payload: OmnistrikePayload,
): { bombSpecs: [WeaponAttackSpec, WeaponAttackSpec]; combinedSpan: AttackRangeSpan; unionTiles: { x: number; y: number }[] } | null {
  const weapon = player.weapon;
  if (!isSabaothWeaponName(weapon)) return null;
  const [indexA, indexB] = payload.bombIndices;
  const bombA = resolveBombAttackSpec(weapon, indexA);
  const bombB = resolveBombAttackSpec(weapon, indexB);
  if (!bombA || !bombB) return null;
  const combinedSpan = computeOmnistrikeRangeSpan(bombA, bombB);
  if (!combinedSpan) return null;

  const tilesA = collectBombPatternTiles(state, payload.anchors[0], bombA, OMNISTRIKE_DIRECTION);
  const tilesB = collectBombPatternTiles(state, payload.anchors[1], bombB, OMNISTRIKE_DIRECTION);
  if (!tilesA.length || !tilesB.length) return null;
  if (!patternsAdjacentOrOverlap(tilesA, tilesB)) return null;

  const placementA = evaluateOmnistrikePlacement(
    player,
    payload.anchors[0],
    bombA,
    OMNISTRIKE_DIRECTION,
    state,
    combinedSpan,
    tilesB,
  );
  const placementB = evaluateOmnistrikePlacement(
    player,
    payload.anchors[1],
    bombB,
    OMNISTRIKE_DIRECTION,
    state,
    combinedSpan,
    tilesA,
  );
  if (!placementA.valid || !placementB.valid) return null;

  return {
    bombSpecs: [bombA, bombB],
    combinedSpan,
    unionTiles: unionPatternTiles(tilesA, tilesB),
  };
}

export function validateOmnistrikeAction(
  state: GameState,
  player: Player,
  payload: OmnistrikePayload,
): string | null {
  if (!isSabaothWeaponName(player.weapon)) return "Invalid weapon";
  const weapon = getWeaponByName(player.weapon ?? "");
  const bombs = weapon?.attack?.bombs;
  if (!bombs?.length) return "Weapon has no variants";
  for (const index of payload.bombIndices) {
    if (!Number.isInteger(index) || index < 0 || index >= bombs.length) return "Invalid variant";
  }
  ensureSabaothCharges(player);
  if ((player.counters?.sabaothCharges ?? 0) <= 0) return "No charges remaining";

  const resolved = resolveOmnistrikePlacements(state, player, payload);
  if (!resolved) {
    const [indexA, indexB] = payload.bombIndices;
    const bombA = resolveBombAttackSpec(player.weapon, indexA);
    const bombB = resolveBombAttackSpec(player.weapon, indexB);
    const combinedSpan = bombA && bombB ? computeOmnistrikeRangeSpan(bombA, bombB) : null;
    if (!combinedSpan) return "Invalid placement";

    const tilesA = collectBombPatternTiles(state, payload.anchors[0], bombA!, OMNISTRIKE_DIRECTION);
    const tilesB = collectBombPatternTiles(state, payload.anchors[1], bombB!, OMNISTRIKE_DIRECTION);
    if (!patternsAdjacentOrOverlap(tilesA, tilesB)) return "Patterns must be adjacent or overlap";

    for (const [anchor, spec, other] of [
      [payload.anchors[0], bombA!, tilesB] as const,
      [payload.anchors[1], bombB!, tilesA] as const,
    ]) {
      const placement = evaluateOmnistrikePlacement(
        player,
        anchor,
        spec,
        OMNISTRIKE_DIRECTION,
        state,
        combinedSpan,
        other,
      );
      if (placement.tooFar) return "outside maximum range";
      if (placement.tooCloseKeys.size > 0) return "inside minimum range";
    }
    return "Placement out of range";
  }
  return null;
}

export function applyOmnistrike(
  state: GameState,
  player: Player,
  payload: OmnistrikePayload,
): { message: string; targets: AttackTarget[] } {
  const resolved = resolveOmnistrikePlacements(state, player, payload)!;
  const { bombSpecs, unionTiles } = resolved;
  ensureSabaothCharges(player);
  player.counters!.sabaothCharges = (player.counters!.sabaothCharges ?? 0) - 1;

  const occ = buildBoardOccupancy(state);
  const seenEnemies = new Set<string>();
  const allTargets: AttackTarget[] = [];
  const damageParts: string[] = [];

  for (const bombSpec of bombSpecs) {
    const { total, detail } = resolveAttackDamage(bombSpec);
    if (total > 0) damageParts.push(detail);
    const effects = bombSpec.effects ?? [];
    for (const tile of unionTiles) {
      const mapTile = tileAt(state.tiles, tile.x, tile.y);
      if (mapTile && effects.some((e) => e === "Advantageous")) {
        setTileEffect(mapTile, "Advantageous:1");
      }
      const enemy = occ.enemyByKey.get(coordKey(tile.x, tile.y));
      if (enemy) {
        if (total > 0) applyDamageToEnemy(enemy, total, state);
        applyEffectStacks(enemy, effects);
        if (!seenEnemies.has(enemy.id)) {
          seenEnemies.add(enemy.id);
          allTargets.push({ enemyId: enemy.id, x: tile.x, y: tile.y });
        }
      }
      const ally = occ.playerByKey.get(coordKey(tile.x, tile.y));
      if (ally) applyEffectStacks(ally, effects);
    }
  }

  const dmgLabel = damageParts.length ? damageParts.join("+") : "0";
  return { message: `Omnistrike (${dmgLabel} dmg)`, targets: allTargets };
}

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
