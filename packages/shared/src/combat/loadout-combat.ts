import type { GameState, Player, Enemy } from "../types.js";
import type { PlayerAction } from "./types.js";
import { getClassMaxHp } from "../player-data.js";
import { playerLabel, enemyLabel } from "../console.js";
import { coordKey, isInBounds, isWalkable, tileAt } from "../map.js";
import { isOrthogonallyAdjacent } from "../patterns.js";
import {
  applyDamageToEnemy,
  applyDamageToPlayer,
  manhattanDistance,
  resolveCombatAttackSpec,
} from "./attack.js";
import { applyEffectStacks, setTileEffect } from "./effects.js";
import { buildBoardOccupancy } from "../game.js";
import { maxWeaponDamage, rollDice } from "./damage.js";
import { hasLineOfSight } from "./los.js";
import { MURIEL_ARMOR_NAME } from "./provoke.js";
import { MALAKBEL_ARMOR_NAME } from "./armor-kit.js";
import { weaponHasBreakerTag } from "./swarm.js";

export const SHATTERING_BLADE = "Ten Thousand Year Reign Shattering Blade";
export const LANGUAGE_OF_KINGS = "She Speaks The Language Of Kings";
export const HEAVEN_BURNING_SWORD = "Heaven Burning Sword";
export const HEAVEN_OR_HELL = "Heaven Or Hell";
export const AMBIGUOUS_INTENTIONS = "Ambiguous Intentions";
export const LOVE_WITHOUT_CONSIDERATION = "Love Without Consideration";
export const MONADIC_ARRAY = "Monadic Offense Manifestation Array";

function ensureCombatMarks(state: GameState): Record<string, string[]> {
  if (!state.combat) state.combat = { playerCountAtStart: state.players.length, pendingActions: [], pendingReaction: null, pendingClassReaction: null, activeEnemyId: null };
  if (!state.combat.kingsMarksByPlayer) state.combat.kingsMarksByPlayer = {};
  return state.combat.kingsMarksByPlayer;
}

export function resolveAttackUseBreaker(
  player: Player,
  weaponName: string | undefined,
  explicit?: boolean,
): boolean {
  if (explicit) return true;
  return weaponHasBreakerTag(player, weaponName ?? player.weapon);
}

export function applyPostAttackLoadoutHooks(
  state: GameState,
  player: Player,
  weaponName: string | undefined,
  hitEnemyIds: string[],
  attackTileKeys: Set<string>,
): string[] {
  const messages: string[] = [];
  const weapon = weaponName ?? player.weapon;
  if (!weapon) return messages;

  if (weapon === HEAVEN_BURNING_SWORD) {
    if (!player.counters) player.counters = {};
    player.counters.heavenBurningLevel = 1;
  }

  if (weapon === AMBIGUOUS_INTENTIONS) {
    const kills = hitEnemyIds.filter((id) => {
      const e = state.enemies.find((x) => x.id === id);
      return e && (e.hp ?? 0) <= 0;
    }).length;
    if (kills > 0) {
      if (!player.counters) player.counters = {};
      player.counters.ambiguousCharges = (player.counters.ambiguousCharges ?? 0) + kills;
    }
  }

  if (weapon === LOVE_WITHOUT_CONSIDERATION && attackTileKeys.size >= 3) {
    const keys = [...attackTileKeys].slice(0, 3);
    for (const key of keys) {
      const [x, y] = key.split(",").map(Number);
      const tile = tileAt(state.tiles, x!, y!);
      if (tile) setTileEffect(tile, "Lingering:1");
    }
    messages.push("Persistent Will → Lingering on 3 tiles");
  }

  for (const id of hitEnemyIds) {
    const enemy = state.enemies.find((e) => e.id === id);
    if (!enemy || (enemy.hp ?? 0) > 0) continue;
    if (weapon === SHATTERING_BLADE) {
      if (!player.counters) player.counters = {};
      player.counters.eightFoldedKill = 1;
      messages.push("Eight-Folded — may move and free attack");
    }
    if (weapon === HEAVEN_OR_HELL) {
      applyEffectStacks(player, ["Juggle:1"]);
      messages.push("Schmovement → Juggle:1");
    }
  }

  if (!player.counters) player.counters = {};
  player.counters.attackedThisTurn = 1;
  return messages;
}

