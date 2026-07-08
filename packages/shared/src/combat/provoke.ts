import type { BoardCoord } from "../patterns.js";
import { isOrthogonallyAdjacent } from "../patterns.js";
import type { Enemy, GameState, MapTile, Player } from "../types.js";
import { enemyLabel, playerLabel } from "../console.js";
import { enemyFootprintTiles, enemyOccupiesTile, getEnemyMaxHpByName, getEnemyScale } from "../enemy-data.js";
import { tileAt } from "../map.js";
import { rollDice } from "./damage.js";
import { applyDamageToEnemy, applyDamageToPlayer, manhattanDistance } from "./attack.js";
import { playerArmorGearName } from "./attractor.js";
import {
  buildSwarmGroups,
  enemyHasSwarmTrait,
  pickSwarmMoveMember,
  reconcileSwarmHp,
  swarmGroupForEnemy,
} from "./swarm.js";
import { isTowerEnemy } from "./yadathan.js";
import { createDefaultCombatState } from "./types.js";

export const MURIEL_ARMOR_NAME = "MURIEL";
export const JEHOEL_ARMOR_NAME = "JEHOEL";
export const KOPIS_CLASS_NAME = "KOPIS";
export const EXPANDED_AGGRESSION_GEAR = "Expanded Aggression Rituals (Armor)";

export type ProvokeTrigger = {
  sourceId: string;
  sourceKind: "enemy" | "player";
  label: string;
  dice: number;
};

export type ProvokeOpts = {
  forced?: boolean;
  skipProvoke?: boolean;
  flying?: boolean;
};

export type ProvokeResult = {
  totalDamage: number;
  detail: string;
  rolls: number[];
  kopisDetail?: string;
};

function isMurielArmor(armor: string | undefined): boolean {
  return armor === MURIEL_ARMOR_NAME;
}

function isJehoelArmor(armor: string | undefined): boolean {
  return armor === JEHOEL_ARMOR_NAME;
}

function isKopisClass(cls: string | undefined): boolean {
  return cls === KOPIS_CLASS_NAME;
}

export function isSpecialTerrainTile(tile: MapTile | null | undefined): boolean {
  if (!tile) return false;
  return tile.terrain.some((t) => t !== "standard");
}

export function getProvokeThreatRange(state: GameState, player: Player): number {
  const until = player.counters?.provokeRangeUntilRound;
  if (until != null && state.round <= until) return 2;
  return 1;
}

function passedEnemyIds(state: GameState, playerId: string): Set<string> {
  const list = state.combat?.passedEnemyIdsByPlayer?.[playerId];
  if (!list?.length) return new Set();
  return new Set(list);
}

function addPassedEnemyIds(state: GameState, playerId: string, ids: Iterable<string>): void {
  if (!state.combat) state.combat = createDefaultCombatState(state.players.length);
  const existing = new Set(state.combat.passedEnemyIdsByPlayer?.[playerId] ?? []);
  for (const id of ids) existing.add(id);
  if (!state.combat.passedEnemyIdsByPlayer) state.combat.passedEnemyIdsByPlayer = {};
  state.combat.passedEnemyIdsByPlayer[playerId] = [...existing];
}

export function recordPassedEnemiesOnPath(
  state: GameState,
  player: Player,
  path: BoardCoord[],
): void {
  if (!isMurielArmor(player.armor)) return;
  const ids = passedEnemyIds(state, player.id);
  for (const step of path) {
    for (const enemy of state.enemies) {
      if (isTowerEnemy(enemy)) continue;
      if (!isEnemyAlive(enemy)) continue;
      for (const tile of enemyFootprintTiles(enemy.x, enemy.y, getEnemyScale(enemy))) {
        if (tile.x === step.x && tile.y === step.y) ids.add(enemy.id);
      }
    }
  }
  if (ids.size > 0) addPassedEnemyIds(state, player.id, ids);
}

export function clearMurielPassedEnemies(state: GameState, playerId: string): void {
  if (!state.combat?.passedEnemyIdsByPlayer?.[playerId]) return;
  delete state.combat.passedEnemyIdsByPlayer[playerId];
  if (Object.keys(state.combat.passedEnemyIdsByPlayer).length === 0) {
    delete state.combat.passedEnemyIdsByPlayer;
  }
}

function minDistanceToTiles(
  pos: BoardCoord,
  tiles: BoardCoord[],
): number {
  let min = Infinity;
  for (const t of tiles) {
    min = Math.min(min, manhattanDistance(pos, t));
  }
  return min;
}

