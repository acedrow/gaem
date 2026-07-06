import type { PatternDirection } from "../pattern-data.js";
import { PATTERN_DIRECTIONS } from "../pattern-data.js";
import { fixedPatternTilesInBounds } from "../patterns.js";
import {
  bespokeTilesInBounds,
  parseAttackRangeSpan,
  patternOriginFromAnchor,
} from "../weapon-patterns.js";
import { getEnemyScale, enemyFootprintTiles } from "../enemy-data.js";
import { buildBoardOccupancy } from "../game.js";
import { coordKey, isInBounds, isWalkable, setTileTerrain, tileAt } from "../map.js";
import type { Enemy, GameState, MapTile, Player } from "../types.js";
import { getWeaponByName } from "../player-data.js";
import type { WeaponAttackSpec } from "./types.js";
import type { AttackRangeSpan } from "./types.js";
import { applyBleedBonus, applyEffectStacks } from "./effects.js";
import { parseAndRollDamage } from "./damage.js";
import { checkSharurEmergencyDefenses } from "./attractor.js";
import { clampHp, getEnemyMaxHp, getPlayerMaxHp, getEffectiveEnemyMaxHp, removeEnemy } from "../game.js";
import {
  buildSwarmGroups,
  countSwarmTilesAdjacentTo,
  getSwarmMemberHp,
  reconcileSwarmHp,
  swarmEnemyStrikeCap,
  swarmGroupForEnemy,
  swarmCanonicalDisplayId,
  swarmMembersHitByTiles,
} from "./swarm.js";
import { isOrthogonallyAdjacent } from "../patterns.js";

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
      direction,
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