export function validateWeaponActiveStructured(
  state: GameState,
  player: Player,
  action: Extract<PlayerAction, { action: "weaponActive" }>,
): string | null {
  const weapon = player.weapon ?? "";
  if (weapon === HEAVEN_BURNING_SWORD) return null;
  if (weapon === LOVE_WITHOUT_CONSIDERATION) {
    const id = action.targetEnemyIds?.[0];
    if (!id) return "Select target";
    const enemy = state.enemies.find((e) => e.id === id);
    if (!enemy) return "Unknown enemy";
    if (manhattanDistance(player, enemy) > 4) return "Range 4";
    if (!hasLineOfSight(state, player.x, player.y, enemy.x, enemy.y)) return "No line of sight";
    return null;
  }
  if (weapon === AMBIGUOUS_INTENTIONS || weapon === MONADIC_ARRAY) return null;
  if (weapon === SHATTERING_BLADE) {
    if ((player.counters?.retaliation ?? 0) < 1) return "Need Retaliation";
    return null;
  }
  if (weapon === LANGUAGE_OF_KINGS) {
    if (!action.targetEnemyIds?.length) return "Select up to 3 enemies";
    if (action.targetEnemyIds.length > 3) return "Max 3 marks";
    return null;
  }
  return null;
}

export function applyWeaponActiveStructured(
  state: GameState,
  player: Player,
  action: Extract<PlayerAction, { action: "weaponActive" }>,
): string | null {
  const weapon = player.weapon ?? "";

  if (weapon === HEAVEN_BURNING_SWORD) {
    if (!player.counters) player.counters = {};
    const level = Math.min(3, (player.counters.heavenBurningLevel ?? 1) + 1);
    player.counters.heavenBurningLevel = level;
    return `${playerLabel(player)} Unfolding → Level ${level}`;
  }

  if (weapon === LOVE_WITHOUT_CONSIDERATION) {
    const primaryId = action.targetEnemyIds![0]!;
    const primary = state.enemies.find((e) => e.id === primaryId)!;
    const spec = resolveCombatAttackSpec(player, weapon)!;
    const dmg = maxWeaponDamage(spec.damage);
    applyDamageToEnemy(primary, dmg, state);
    applyEffectStacks(primary, ["Blazing:2"]);
    const adjacent = state.enemies.filter(
      (e) =>
        e.id !== primaryId &&
        (e.hp ?? 0) > 0 &&
        manhattanDistance(primary, e) === 1,
    );
    for (const adj of adjacent) {
      applyDamageToEnemy(adj, dmg, state);
      applyEffectStacks(adj, ["Blazing:2"]);
    }
    return `${playerLabel(player)} Hungry Flame → ${enemyLabel(primary)}${adjacent.length ? ` + ${adjacent.length} adjacent` : ""}`;
  }

  if (weapon === SHATTERING_BLADE) {
    if (!player.counters) player.counters = {};
    player.counters.roamingStrikes = 0;
    player.counters.retaliation = Math.max(0, (player.counters.retaliation ?? 0) - 1);
    applyEffectStacks(player, ["Armor:2", "Compel:1"]);
    return `${playerLabel(player)} Roaming Strikes charge attack`;
  }

  if (weapon === LANGUAGE_OF_KINGS) {
    const marksByPlayer = ensureCombatMarks(state);
    const marks = marksByPlayer[player.id] ?? [];
    for (const id of action.targetEnemyIds ?? []) {
      if (!marks.includes(id) && marks.length < 6) marks.push(id);
    }
    marksByPlayer[player.id] = marks;
    return `${playerLabel(player)} marked ${action.targetEnemyIds!.length} enemies`;
  }

  return null;
}

export function applyKushielPushRecoil(
  state: GameState,
  player: Player,
  targetEnemyId: string | undefined,
  targetPlayerId: string | undefined,
  push: number,
): string {
  const target = targetEnemyId
    ? state.enemies.find((e) => e.id === targetEnemyId)
    : state.players.find((p) => p.id === targetPlayerId);
  if (!target) return "Invalid target";
  if (!isOrthogonallyAdjacent(player, target)) return "Target not adjacent";

  const dx = Math.sign(target.x - player.x);
  const dy = Math.sign(target.y - player.y);
  let tx = target.x + dx * push;
  let ty = target.y + dy * push;
  if (!isInBounds(tx, ty, state.width, state.height) || !isWalkable(tileAt(state.tiles, tx, ty))) {
    tx = target.x;
    ty = target.y;
  }
  target.x = tx;
  target.y = ty;

  const recoilX = player.x - dx * push;
  const recoilY = player.y - dy * push;
  if (isInBounds(recoilX, recoilY, state.width, state.height) && isWalkable(tileAt(state.tiles, recoilX, recoilY))) {
    player.x = recoilX;
    player.y = recoilY;
  }

  const label = targetEnemyId ? enemyLabel(target as Enemy) : playerLabel(target as Player);
  return `${playerLabel(player)} Hasaphet's Palm → Push:${push} ${label}`;
}

export function applyMalakbelReversal(state: GameState, player: Player): string {
  const speed = player.speed ?? 7;
  player.x = Math.max(0, Math.min(state.width - 1, player.x + speed));
  return `Moved ${speed} spaces away from attack`;
}