function enemyOccupancyTiles(enemy: Enemy): BoardCoord[] {
  return enemyFootprintTiles(enemy.x, enemy.y, getEnemyScale(enemy));
}

function swarmMemberPositions(
  state: GameState,
  memberIds: string[],
): { x: number; y: number; id: string }[] {
  return memberIds
    .map((id) => {
      const e = state.enemies.find((en) => en.id === id);
      return e ? { x: e.x, y: e.y, id: e.id } : null;
    })
    .filter(Boolean) as { x: number; y: number; id: string }[];
}

function countSwarmTilesAdjacentToPos(
  positions: { x: number; y: number }[],
  pos: BoardCoord,
): number {
  let count = 0;
  for (const p of positions) {
    if (isOrthogonallyAdjacent(p, pos)) count++;
  }
  return count;
}

function isEnemyAlive(enemy: Enemy): boolean {
  const maxHp = getEnemyMaxHpByName(enemy.name) || 10;
  return (enemy.hp ?? maxHp) > 0;
}

function isAdjacentToEnemyFootprint(pos: BoardCoord, enemy: Enemy): boolean {
  return enemyOccupancyTiles(enemy).some((t) => isOrthogonallyAdjacent(pos, t));
}

function inProvokeRange(
  pos: BoardCoord,
  enemy: Enemy,
  range: number,
  swarmMemberTiles?: BoardCoord[],
): boolean {
  if (range <= 1) {
    if (swarmMemberTiles?.length) {
      return swarmMemberTiles.some((t) => isOrthogonallyAdjacent(pos, t));
    }
    return isAdjacentToEnemyFootprint(pos, enemy);
  }
  if (swarmMemberTiles?.length) {
    return minDistanceToTiles(pos, swarmMemberTiles) <= range;
  }
  return minDistanceToTiles(pos, enemyOccupancyTiles(enemy)) <= range;
}

function stepJehoelImmune(state: GameState, player: Player, from: BoardCoord, to: BoardCoord): boolean {
  if (!isJehoelArmor(player.armor)) return false;
  const fromTile = tileAt(state.tiles, from.x, from.y);
  const toTile = tileAt(state.tiles, to.x, to.y);
  return isSpecialTerrainTile(fromTile) || isSpecialTerrainTile(toTile);
}

function collectPlayerStepProvokes(
  state: GameState,
  player: Player,
  from: BoardCoord,
  to: BoardCoord,
  opts: ProvokeOpts,
): ProvokeTrigger[] {
  if (opts.forced || opts.skipProvoke || opts.flying) return [];
  if (stepJehoelImmune(state, player, from, to)) return [];

  const threatRange = getProvokeThreatRange(state, player);
  const murielPassed = isMurielArmor(player.armor) ? passedEnemyIds(state, player.id) : null;
  const triggers: ProvokeTrigger[] = [];
  const visitedSwarmGroups = new Set<string>();

  for (const enemy of state.enemies) {
    if (isTowerEnemy(enemy) || !isEnemyAlive(enemy)) continue;
    if (murielPassed?.has(enemy.id)) continue;

    const group = swarmGroupForEnemy(state, enemy.id);
    if (group && enemyHasSwarmTrait(enemy) && getEnemyScale(enemy) <= 1) {
      if (visitedSwarmGroups.has(group.canonicalId)) continue;
      visitedSwarmGroups.add(group.canonicalId);

      const positions = swarmMemberPositions(state, group.memberIds);
      const memberTiles = positions.map((p) => ({ x: p.x, y: p.y }));
      const wasInRange = threatRange > 1
        ? minDistanceToTiles(from, memberTiles) <= threatRange
        : countSwarmTilesAdjacentToPos(positions, from) > 0;
      if (!wasInRange) continue;
      const stillInRange = threatRange > 1
        ? minDistanceToTiles(to, memberTiles) <= threatRange
        : countSwarmTilesAdjacentToPos(positions, to) > 0;
      if (!stillInRange) {
        const member = state.enemies.find((e) => e.id === group.canonicalId);
        triggers.push({
          sourceId: group.canonicalId,
          sourceKind: "enemy",
          label: member ? enemyLabel(member) : enemyLabel(enemy),
          dice: 1,
        });
      }
      continue;
    }

    const wasInRange = inProvokeRange(from, enemy, threatRange);
    if (!wasInRange) continue;
    if (inProvokeRange(to, enemy, threatRange)) continue;
    triggers.push({
      sourceId: enemy.id,
      sourceKind: "enemy",
      label: enemyLabel(enemy),
      dice: 1,
    });
  }

  return triggers;
}

