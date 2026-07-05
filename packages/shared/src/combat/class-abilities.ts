import type { GameState, Player, Enemy } from "../types.js";
import type { PlayerAction, ActionTier, ThrownTrap } from "./types.js";
import {
  getClassActiveKind,
  getClassActiveTier,
  getGearByName,
} from "../player-data.js";
import { getUnlockedOptions } from "../base-upgrades-unlocks.js";
import { playerLabel, enemyLabel } from "../console.js";
import { coordKey, isWalkable, tileAt } from "../map.js";
import { isOrthogonallyAdjacent } from "../patterns.js";
import { hasLineOfSight, tilesOnCardinalLine } from "./los.js";
import {
  applyAttackToEnemies,
  applyDamageToEnemy,
  collectAttackTiles,
  getWeaponAttackSpec,
  manhattanDistance,
  resolveCombatAttackSpec,
} from "./attack.js";
import { maxWeaponDamage, rollDice } from "./damage.js";
import { applyPullToward } from "./pull.js";
import { placeAttractor, applyAttractorEntryPulls, getAttractorAt } from "./attractor.js";

export const HARPE_CLASS = "HARPE";
export const KOPIS_CLASS = "KOPIS";
export const SHARUR_CLASS = "SHARUR";
export const VARUNASTRA_CLASS = "VARUNASTRA";
export const HEPHAESTUS_CLASS = "HEPHAESTUS";
export const EPEUS_CLASS = "EPEUS";

function ensureCombat(state: GameState): boolean {
  if (!state.combat) return false;
  if (!state.combat.thrownTraps) state.combat.thrownTraps = [];
  if (!state.combat.boardTokens) state.combat.boardTokens = [];
  if (!state.combat.attractors) state.combat.attractors = [];
  if (!state.combat.kopisMarks) state.combat.kopisMarks = {};
  return true;
}

function getThrownTrap(state: GameState, ownerId: string): ThrownTrap | undefined {
  return state.combat?.thrownTraps?.find((t) => t.ownerId === ownerId);
}

export function validateClassActive(
  state: GameState,
  player: Player,
  action: Extract<PlayerAction, { action: "classActive" }>,
): string | null {
  const kind = action.kind ?? getClassActiveKind(player.class);
  if (!kind) return "Class has no structured active";

  if (player.class === HARPE_CLASS) {
    if (action.harpeRecall) {
      if (!getThrownTrap(state, player.id)) return "No thrown weapon";
      return null;
    }
    if (action.x == null || action.y == null) return "Select trap destination";
    if (!isOrthogonallyAdjacent(player, { x: action.x, y: action.y }) &&
        !(player.x === action.x || player.y === action.y)) {
      const dx = Math.sign(action.x - player.x);
      const dy = Math.sign(action.y - player.y);
      if (dx === 0 && dy === 0) return "Invalid direction";
      if (dx !== 0 && dy !== 0) return "Must throw cardinally";
    }
    const dx = Math.sign(action.x - player.x);
    const dy = Math.sign(action.y - player.y);
    if (dx === 0 && dy === 0) return "Select a direction";
    if (dx !== 0 && dy !== 0) return "Must throw cardinally";
    const dist = Math.abs(action.x - player.x) + Math.abs(action.y - player.y);
    if (dist < 1 || dist > 6) return "Range 1–6";
    if (!player.weapon) return "No weapon equipped";
    if (!hasLineOfSight(state, player.x, player.y, action.x, action.y)) return "No line of sight";
    if (!isWalkable(tileAt(state.tiles, action.x, action.y))) return "Blocked";
    return null;
  }

  if (player.class === KOPIS_CLASS) {
    const enemyId = action.targetEnemyIds?.[0];
    if (!enemyId) return "Select enemy";
    const enemy = state.enemies.find((e) => e.id === enemyId);
    if (!enemy) return "Unknown enemy";
    if (!hasLineOfSight(state, player.x, player.y, enemy.x, enemy.y)) return "No line of sight";
    return null;
  }

  if (player.class === SHARUR_CLASS) {
    if (action.x == null || action.y == null) return "Select tile";
    if (manhattanDistance(player, { x: action.x, y: action.y }) > 4) return "Out of range";
    if (!isWalkable(tileAt(state.tiles, action.x, action.y))) return "Invalid tile";
    if (getAttractorAt(state, action.x, action.y)) return "Already has attractor";
    return null;
  }

  if (player.class === HEPHAESTUS_CLASS) {
    const enemyId = action.targetEnemyIds?.[0];
    if (!enemyId) return "Select adjacent enemy";
    const enemy = state.enemies.find((e) => e.id === enemyId);
    if (!enemy) return "Unknown enemy";
    if (manhattanDistance(player, enemy) > 1) return "Range 1";
    return null;
  }

  if (player.class === EPEUS_CLASS) {
    if (!action.gearSlot || !action.gearName) return "Select gear to swap";
    const gear = getGearByName(action.gearName);
    if (!gear) return "Unknown gear";
    if (gear.slot !== action.gearSlot) return "Wrong gear slot";
    const unlocked = getUnlockedOptions(state.constructedBaseUpgrades ?? []);
    if (!unlocked.gear.includes(action.gearName)) return "Gear not unlocked";
    return null;
  }

  if (player.class === VARUNASTRA_CLASS) {
    if (!action.allyPlayerId) return "Select ally";
    const ally = state.players.find((p) => p.id === action.allyPlayerId);
    if (!ally?.weapon) return "Ally has no weapon";
    if (!action.direction) return "Select attack direction";
    return null;
  }

  return `Unsupported class active: ${kind}`;
}