export function applyAsmodelReversal(
  state: GameState,
  player: Player,
  allyIds: string[],
  incomingDamage: number,
): string {
  applyDamageToPlayer(player, incomingDamage, state);
  for (const id of allyIds) {
    const ally = state.players.find((p) => p.id === id);
    if (ally && manhattanDistance(player, ally) <= 3) {
      ally.hp = Math.min(getClassMaxHp(ally.class), (ally.hp ?? 0) + incomingDamage);
    }
  }
  player.hp = Math.min(getClassMaxHp(player.class), (player.hp ?? 0) + Math.floor(incomingDamage / 2));
  return `Took ${incomingDamage} for ally; healed nearby allies`;
}

export function applyMurielReversal(state: GameState, player: Player, incomingDamage: number): string {
  const hpCost = Math.min((player.hp ?? 1) - 1, incomingDamage);
  if (hpCost > 0) {
    player.hp = (player.hp ?? 0) - hpCost;
  }
  const total = incomingDamage + hpCost;
  const enemies = state.enemies.filter((e) => manhattanDistance(player, e) <= 2 && (e.hp ?? 0) > 0);
  for (const enemy of enemies) {
    applyDamageToEnemy(enemy, total, state);
  }
  const occ = buildBoardOccupancy(state);
  const landing = { x: player.x, y: player.y };
  for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
    const nx = player.x + dx!;
    const ny = player.y + dy!;
    const key = coordKey(nx, ny);
    if (isWalkable(tileAt(state.tiles, nx, ny)) && !occ.playerByKey.has(key) && !occ.enemyByKey.has(key)) {
      landing.x = nx;
      landing.y = ny;
      break;
    }
  }
  player.x = landing.x;
  player.y = landing.y;
  return `Flashburst reversal for ${total} in Burst:2`;
}

export function applyStructuredReversalEffect(
  state: GameState,
  player: Player,
  armorName: string,
  incomingDamage: number,
  extraAllyIds: string[],
): string | null {
  if (armorName === MALAKBEL_ARMOR_NAME) return applyMalakbelReversal(state, player);
  if (armorName === "ASMODEL") return applyAsmodelReversal(state, player, extraAllyIds, incomingDamage);
  if (armorName === MURIEL_ARMOR_NAME) return applyMurielReversal(state, player, incomingDamage);
  if (armorName === "KUSHIEL") {
    return `${playerLabel(player)} KUSHIEL reversal (table: collision damage)`;
  }
  return null;
}

export function validateChrysAorActive(
  state: GameState,
  player: Player,
  action: Extract<PlayerAction, { action: "classActive" }>,
): string | null {
  const targetId = action.targetEnemyIds?.[0] ?? action.targetPlayerIds?.[0];
  if (!targetId) return "Select target";
  const enemy = state.enemies.find((e) => e.id === targetId);
  const ally = state.players.find((p) => p.id === targetId);
  if (!enemy && !ally) return "Unknown target";
  const target = enemy ?? ally!;
  if (!hasLineOfSight(state, player.x, player.y, target.x, target.y)) return "No line of sight";
  return null;
}

export function applyChrysAorActive(
  state: GameState,
  player: Player,
  action: Extract<PlayerAction, { action: "classActive" }>,
): string {
  const targetId = action.targetEnemyIds?.[0] ?? action.targetPlayerIds?.[0];
  if (!targetId) return `${playerLabel(player)} Soul-Branding — no target`;
  const enemy = state.enemies.find((e) => e.id === targetId);
  if (enemy) {
    applyEffectStacks(enemy, ["Brand:2"]);
    return `${playerLabel(player)} Soul-Branding → ${enemyLabel(enemy)} Brand:2`;
  }
  const ally = state.players.find((p) => p.id === targetId)!;
  applyEffectStacks(ally, ["Brand:2"]);
  return `${playerLabel(player)} Soul-Branding → ${playerLabel(ally)} Brand:2`;
}

export function tickBrandStacks(state: GameState): string[] {
  const messages: string[] = [];
  for (const enemy of state.enemies) {
    const brand = enemy.effects?.Brand ?? 0;
    if (brand <= 0) continue;
    const next = brand - 1;
    if (next <= 0) {
      const roll = rollDice(4, 6);
      const total = roll.reduce((a, b) => a + b, 0) + 4;
      applyDamageToEnemy(enemy, total, state);
      const burst = 6;
      for (const adj of state.enemies.filter((e) => e.id !== enemy.id && manhattanDistance(enemy, e) === 1)) {
        applyDamageToEnemy(adj, burst, state);
      }
      if (enemy.effects) delete enemy.effects.Brand;
      messages.push(`${enemyLabel(enemy)} Brand detonated (${total}+${burst} adjacent)`);
    } else if (enemy.effects) {
      enemy.effects.Brand = next;
    }
  }
  return messages;
}