function collectEnemyStepProvokes(
  state: GameState,
  enemyId: string,
  from: BoardCoord,
  to: BoardCoord,
  opts: ProvokeOpts & { soloSwarmMember?: boolean },
): ProvokeTrigger[] {
  if (opts.forced || opts.skipProvoke) return [];
  const enemy = state.enemies.find((e) => e.id === enemyId);
  if (!enemy || isTowerEnemy(enemy)) return [];

  const group = !opts.soloSwarmMember ? swarmGroupForEnemy(state, enemyId) : null;
  if (group && group.memberIds.length >= 2) {
    const moverId = pickSwarmMoveMember(state, group.memberIds, to.x, to.y) ?? enemyId;
    const before = swarmMemberPositions(state, group.memberIds);
    const after = before.map((p) => (p.id === moverId ? { ...p, x: to.x, y: to.y } : p));
    const triggers: ProvokeTrigger[] = [];

    for (const player of state.players) {
      const beforeAdj = countSwarmTilesAdjacentToPos(before, player);
      const afterAdj = countSwarmTilesAdjacentToPos(after, player);
      if (beforeAdj > 0 && afterAdj === 0) {
        triggers.push({
          sourceId: player.id,
          sourceKind: "player",
          label: playerLabel(player),
          dice: 1,
        });
      }
    }
    return triggers;
  }

  const scale = getEnemyScale(enemy);
  const beforeTiles = enemyFootprintTiles(from.x, from.y, scale);
  const afterTiles = enemyFootprintTiles(to.x, to.y, scale);
  const triggers: ProvokeTrigger[] = [];

  for (const player of state.players) {
    const wasAdj = beforeTiles.some((t) => isOrthogonallyAdjacent(t, player));
    if (!wasAdj) continue;
    const stillAdj = afterTiles.some((t) => isOrthogonallyAdjacent(t, player));
    if (!stillAdj) {
      triggers.push({
        sourceId: player.id,
        sourceKind: "player",
        label: playerLabel(player),
        dice: 1,
      });
    }
  }

  return triggers;
}

export function collectPathProvokeTriggers(
  state: GameState,
  playerId: string,
  path: BoardCoord[],
  opts: ProvokeOpts = {},
): ProvokeTrigger[] {
  const player = state.players.find((p) => p.id === playerId);
  if (!player || path.length === 0) return [];

  const all: ProvokeTrigger[] = [];
  let cx = player.x;
  let cy = player.y;
  const passed = isMurielArmor(player.armor) ? new Set(passedEnemyIds(state, playerId)) : null;

  for (const step of path) {
    const from = { x: cx, y: cy };
    const stepOpts = { ...opts };
    if (passed) {
      const triggers = collectPlayerStepProvokes(state, player, from, step, stepOpts);
      for (const t of triggers) {
        if (t.sourceKind === "enemy" && passed.has(t.sourceId)) continue;
        all.push(t);
      }
      for (const enemy of state.enemies) {
        if (isTowerEnemy(enemy)) continue;
        for (const tile of enemyFootprintTiles(enemy.x, enemy.y, getEnemyScale(enemy))) {
          if (tile.x === step.x && tile.y === step.y) passed.add(enemy.id);
        }
      }
    } else {
      all.push(...collectPlayerStepProvokes(state, player, from, step, stepOpts));
    }
    cx = step.x;
    cy = step.y;
  }
  return all;
}

export function previewPathProvokes(
  state: GameState,
  playerId: string,
  path: BoardCoord[],
  opts: ProvokeOpts = {},
): ProvokeTrigger[] {
  return collectPathProvokeTriggers(state, playerId, path, opts);
}

export function previewEnemyMoveProvokes(
  state: GameState,
  enemyId: string,
  toX: number,
  toY: number,
  opts: ProvokeOpts & { soloSwarmMember?: boolean } = {},
): ProvokeTrigger[] {
  const enemy = state.enemies.find((e) => e.id === enemyId);
  if (!enemy) return [];
  return collectEnemyStepProvokes(
    state,
    enemyId,
    { x: enemy.x, y: enemy.y },
    { x: toX, y: toY },
    opts,
  );
}

export function previewSprintProvokes(
  state: GameState,
  playerId: string,
  toX: number,
  toY: number,
  opts: ProvokeOpts = {},
): ProvokeTrigger[] {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return [];
  return collectPlayerStepProvokes(
    state,
    player,
    { x: player.x, y: player.y },
    { x: toX, y: toY },
    opts,
  );
}