export function validateClassPassive(
  state: GameState,
  player: Player,
  action: Extract<PlayerAction, { action: "classPassive" }>,
): string | null {
  if (action.kind === "baseline_communism" && player.class === HEPHAESTUS_CLASS) {
    const ally = state.players.find((p) => p.id === action.targetPlayerId);
    if (!ally) return "Unknown ally";
    if (!isOrthogonallyAdjacent(player, ally)) return "Ally must be adjacent";
    if ((player.equipmentUses ?? 0) <= 0) return "No equipment to spend";
    if ((ally.equipmentUses ?? 0) > 0) return "Ally still has equipment";
    return null;
  }
  return "Unknown class passive";
}

export function validateResolveClassReaction(
  state: GameState,
  playerId: string,
  action: Extract<PlayerAction, { action: "resolveClassReaction" }>,
): string | null {
  const reaction = state.combat?.pendingClassReaction;
  if (!reaction) return "No pending reaction";
  if (reaction.playerId !== playerId) return "Not your reaction";
  if (reaction.kind === "harpe_trap_pull") {
    if (action.pullDistance == null || action.pullDistance < 0) return "Invalid pull distance";
    if (!action.pullToward) return "Choose pull direction";
    return null;
  }
  if (reaction.kind === "borrowing_follow_up") {
    if (action.accept === undefined) return "Choose follow-up";
    return null;
  }
  return "Unknown reaction";
}