export function enemiesInTiles(
  state: GameState,
  tiles: { x: number; y: number }[],
  opts?: { dedupeSwarms?: boolean },
): AttackTarget[] {
  const dedupeSwarms = opts?.dedupeSwarms !== false;
  const occ = buildBoardOccupancy(state);
  const seen = new Set<string>();
  const seenSwarmGroups = new Set<string>();
  const targets: AttackTarget[] = [];
  for (const tile of tiles) {
    const enemy = occ.enemyByKey.get(coordKey(tile.x, tile.y));
    if (!enemy || seen.has(enemy.id)) continue;
    if (dedupeSwarms) {
      const group = swarmGroupForEnemy(state, enemy.id);
      if (group) {
        const key = [...group.memberIds].sort().join(",");
        if (seenSwarmGroups.has(key)) continue;
        seenSwarmGroups.add(key);
        seen.add(enemy.id);
        targets.push({ enemyId: group.canonicalId, x: tile.x, y: tile.y });
        continue;
      }
    }
    seen.add(enemy.id);
    targets.push({ enemyId: enemy.id, x: tile.x, y: tile.y });
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

export function applyDamageToEnemy(
  enemy: Enemy,
  damage: number,
  state?: GameState,
  opts?: { recordDamage?: boolean },
): number {
  const maxHp = state ? getEffectiveEnemyMaxHp(enemy, state) : getEnemyMaxHp(enemy);
  const before = enemy.hp ?? maxHp;
  const adjusted = applyBleedBonus(damage, enemy.effects);
  const newHp = clampHp(before - adjusted, maxHp);
  if (state) {
    const group = swarmGroupForEnemy(state, enemy.id);
    if (group) {
      for (const id of group.memberIds) {
        const member = state.enemies.find((e) => e.id === id);
        if (member) member.hp = newHp;
      }
    } else {
      enemy.hp = newHp;
    }
    if (opts?.recordDamage !== false) {
      if (!state.damageEvents) state.damageEvents = [];
      if (group) {
        const displayId = swarmCanonicalDisplayId(state, group.memberIds);
        const anchor = state.enemies.find((e) => e.id === displayId) ?? enemy;
        let merged = false;
        for (const evt of state.damageEvents) {
          const atEnemy = state.enemies.find((e) => e.x === evt.x && e.y === evt.y);
          const evtGroup = atEnemy ? swarmGroupForEnemy(state, atEnemy.id) : null;
          if (evtGroup?.canonicalId === group.canonicalId) {
            evt.amount += adjusted;
            merged = true;
            break;
          }
        }
        if (!merged) {
          state.damageEvents.push({ x: anchor.x, y: anchor.y, amount: adjusted });
        }
      } else {
        state.damageEvents.push({ x: enemy.x, y: enemy.y, amount: adjusted });
      }
    }
  } else {
    enemy.hp = newHp;
  }
  return adjusted;
}

export function applyBreakerAttackToSwarm(
  state: GameState,
  tiles: { x: number; y: number }[],
  damage: number,
  effects: string[] = [],
): { targets: AttackTarget[]; brokenIds: string[] } {
  const hits = swarmMembersHitByTiles(state, tiles);
  const brokenIds: string[] = [];
  const targets: AttackTarget[] = [];

  if (!hits.length) return { targets, brokenIds };

  const prevGroups = buildSwarmGroups(state);
  const group = swarmGroupForEnemy(state, hits[0]!.enemyId);
  if (!group) return { targets, brokenIds };

  const memberHp = getSwarmMemberHp(group.currentHp, group.size);
  const allKilled = hits.every(() => damage >= memberHp);
  const primary = state.enemies.find((e) => e.id === group.canonicalId)!;
  const adjusted = applyBleedBonus(damage, primary.effects);

  const recordHitDamage = () => {
    if (!state.damageEvents) state.damageEvents = [];
    for (const hit of hits) {
      state.damageEvents.push({ x: hit.x, y: hit.y, amount: adjusted });
    }
  };

  if (allKilled) {
    recordHitDamage();
    for (const hit of hits) {
      brokenIds.push(hit.enemyId);
      targets.push(hit);
      const enemy = state.enemies.find((e) => e.id === hit.enemyId);
      if (enemy) enemy.hp = 0;
    }
    reconcileSwarmHp(state, prevGroups);
  } else {
    applyDamageToEnemy(primary, damage, state, { recordDamage: false });
    recordHitDamage();
    targets.push({ enemyId: group.canonicalId, x: primary.x, y: primary.y });
    applyEffectStacks(primary, effects);
  }

  return { targets, brokenIds };
}

export function applyDamageToPlayer(
  player: Player,
  damage: number,
  state?: GameState,
  opts?: { recordDamage?: boolean },
): number {
  const maxHp = getPlayerMaxHp(player);
  const before = player.hp ?? maxHp;
  const adjusted = applyBleedBonus(damage, player.effects);
  player.hp = clampHp(before - adjusted, maxHp);
  if (state) {
    checkSharurEmergencyDefenses(state, player);
  }
  if (state && opts?.recordDamage !== false) {
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
  opts?: { useBreaker?: boolean; weaponName?: string },
): { damage: number; detail: string; targets: AttackTarget[]; effects: string[] } {
  const tiles = collectAttackTiles(state, origin, spec, direction);
  const { total, detail } = resolveAttackDamage(spec, damageRoll);
  const effects = spec.effects ?? [];

  if (opts?.useBreaker && swarmMembersHitByTiles(state, tiles).length) {
    const { targets } = applyBreakerAttackToSwarm(state, tiles, total, effects);
    return { damage: total, detail, targets, effects };
  }

  if (
    !opts?.useBreaker &&
    isSethianWeaponName(opts?.weaponName) &&
    swarmMembersHitByTiles(state, tiles).length
  ) {
    return applySethianWholeSwarmAttack(state, spec, tiles, damageRoll);
  }

  const targets = enemiesInTiles(state, tiles);
  for (const target of targets) {
    const enemy = state.enemies.find((e) => e.id === target.enemyId);
    if (!enemy) continue;
    applyDamageToEnemy(enemy, total, state);
    applyEffectStacks(enemy, effects);
  }
  return { damage: total, detail, targets, effects };
}

export const SETHIAN_DAMAGE_CAP = 12 + 20 * 6;

export function isSethianWeaponName(name: string | undefined | null): boolean {
  return name === SETHIAN_WEAPON_NAME;
}

function swarmHitsByGroup(
  state: GameState,
  tiles: { x: number; y: number }[],
): Map<string, number> {
  const occ = buildBoardOccupancy(state);
  const hits = new Map<string, number>();
  for (const tile of tiles) {
    const enemy = occ.enemyByKey.get(coordKey(tile.x, tile.y));
    if (!enemy) continue;
    const group = swarmGroupForEnemy(state, enemy.id);
    if (!group) continue;
    hits.set(group.canonicalId, (hits.get(group.canonicalId) ?? 0) + 1);
  }
  return hits;
}

function applySethianWholeSwarmAttack(
  state: GameState,
  spec: WeaponAttackSpec,
  tiles: { x: number; y: number }[],
  damageRoll?: number,
): { damage: number; detail: string; targets: AttackTarget[]; effects: string[] } {
  const groupHits = swarmHitsByGroup(state, tiles);
  const { total, detail } = resolveAttackDamage(spec, damageRoll);
  const effects = spec.effects ?? [];
  const targets: AttackTarget[] = [];
  const parts: string[] = [];

  for (const [canonicalId, hitCount] of groupHits) {
    const damage = Math.min(total * hitCount, SETHIAN_DAMAGE_CAP);
    const enemy = state.enemies.find((e) => e.id === canonicalId)!;
    applyDamageToEnemy(enemy, damage, state);
    applyEffectStacks(enemy, effects);
    targets.push({ enemyId: canonicalId, x: enemy.x, y: enemy.y });
    parts.push(`${detail}×${hitCount}=${damage}`);
  }

  const swarmCanonical = new Set(groupHits.keys());
  for (const target of enemiesInTiles(state, tiles)) {
    if (swarmCanonical.has(target.enemyId)) continue;
    const enemy = state.enemies.find((e) => e.id === target.enemyId)!;
    applyDamageToEnemy(enemy, total, state);
    applyEffectStacks(enemy, effects);
    targets.push(target);
  }

  return { damage: total, detail: parts.join("; ") || detail, targets, effects };
}

export function applyRangeAttackToEnemies(
  state: GameState,
  spec: WeaponAttackSpec,
  targetIds: string[],
  damageRoll?: number,
  opts?: { useBreaker?: boolean; weaponName?: string },
): { damage: number; detail: string; targets: AttackTarget[]; effects: string[] } {
  const tiles = targetIds
    .map((id) => state.enemies.find((e) => e.id === id))
    .filter(Boolean)
    .map((e) => ({ x: e!.x, y: e!.y }));

  if (opts?.useBreaker && swarmMembersHitByTiles(state, tiles).length) {
    const { total, detail } = resolveAttackDamage(spec, damageRoll);
    const effects = spec.effects ?? [];
    const targets: AttackTarget[] = [];
    for (const targetId of targetIds) {
      const enemy = state.enemies.find((e) => e.id === targetId)!;
      const group = swarmGroupForEnemy(state, targetId);
      if (group) {
        const { targets: broken } = applyBreakerAttackToSwarm(
          state,
          [{ x: enemy.x, y: enemy.y }],
          total,
          effects,
        );
        targets.push(...broken);
      } else {
        applyDamageToEnemy(enemy, total, state);
        applyEffectStacks(enemy, effects);
        targets.push({ enemyId: enemy.id, x: enemy.x, y: enemy.y });
      }
    }
    return { damage: total, detail, targets, effects };
  }

  if (
    !opts?.useBreaker &&
    isSethianWeaponName(opts?.weaponName) &&
    swarmMembersHitByTiles(state, tiles).length
  ) {
    return applySethianWholeSwarmAttack(state, spec, tiles, damageRoll);
  }

  const { total, detail } = resolveAttackDamage(spec, damageRoll);
  const effects = spec.effects ?? [];
  const targets: AttackTarget[] = [];
  for (const targetId of targetIds) {
    const enemy = state.enemies.find((e) => e.id === targetId)!;
    applyDamageToEnemy(enemy, total, state);
    applyEffectStacks(enemy, effects);
    targets.push({ enemyId: enemy.id, x: enemy.x, y: enemy.y });
  }
  return { damage: total, detail, targets, effects };
}

export type SwarmEnemyAttackPreview = {
  totalDamage: number;
  strikeCount: number;
  detail: string;
};

export function previewSwarmEnemyAttack(
  state: GameState,
  enemyId: string,
  parsed: ParsedEnemyAttack,
  targetPlayerId: string,
  opts?: { damage?: number; strikeCount?: number },
): SwarmEnemyAttackPreview {
  const group = swarmGroupForEnemy(state, enemyId);
  const memberIds = group?.memberIds ?? [enemyId];
  const target = state.players.find((p) => p.id === targetPlayerId);
  if (!target) return { totalDamage: 0, strikeCount: 0, detail: "No target" };

  const baseDamage = opts?.damage ?? parsed.damage ?? 0;
  const adjacentCount = countSwarmTilesAdjacentTo(state, memberIds, target);
  if (adjacentCount === 0) return { totalDamage: 0, strikeCount: 0, detail: "Not adjacent" };

  const maxStrikes = Math.min(adjacentCount, swarmEnemyStrikeCap(1));
  const strikes = Math.min(Math.max(1, opts?.strikeCount ?? maxStrikes), maxStrikes);
  let remainingAdjacent = adjacentCount;
  let totalDamage = 0;
  for (let i = 0; i < strikes; i++) {
    if (i > 0) remainingAdjacent -= 1;
    totalDamage += baseDamage + remainingAdjacent;
  }
  return {
    totalDamage,
    strikeCount: strikes,
    detail: `${strikes} strike${strikes === 1 ? "" : "s"} (${baseDamage}+adj)`,
  };
}

function pickAdjacentSwarmMember(
  state: GameState,
  memberIds: string[],
  target: { x: number; y: number },
): string | null {
  for (const id of memberIds) {
    const enemy = state.enemies.find((e) => e.id === id);
    if (enemy && isOrthogonallyAdjacent(enemy, target)) return id;
  }
  return null;
}

export function applySwarmEnemyAttackToPlayer(
  state: GameState,
  enemyId: string,
  parsed: ParsedEnemyAttack,
  targetPlayerId: string,
  opts?: { damage?: number; strikeCount?: number },
): SwarmEnemyAttackPreview {
  const preview = previewSwarmEnemyAttack(state, enemyId, parsed, targetPlayerId, opts);
  if (preview.strikeCount === 0) return preview;

  const group = swarmGroupForEnemy(state, enemyId);
  let memberIds = [...(group?.memberIds ?? [enemyId])];
  const target = state.players.find((p) => p.id === targetPlayerId)!;
  const baseDamage = opts?.damage ?? parsed.damage ?? 0;
  let remainingAdjacent = countSwarmTilesAdjacentTo(state, memberIds, target);

  let totalDamage = 0;
  for (let i = 0; i < preview.strikeCount; i++) {
    if (i > 0) {
      const expendId = pickAdjacentSwarmMember(state, memberIds, target);
      if (expendId) {
        removeEnemy(state, expendId);
        memberIds = memberIds.filter((id) => id !== expendId);
        remainingAdjacent -= 1;
        if (group) reconcileSwarmHp(state);
      }
    }
    const strikeDamage = baseDamage + remainingAdjacent;
    totalDamage += applyDamageToPlayer(target, strikeDamage, state, { recordDamage: false });
    if (parsed.effects) applyEffectStacks(target, parsed.effects);
  }
  if (state && totalDamage > 0) {
    if (!state.damageEvents) state.damageEvents = [];
    state.damageEvents.push({ x: target.x, y: target.y, amount: totalDamage });
  }

  return preview;
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
  direction: PatternDirection;
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

  const tilesA = collectBombPatternTiles(state, payload.anchors[0], bombA, payload.direction);
  const tilesB = collectBombPatternTiles(state, payload.anchors[1], bombB, payload.direction);
  if (!tilesA.length || !tilesB.length) return null;
  if (!patternsAdjacentOrOverlap(tilesA, tilesB)) return null;

  const placementA = evaluateOmnistrikePlacement(
    player,
    payload.anchors[0],
    bombA,
    payload.direction,
    state,
    combinedSpan,
    tilesB,
  );
  const placementB = evaluateOmnistrikePlacement(
    player,
    payload.anchors[1],
    bombB,
    payload.direction,
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

    const tilesA = collectBombPatternTiles(state, payload.anchors[0], bombA!, payload.direction);
    const tilesB = collectBombPatternTiles(state, payload.anchors[1], bombB!, payload.direction);
    if (!patternsAdjacentOrOverlap(tilesA, tilesB)) return "Patterns must be adjacent or overlap";

    for (const [anchor, spec, other] of [
      [payload.anchors[0], bombA!, tilesB] as const,
      [payload.anchors[1], bombB!, tilesA] as const,
    ]) {
      const placement = evaluateOmnistrikePlacement(
        player,
        anchor,
        spec,
        payload.direction,
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
        setTileTerrain(mapTile, "advantageous");
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

export const SETHIAN_WEAPON_NAME = "Sethian Externalized Annihilation Cannon";
export const WARHOOK_RANGE = 3;

export type WarhookPayload = {
  targetEnemyId?: string;
  targetX: number;
  targetY: number;
  landingX: number;
  landingY: number;
  damageRoll?: number;
  useBreaker?: boolean;
};

export type WarhookTarget = {
  enemyId?: string;
  x: number;
  y: number;
};

export function isWarhookWeaponName(name: string | undefined | null): boolean {
  return name === SETHIAN_WEAPON_NAME;
}

export function isWarhookTerrainTarget(tile: MapTile | undefined): boolean {
  if (!tile) return false;
  return tile.terrain.includes("impassable") || tile.terrain.includes("obstacle");
}

export function warhookRangeKeys(
  state: GameState,
  origin: { x: number; y: number },
): Set<string> {
  return rangeAttackTileKeys(state, origin, WARHOOK_RANGE);
}

function warhookTargetFootprint(
  state: GameState,
  target: WarhookTarget,
): { x: number; y: number }[] {
  if (target.enemyId) {
    const enemy = state.enemies.find((e) => e.id === target.enemyId);
    if (!enemy) return [];
    return enemyFootprintTiles(enemy.x, enemy.y, getEnemyScale(enemy));
  }
  return [{ x: target.x, y: target.y }];
}

export function isWarhookTargetAt(
  state: GameState,
  player: Player,
  x: number,
  y: number,
): WarhookTarget | null {
  if (manhattanDistance(player, { x, y }) > WARHOOK_RANGE) return null;
  if (!isInBounds(x, y, state.width, state.height)) return null;

  const occ = buildBoardOccupancy(state);
  const enemy = occ.enemyByKey.get(coordKey(x, y));
  if (enemy) return { enemyId: enemy.id, x, y };

  const tile = tileAt(state.tiles, x, y);
  if (isWarhookTerrainTarget(tile)) return { x, y };

  return null;
}

export function warhookValidTargetKeys(
  state: GameState,
  player: Player,
): Set<string> {
  const keys = new Set<string>();
  const rangeKeys = warhookRangeKeys(state, player);
  const occ = buildBoardOccupancy(state);

  for (const key of rangeKeys) {
    const [xs, ys] = key.split(",");
    const x = Number(xs);
    const y = Number(ys);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;

    if (occ.enemyByKey.has(key)) {
      keys.add(key);
      continue;
    }
    const tile = tileAt(state.tiles, x, y);
    if (isWarhookTerrainTarget(tile)) keys.add(key);
  }

  return keys;
}

export function warhookAdjacentLandingTiles(
  state: GameState,
  playerId: string,
  target: WarhookTarget,
): { x: number; y: number }[] {
  const footprint = warhookTargetFootprint(state, target);
  if (!footprint.length) return [];

  const occ = buildBoardOccupancy(state);
  const seen = new Set<string>();
  const landings: { x: number; y: number }[] = [];

  for (const ft of footprint) {
    for (const delta of [
      { dx: 0, dy: -1 },
      { dx: 0, dy: 1 },
      { dx: -1, dy: 0 },
      { dx: 1, dy: 0 },
    ]) {
      const x = ft.x + delta.dx;
      const y = ft.y + delta.dy;
      const key = coordKey(x, y);
      if (seen.has(key)) continue;
      seen.add(key);
      if (!isInBounds(x, y, state.width, state.height)) continue;
      if (!isWalkable(tileAt(state.tiles, x, y))) continue;
      const occupant = occ.playerByKey.get(key);
      if (occupant && occupant.id !== playerId) continue;
      if (occ.enemyByKey.has(key)) continue;
      landings.push({ x, y });
    }
  }

  return landings;
}

export function warhookNearestLandings(
  player: Player,
  landings: { x: number; y: number }[],
): { x: number; y: number }[] {
  if (landings.length <= 1) return landings;
  let minDist = Infinity;
  for (const tile of landings) {
    const d = manhattanDistance(player, tile);
    if (d < minDist) minDist = d;
  }
  return landings.filter((tile) => manhattanDistance(player, tile) === minDist);
}

export function validateWarhookAction(
  state: GameState,
  player: Player,
  payload: WarhookPayload,
): string | null {
  if (!isWarhookWeaponName(player.weapon)) return "Invalid weapon";

  const target = isWarhookTargetAt(state, player, payload.targetX, payload.targetY);
  if (!target) return "Invalid target";
  if (payload.targetEnemyId) {
    if (target.enemyId !== payload.targetEnemyId) return "Invalid target";
  } else if (target.enemyId) {
    return "Invalid target";
  }

  const landings = warhookAdjacentLandingTiles(state, player.id, target);
  const landing = { x: payload.landingX, y: payload.landingY };
  if (!landings.some((t) => t.x === landing.x && t.y === landing.y)) {
    return "Invalid landing space";
  }

  return null;
}

export function applyWarhook(
  state: GameState,
  player: Player,
  payload: WarhookPayload,
): { message: string; detail: string; targets: AttackTarget[] } {
  player.x = payload.landingX;
  player.y = payload.landingY;

  if (!player.counters) player.counters = {};
  player.counters.warhookBlazingImmuneTurns = 2;

  const targets: AttackTarget[] = [];
  let detail = "0";

  if (payload.targetEnemyId) {
    const enemy = state.enemies.find((e) => e.id === payload.targetEnemyId);
    if (enemy) {
      const spec = getWeaponAttackSpec(player.weapon ?? "");
      if (spec) {
        const resolved = resolveAttackDamage(spec, payload.damageRoll);
        detail = resolved.detail;
        const group = swarmGroupForEnemy(state, enemy.id);
        if (payload.useBreaker && group) {
          applyBreakerAttackToSwarm(state, [{ x: enemy.x, y: enemy.y }], resolved.total, []);
        } else if (!payload.useBreaker && isSethianWeaponName(player.weapon) && group) {
          applySethianWholeSwarmAttack(state, spec, [{ x: enemy.x, y: enemy.y }], payload.damageRoll);
        } else {
          applyDamageToEnemy(enemy, resolved.total, state);
        }
      }
      applyEffectStacks(enemy, ["Blazing:2"]);
      targets.push({ enemyId: enemy.id, x: enemy.x, y: enemy.y });
    }
  }

  return { message: "Canticle Boosted Warhook", detail, targets };
}

export function isDirectTargetEnemyAttack(parsed: ParsedEnemyAttack): boolean {
  if (parsed.patternId || parsed.damage == null) return false;
  const raw = parsed.raw.trim();
  if (/^(move|create|increase|decrease|transform)/i.test(raw)) return false;
  if (/^deal/i.test(raw)) return true;
  return parsed.range != null || /damage:/i.test(raw);
}

function enemyAttackOriginTiles(state: GameState, enemyId: string): { x: number; y: number }[] {
  const group = swarmGroupForEnemy(state, enemyId);
  if (group) {
    return group.memberIds.flatMap((id) => {
      const e = state.enemies.find((en) => en.id === id);
      return e ? [{ x: e.x, y: e.y }] : [];
    });
  }
  const enemy = state.enemies.find((e) => e.id === enemyId);
  if (!enemy) return [];
  return enemyFootprintTiles(enemy.x, enemy.y, getEnemyScale(enemy));
}

export function enemyDirectAttackTargetPlayerIds(
  state: GameState,
  enemyId: string,
  parsed: ParsedEnemyAttack,
  occupancy?: ReturnType<typeof buildBoardOccupancy>,
): string[] {
  const range = parsed.range ?? 1;
  const occ = occupancy ?? buildBoardOccupancy(state);
  const ids = new Set<string>();
  for (const origin of enemyAttackOriginTiles(state, enemyId)) {
    for (const key of rangeAttackTileKeys(state, origin, range)) {
      const p = occ.playerByKey.get(key);
      if (p) ids.add(p.id);
    }
  }
  return [...ids];
}

export function enemyDirectAttackTargetEnemyIds(
  state: GameState,
  sourceEnemyId: string,
  parsed: ParsedEnemyAttack,
  occupancy?: ReturnType<typeof buildBoardOccupancy>,
): string[] {
  const range = parsed.range ?? 1;
  const occ = occupancy ?? buildBoardOccupancy(state);
  const sourceGroup = swarmGroupForEnemy(state, sourceEnemyId);
  const sourceCanonical = sourceGroup?.canonicalId ?? sourceEnemyId;
  const ids = new Set<string>();

  if (range <= 1 && /adjacent/i.test(parsed.raw)) {
    const sourceTiles = enemyAttackOriginTiles(state, sourceEnemyId);
    for (const enemy of state.enemies) {
      if ((enemy.hp ?? 0) <= 0) continue;
      const targetCanonical = swarmGroupForEnemy(state, enemy.id)?.canonicalId ?? enemy.id;
      if (targetCanonical === sourceCanonical) continue;
      const targetTiles = enemyFootprintTiles(enemy.x, enemy.y, getEnemyScale(enemy));
      const adjacent = sourceTiles.some((st) =>
        targetTiles.some((tt) => isOrthogonallyAdjacent(st, tt)),
      );
      if (adjacent) ids.add(targetCanonical);
    }
    return [...ids];
  }

  for (const origin of enemyAttackOriginTiles(state, sourceEnemyId)) {
    for (const key of rangeAttackTileKeys(state, origin, range)) {
      const enemy = occ.enemyByKey.get(key);
      if (!enemy || (enemy.hp ?? 0) <= 0) continue;
      const targetCanonical = swarmGroupForEnemy(state, enemy.id)?.canonicalId ?? enemy.id;
      if (targetCanonical === sourceCanonical) continue;
      ids.add(targetCanonical);
    }
  }
  return [...ids];
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
  const dmgExplicit = text.match(/Damage:(\d+)/i);
  if (dmgExplicit) result.damage = Number(dmgExplicit[1]);
  else {
    const dmg = text.match(/deal\s+(\d+)\s+damage/i);
    if (dmg) result.damage = Number(dmg[1]);
  }
  const effects: string[] = [];
  for (const m of text.matchAll(/(Bleed|Slow|Blazing|Pin|Push|Shock):(\d+)/gi)) {
    effects.push(`${m[1]}:${m[2]}`);
  }
  if (effects.length) result.effects = effects;
  return result;
}