function isTileFreeForPush(state: GameState, x: number, y: number, excludeEnemyId: string): boolean {
  if (x < 0 || y < 0 || x >= state.width || y >= state.height) return false;
  for (const p of state.players) {
    if (p.x === x && p.y === y) return false;
  }
  for (const e of state.enemies) {
    if (e.id === excludeEnemyId) continue;
    if (enemyOccupiesTile(e, x, y)) return false;
  }
  return true;
}

function tryPushEnemyFromPlayer(
  state: GameState,
  player: Player,
  enemy: Enemy,
): string | null {
  const dx = enemy.x - player.x;
  const dy = enemy.y - player.y;
  const pushX = enemy.x + Math.sign(dx);
  const pushY = enemy.y + Math.sign(dy);
  if (!isTileFreeForPush(state, pushX, pushY, enemy.id)) return null;
  const prevGroups = buildSwarmGroups(state);
  enemy.x = pushX;
  enemy.y = pushY;
  reconcileSwarmHp(state, prevGroups);
  return `pushed ${enemyLabel(enemy)}`;
}

export function applyKopisRetaliation(
  state: GameState,
  player: Player,
  triggers: ProvokeTrigger[],
  rng = Math.random,
): string | undefined {
  if (!isKopisClass(player.class)) return undefined;
  if (!player.counters?.movedThisTurn) return undefined;
  const enemyTriggers = triggers.filter((t) => t.sourceKind === "enemy");
  if (!enemyTriggers.length) return undefined;

  const parts: string[] = [];
  for (const trigger of enemyTriggers) {
    const enemy = state.enemies.find((e) => e.id === trigger.sourceId);
    if (!enemy || !isEnemyAlive(enemy)) continue;
    const roll = rollDice(1, 6, rng)[0]!;
    applyDamageToEnemy(enemy, roll, state);
    let part = `${enemyLabel(enemy)} ${roll}`;
    if (roll >= 4) {
      const pushed = tryPushEnemyFromPlayer(state, player, enemy);
      if (pushed) part += ` (${pushed})`;
    }
    parts.push(part);
  }
  if (!parts.length) return undefined;
  return `Offhand Pistol → ${parts.join(", ")}`;
}

export function resolveProvokeTriggers(
  state: GameState,
  mover: { kind: "player"; player: Player } | { kind: "enemy"; enemy: Enemy },
  triggers: ProvokeTrigger[],
  rng = Math.random,
): ProvokeResult {
  if (!triggers.length) {
    return { totalDamage: 0, detail: "", rolls: [] };
  }

  const rolls = triggers.flatMap(() => rollDice(1, 6, rng));
  const totalDamage = rolls.reduce((a, b) => a + b, 0);
  const detail = rolls.length === 1
    ? `[${rolls[0]}]=${totalDamage}`
    : `${rolls.map((r) => `[${r}]`).join("+")}=${totalDamage}`;

  if (mover.kind === "player") {
    applyDamageToPlayer(mover.player, totalDamage, state);
  } else {
    applyDamageToEnemy(mover.enemy, totalDamage, state);
  }

  let kopisDetail: string | undefined;
  if (mover.kind === "player") {
    kopisDetail = applyKopisRetaliation(state, mover.player, triggers, rng);
  }

  return { totalDamage, detail, rolls, kopisDetail };
}

export function applyProvokeAndFormat(
  state: GameState,
  mover: { kind: "player"; player: Player } | { kind: "enemy"; enemy: Enemy },
  triggers: ProvokeTrigger[],
  rng = Math.random,
): string {
  if (!triggers.length) return "";
  const result = resolveProvokeTriggers(state, mover, triggers, rng);
  const who = mover.kind === "player" ? playerLabel(mover.player) : enemyLabel(mover.enemy);
  let msg = `Provoke ${result.detail} → ${who}`;
  if (result.kopisDetail) msg += `; ${result.kopisDetail}`;
  return msg;
}

export function activateExpandedAggressionGear(state: GameState, player: Player): string | null {
  if (playerArmorGearName(player) !== EXPANDED_AGGRESSION_GEAR) return null;
  if (!player.counters) player.counters = {};
  player.counters.provokeRangeUntilRound = state.round + 1;
  return "Provoke range extended to Range:2 until end of next turn";
}

export function tickProvokeRangeGear(state: GameState): void {
  for (const player of state.players) {
    const until = player.counters?.provokeRangeUntilRound;
    if (until != null && state.round > until) {
      delete player.counters!.provokeRangeUntilRound;
      if (Object.keys(player.counters!).length === 0) delete player.counters;
    }
  }
}