export function applyClassActive(
  state: GameState,
  playerId: string,
  action: Extract<PlayerAction, { action: "classActive" }>,
): string {
  const player = state.players.find((p) => p.id === playerId)!;
  if (!ensureCombat(state)) return "No combat state";

  if (player.class === HARPE_CLASS) {
    if (action.harpeRecall) {
      return recallHarpeWeapon(state, player, action.harpeEquipWeapon);
    }
    const weaponName = player.weapon!;
    const trap: ThrownTrap = {
      ownerId: player.id,
      weaponName,
      x: action.x!,
      y: action.y!,
      originX: player.x,
      originY: player.y,
    };
    state.combat!.thrownTraps = state.combat!.thrownTraps!.filter((t) => t.ownerId !== player.id);
    state.combat!.thrownTraps!.push(trap);
    player.weapon = undefined;
    return `${playerLabel(player)} threw ${weaponName} to (${trap.x}, ${trap.y})`;
  }

  if (player.class === KOPIS_CLASS) {
    const enemyId = action.targetEnemyIds![0]!;
    state.combat!.kopisMarks![player.id] = enemyId;
    const enemy = state.enemies.find((e) => e.id === enemyId)!;
    return `${playerLabel(player)} Mag Dump → marked ${enemyLabel(enemy)}`;
  }

  if (player.class === SHARUR_CLASS) {
    placeAttractor(state, player.id, action.x!, action.y!);
    return `${playerLabel(player)} Back Up → attractor at (${action.x}, ${action.y})`;
  }

  if (player.class === HEPHAESTUS_CLASS) {
    const enemy = state.enemies.find((e) => e.id === action.targetEnemyIds![0])!;
    const roll = rollDice(1, 6)[0]!;
    applyDamageToEnemy(enemy, roll, state);
    let msg = `${playerLabel(player)} Synesis Conversion → ${enemyLabel(enemy)} ${roll}`;
    if ((enemy.hp ?? 0) <= 0) {
      player.equipmentUses = 1;
      msg += "; Equipment restored";
    }
    return msg;
  }

  if (player.class === EPEUS_CLASS) {
    if (action.gearSlot === "weapon") {
      player.gear = action.gearName;
    } else {
      player.gearArmor = action.gearName;
    }
    return `${playerLabel(player)} Bag of Tricks → ${action.gearName}`;
  }

  if (player.class === VARUNASTRA_CLASS) {
    const ally = state.players.find((p) => p.id === action.allyPlayerId)!;
    const borrowedSpec = getWeaponAttackSpec(ally.weapon!);
    if (!borrowedSpec) return "Ally weapon has no attack";
    const ownSpec = resolveCombatAttackSpec(player, player.weapon ?? "");
    const attackSpec = { ...borrowedSpec, damage: ownSpec?.damage ?? borrowedSpec.damage };
    const origin = { x: player.x, y: player.y };
    const anchor =
      action.anchorX != null && action.anchorY != null
        ? { x: action.anchorX, y: action.anchorY }
        : origin;
    const result = applyAttackToEnemies(
      state,
      attackSpec,
      anchor,
      action.direction!,
      undefined,
      { weaponName: player.weapon },
    );
    let msg = `${playerLabel(player)} Borrowing This (${ally.weapon}) → ${result.detail}`;

    if (ownSpec && result.targets.length) {
      const ownTiles = collectAttackTiles(state, anchor, ownSpec, action.direction!);
      const ownTileKeys = new Set(ownTiles.map((t) => coordKey(t.x, t.y)));
      const extraTargets = result.targets.filter((t) => !ownTileKeys.has(coordKey(t.x, t.y)));
      if (extraTargets.length) {
        state.combat!.pendingClassReaction = {
          kind: "borrowing_follow_up",
          playerId: player.id,
          allyPlayerId: action.allyPlayerId!,
          direction: action.direction!,
          anchorX: action.anchorX,
          anchorY: action.anchorY,
          extraEnemyIds: extraTargets.map((t) => t.enemyId),
          maxDamage: maxWeaponDamage(ownSpec.damage),
        };
        msg += `; Support follow-up available (${extraTargets.length})`;
      }
    }
    return msg;
  }

  return "Class active not implemented";
}

function recallHarpeWeapon(state: GameState, player: Player, equipWeapon?: string): string {
  const trap = getThrownTrap(state, player.id);
  if (!trap) return "No thrown weapon";
  state.combat!.thrownTraps = state.combat!.thrownTraps!.filter((t) => t.ownerId !== player.id);
  if (equipWeapon) {
    if (player.weapon && player.weapon !== equipWeapon) {
      if (!player.weapon2) player.weapon2 = player.weapon;
      else player.weapon2 = player.weapon;
    }
    player.weapon = equipWeapon;
  } else {
    player.weapon = trap.weaponName;
  }
  return `${playerLabel(player)} recalled ${trap.weaponName}`;
}

export function applyClassPassive(
  state: GameState,
  playerId: string,
  action: Extract<PlayerAction, { action: "classPassive" }>,
): string {
  const player = state.players.find((p) => p.id === playerId)!;
  if (action.kind === "baseline_communism") {
    const ally = state.players.find((p) => p.id === action.targetPlayerId)!;
    player.equipmentUses = 0;
    ally.equipmentUses = 1;
    return `${playerLabel(player)} Baseline Communism → restored ${playerLabel(ally)} equipment`;
  }
  return "Unknown passive";
}

export function applyResolveClassReaction(
  state: GameState,
  _playerId: string,
  action: Extract<PlayerAction, { action: "resolveClassReaction" }>,
): string {
  const reaction = state.combat!.pendingClassReaction!;
  if (reaction.kind === "borrowing_follow_up") {
    if (action.accept) {
      for (const id of reaction.extraEnemyIds) {
        const enemy = state.enemies.find((e) => e.id === id);
        if (enemy) applyDamageToEnemy(enemy, reaction.maxDamage, state);
      }
      state.combat!.pendingClassReaction = null;
      return `Borrowing follow-up max damage ${reaction.maxDamage} on ${reaction.extraEnemyIds.length}`;
    }
    state.combat!.pendingClassReaction = null;
    return "Borrowing follow-up skipped";
  }
  const enemy = state.enemies.find((e) => e.id === reaction.enemyId)!;
  const owner = state.players.find((p) => p.id === reaction.trapOwnerId)!;
  const toward =
    action.pullToward === "weapon"
      ? { x: reaction.trapX, y: reaction.trapY }
      : { x: owner.x, y: owner.y };
  const pullMsg = applyPullToward(state, enemy, toward.x, toward.y, action.pullDistance!, {
    kind: "enemy",
  });
  recallHarpeWeapon(state, owner);
  state.combat!.pendingClassReaction = null;
  return `Weapon Trap pull: ${pullMsg}`;
}

export function handleEnemyDefeated(
  state: GameState,
  enemy: Enemy,
  killerPlayerId?: string,
): string | null {
  if (!ensureCombat(state)) return null;
  if (!killerPlayerId) return null;
  const markEnemyId = state.combat!.kopisMarks?.[killerPlayerId];
  if (!markEnemyId || markEnemyId !== enemy.id) return null;
  delete state.combat!.kopisMarks![killerPlayerId];
  const tokenId = `kopis-${killerPlayerId}-${enemy.x}-${enemy.y}-${Date.now()}`;
  state.combat!.boardTokens!.push({
    id: tokenId,
    ownerId: killerPlayerId,
    x: enemy.x,
    y: enemy.y,
    kind: "kopis",
  });
  return `Kopis token dropped at (${enemy.x}, ${enemy.y})`;
}

export type MovementHookResult = {
  messages: string[];
  interrupt: boolean;
};

export function applyMovementStepHooks(
  state: GameState,
  unit: Player | Enemy,
  stepX: number,
  stepY: number,
  kind: "player" | "enemy",
): MovementHookResult {
  const messages: string[] = [];
  let interrupt = false;
  if (!ensureCombat(state)) return { messages, interrupt };

  if (kind === "player") {
    const player = unit as Player;
    if (!player.counters) player.counters = {};
    player.counters.movedThisTurn = 1;

    const tokenIdx = state.combat!.boardTokens!.findIndex(
      (t) => t.ownerId === player.id && t.x === stepX && t.y === stepY,
    );
    if (tokenIdx >= 0) {
      state.combat!.boardTokens!.splice(tokenIdx, 1);
      player.counters.freeWeaponAttack = 1;
      messages.push("Kopis token — free weapon attack");
    }
  }

  const attractorMsgs = applyAttractorEntryPulls(
    state,
    unit as Player,
    stepX,
    stepY,
    kind,
  );
  messages.push(...attractorMsgs);

  const trapResult = checkHarpeTrapCrossing(state, unit, stepX, stepY, kind);
  if (trapResult) {
    messages.push(trapResult.message);
    if (trapResult.interrupt) interrupt = true;
  }

  return { messages, interrupt };
}

function checkHarpeTrapCrossing(
  state: GameState,
  unit: Player | Enemy,
  stepX: number,
  stepY: number,
  kind: "player" | "enemy",
): { message: string; interrupt: boolean } | null {
  if (kind !== "enemy") return null;
  const enemy = unit as Enemy;
  for (const trap of state.combat?.thrownTraps ?? []) {
    const owner = state.players.find((p) => p.id === trap.ownerId);
    if (!owner) continue;
    if (!hasLineOfSight(state, owner.x, owner.y, trap.x, trap.y)) continue;
    const lineTiles = tilesOnCardinalLine(trap.originX, trap.originY, trap.x, trap.y);
    const crossed = lineTiles.some((t) => t.x === stepX && t.y === stepY);
    if (!crossed) continue;

    const spec = getWeaponAttackSpec(trap.weaponName);
    const damage = spec ? maxWeaponDamage(spec.damage) : 0;
    applyDamageToEnemy(enemy, damage, state);
    state.combat!.pendingClassReaction = {
      playerId: trap.ownerId,
      kind: "harpe_trap_pull",
      enemyId: enemy.id,
      trapOwnerId: trap.ownerId,
      weaponName: trap.weaponName,
      trapX: trap.x,
      trapY: trap.y,
      damageDealt: damage,
    };
    return {
      message: `Weapon Trap triggered on ${enemyLabel(enemy)} for ${damage}`,
      interrupt: true,
    };
  }
  return null;
}

export function classActiveTierFor(player: Player): ActionTier {
  return getClassActiveTier(player.class);
}
