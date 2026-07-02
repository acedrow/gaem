import type { GaemRole, ClientMessage } from "../types.js";
import type {
  AssistedOutcome,
  GmEnemyAction,
  PlayerAction,
} from "./types.js";
import type { GameState } from "../types.js";
import {
  canGmMoveEnemies,
  canPlayerMove,
  clampHp,
  finishGmTurnIfPlayersRemain,
  getEnemyMaxHp,
  getPlayerMaxHp,
  validateEnemyFootprint,
} from "../game.js";
import { getArmorByName, getArmorSpeed, getWeaponByName } from "../player-data.js";
import type { StructuredArmorAction } from "./types.js";
import { createDefaultActionBudget } from "./types.js";
import { getEnemyScale, enemyFootprintTiles, ensureEnemyMovement, spendEnemyMovement } from "../enemy-data.js";
import { buildBoardOccupancy } from "../game.js";
import { coordKey, isInBounds, isWalkable, tileAt } from "../map.js";
import { isOrthogonallyAdjacent } from "../patterns.js";
import {
  canSpendActionTier,
  effectiveActionBlocked,
  spendActionTier,
} from "./actions.js";
import {
  adjacentEnemies,
  applyMovementPath,
  validateMovementPath,
} from "./movement.js";
import {
  applyAttackToEnemies,
  applyDamageToEnemy,
  applyDamageToPlayer,
  collectAttackTiles,
  enemiesInTiles,
  getWeaponAttackSpec,
  manhattanDistance,
  parseEnemyAttackString,
  resolveAttackDamage,
} from "./attack.js";
import { applyEffectStacks, clearEffectStacks, parseEffectToken, tickUnitEndOfTurn } from "./effects.js";
import { isKnownEffectId } from "../effects-data.js";
import { createPendingAction, addPendingAction, applyAssistedOutcome } from "./pending.js";
import { markEnemyExhausted, setActiveEnemy } from "./enemy.js";
import { enemyLabel, playerLabel } from "../console.js";
import { isRangeTargetAttack, rangeTargetDistance } from "../weapon-patterns.js";

export type CombatMessageContext = {
  role: GaemRole;
  playerId: string | null;
};

export function validateMovePath(
  state: GameState,
  playerId: string,
  path: { x: number; y: number }[],
): string | null {
  if (!canPlayerMove(state, playerId)) return "Not your turn";
  if (state.roundPhase === "deployment") {
    if (path.length !== 1) return "Deployment: single step only";
    return validateMovementPath(state, playerId, path);
  }
  return validateMovementPath(state, playerId, path);
}

export function applyMovePath(
  state: GameState,
  playerId: string,
  path: { x: number; y: number }[],
): string {
  if (state.roundPhase === "deployment") {
    const player = state.players.find((p) => p.id === playerId);
    if (!player || path.length !== 1) return "Invalid move";
    const dest = path[0]!;
    player.x = dest.x;
    player.y = dest.y;
    return `${playerLabel(player)} moved to (${dest.x}, ${dest.y})`;
  }
  const err = applyMovementPath(state, playerId, path);
  if (err) return err;
  const player = state.players.find((p) => p.id === playerId)!;
  const dest = path[path.length - 1]!;
  return `${playerLabel(player)} moved to (${dest.x}, ${dest.y})`;
}

export function validatePlayerAction(
  state: GameState,
  playerId: string,
  action: PlayerAction,
): string | null {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return "Unknown player";
  if (!canPlayerMove(state, playerId)) return "Not your turn";
  if (state.roundPhase === "deployment") return "Wrong phase";
  if (state.enforceTurns !== false && state.roundPhase !== "playerTurn") return "Wrong phase";
  if (!player.actionBudget) {
    const speed = player.speed ?? getArmorSpeed(player.armor);
    if (speed) player.actionBudget = createDefaultActionBudget(speed);
  }

  switch (action.action) {
    case "attack": {
      if (!canSpendActionTier(player.actionBudget, "main")) return "Main action spent";
      if (effectiveActionBlocked(player, "main")) return "Shock — cannot use Main";
      const spec = getWeaponAttackSpec(player.weapon);
      if (!spec) return "Weapon has no attack profile";
      if (isRangeTargetAttack(spec)) {
        if (!action.targetEnemyId) return "Select target";
        const enemy = state.enemies.find((e) => e.id === action.targetEnemyId);
        if (!enemy) return "Unknown target";
        if (manhattanDistance(player, enemy) > rangeTargetDistance(spec)) return "Target out of range";
      }
      return null;
    }
    case "shove": {
      if (!canSpendActionTier(player.actionBudget, "aux")) return "Aux action spent";
      if (effectiveActionBlocked(player, "aux")) return "Shock — cannot use Aux";
      if (!action.targetEnemyId && !action.targetPlayerId) return "No shove target";
      const tx = action.targetEnemyId
        ? state.enemies.find((e) => e.id === action.targetEnemyId)
        : state.players.find((p) => p.id === action.targetPlayerId);
      if (!tx) return "Unknown target";
      if (!isOrthogonallyAdjacent({ x: player.x, y: player.y }, { x: tx.x, y: tx.y })) {
        return "Target must be adjacent";
      }
      return null;
    }
    case "sprint": {
      if (!canSpendActionTier(player.actionBudget, "aux")) return "Aux action spent";
      return validateMovementPath(state, playerId, action.path, { sprint: true });
    }
    case "weaponSwap":
      if (!canSpendActionTier(player.actionBudget, "aux")) return "Aux action spent";
      return null;
    case "rez": {
      if (!canSpendActionTier(player.actionBudget, "main")) return "Main action spent";
      const target = state.players.find((p) => p.id === action.targetPlayerId);
      if (!target) return "Unknown ally";
      if (!isOrthogonallyAdjacent({ x: player.x, y: player.y }, { x: target.x, y: target.y })) {
        return "Ally must be adjacent";
      }
      if ((target.hp ?? 0) > 0) return "Ally is not down";
      return null;
    }
    case "armorAction": {
      if (!canSpendActionTier(player.actionBudget, "support")) return "Support action spent";
      if (effectiveActionBlocked(player, "support")) return "Shock — cannot use Support";
      const armor = getArmorByName(player.armor ?? "");
      const structured = armor?.armorActionStructured as StructuredArmorAction | undefined;
      if (!structured) return "Armor action not structured — use assisted flow";
      if (structured.kind === "teleport_adjacent") {
        if (!action.targetEnemyId) return "Select adjacent enemy";
        const enemy = state.enemies.find((e) => e.id === action.targetEnemyId);
        if (!enemy) return "Unknown enemy";
        if (!adjacentEnemies(state, player.x, player.y).includes(enemy.id)) return "Enemy not adjacent";
        if (action.landingX === undefined || action.landingY === undefined) return "Select landing space";
        const landing = { x: action.landingX, y: action.landingY };
        if (!isInBounds(landing.x, landing.y, state.width, state.height)) return "Out of bounds";
        if (!isWalkable(tileAt(state.tiles, landing.x, landing.y))) return "Blocked";
        const footprint = enemyFootprintTiles(enemy.x, enemy.y, getEnemyScale(enemy));
        if (!footprint.some((tile) => isOrthogonallyAdjacent(tile, landing))) {
          return "Invalid landing space";
        }
        const occ = buildBoardOccupancy(state);
        const key = coordKey(landing.x, landing.y);
        const occupant = occ.playerByKey.get(key);
        if (occupant && occupant.id !== playerId) return "Tile occupied";
        if (occ.enemyByKey.has(key)) return "Tile occupied";
      }
      if (structured.kind === "push_recoil") {
        if (!action.targetEnemyId && !action.targetPlayerId) return "Select target";
      }
      return null;
    }
    case "classActive":
      if (!canSpendActionTier(player.actionBudget, "support")) return "Support action spent";
      return null;
    case "weaponActive":
      if (!canSpendActionTier(player.actionBudget, "main")) return "Main action spent";
      return null;
    case "useEquipment":
      if (!canSpendActionTier(player.actionBudget, "support")) return "Support action spent";
      if (player.equipmentUses !== undefined && player.equipmentUses <= 0) return "Equipment already used";
      return null;
    case "interact":
      if (!canSpendActionTier(player.actionBudget, "support")) return "Support action spent";
      return null;
  }
}

export function applyPlayerAction(
  state: GameState,
  playerId: string,
  action: PlayerAction,
): string {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return "Unknown player";

  switch (action.action) {
    case "attack": {
      spendActionTier(player.actionBudget, "main");
      const spec = getWeaponAttackSpec(player.weapon)!;
      let result;
      if (isRangeTargetAttack(spec) && action.targetEnemyId) {
        const enemy = state.enemies.find((e) => e.id === action.targetEnemyId)!;
        const { total, detail } = resolveAttackDamage(spec, action.damageRoll);
        applyDamageToEnemy(enemy, total, state);
        applyEffectStacks(enemy, spec.effects ?? []);
        result = {
          damage: total,
          detail,
          targets: [{ enemyId: enemy.id, x: enemy.x, y: enemy.y }],
          effects: spec.effects ?? [],
        };
      } else {
        result = applyAttackToEnemies(
          state,
          spec,
          { x: player.x, y: player.y },
          action.direction,
          action.damageRoll,
        );
      }
      const names = result.targets
        .map((t) => state.enemies.find((e) => e.id === t.enemyId))
        .filter(Boolean)
        .map((e) => enemyLabel(e!))
        .join(", ");
      return `${playerLabel(player)} attacked (${result.detail} dmg) → ${names || "no targets"}`;
    }
    case "shove": {
      spendActionTier(player.actionBudget, "aux");
      const occ = buildBoardOccupancy(state);
      let tx: number;
      let ty: number;
      if (action.targetEnemyId) {
        const enemy = state.enemies.find((e) => e.id === action.targetEnemyId)!;
        tx = enemy.x;
        ty = enemy.y;
        const dx = tx - player.x;
        const dy = ty - player.y;
        const pushX = tx + Math.sign(dx);
        const pushY = ty + Math.sign(dy);
        if (isInBounds(pushX, pushY, state.width, state.height) && !occ.playerByKey.has(coordKey(pushX, pushY)) && !occ.enemyByKey.has(coordKey(pushX, pushY))) {
          enemy.x = pushX;
          enemy.y = pushY;
        }
      } else {
        const target = state.players.find((p) => p.id === action.targetPlayerId)!;
        tx = target.x;
        ty = target.y;
        const dx = tx - player.x;
        const dy = ty - player.y;
        const pushX = tx + Math.sign(dx);
        const pushY = ty + Math.sign(dy);
        if (isInBounds(pushX, pushY, state.width, state.height) && !occ.playerByKey.has(coordKey(pushX, pushY)) && !occ.enemyByKey.has(coordKey(pushX, pushY))) {
          target.x = pushX;
          target.y = pushY;
        }
      }
      return `${playerLabel(player)} shoved a target`;
    }
    case "sprint": {
      spendActionTier(player.actionBudget, "aux");
      applyMovementPath(state, playerId, action.path, { sprint: true, spendBudget: false });
      const dest = action.path[action.path.length - 1]!;
      return `${playerLabel(player)} sprinted to (${dest.x}, ${dest.y})`;
    }
    case "weaponSwap": {
      spendActionTier(player.actionBudget, "aux");
      return `${playerLabel(player)} swapped weapon (assisted loadout)`;
    }
    case "rez": {
      spendActionTier(player.actionBudget, "main");
      const target = state.players.find((p) => p.id === action.targetPlayerId)!;
      target.hp = getPlayerMaxHp(target);
      return `${playerLabel(player)} rezzed ${playerLabel(target)}`;
    }
    case "armorAction": {
      const armor = getArmorByName(player.armor ?? "")!;
      const structured = armor.armorActionStructured as StructuredArmorAction;
      if (structured.kind === "teleport_adjacent" && action.targetEnemyId) {
        const landing = { x: action.landingX!, y: action.landingY! };
        player.x = landing.x;
        player.y = landing.y;
        spendActionTier(player.actionBudget, "support");
        return `${playerLabel(player)} used ${armor.name} armor action`;
      }
      spendActionTier(player.actionBudget, "support");
      if (structured.kind === "push_recoil") {
        const push = action.push ?? structured.push ?? 1;
        addPendingAction(
          state,
          createPendingAction("classActive", `${armor.name} armor action`, {
            actorPlayerId: playerId,
            detail: `Push:${push} with equal Recoil`,
            targetEnemyIds: action.targetEnemyId ? [action.targetEnemyId] : undefined,
            targetPlayerIds: action.targetPlayerId ? [action.targetPlayerId] : undefined,
          }),
        );
        return `${playerLabel(player)} used ${armor.name} armor action (pending GM)`;
      }
      return `${playerLabel(player)} used armor action`;
    }
    case "classActive": {
      spendActionTier(player.actionBudget, "support");
      const cls = player.class ?? "Class";
      addPendingAction(
        state,
        createPendingAction("classActive", `${cls} active ability`, {
          actorPlayerId: playerId,
          detail: action.detail,
          targetEnemyIds: action.targetEnemyIds,
          targetPlayerIds: action.targetPlayerIds,
        }),
      );
      return `${playerLabel(player)} used ${cls} active (pending GM)`;
    }
    case "weaponActive": {
      spendActionTier(player.actionBudget, "main");
      const weapon = getWeaponByName(player.weapon ?? "");
      addPendingAction(
        state,
        createPendingAction("weaponActive", `${weapon?.name ?? "Weapon"} active`, {
          actorPlayerId: playerId,
          detail: action.detail,
          targetEnemyIds: action.targetEnemyIds,
          targetPlayerIds: action.targetPlayerIds,
          direction: action.direction,
        }),
      );
      return `${playerLabel(player)} used weapon active (pending GM)`;
    }
    case "useEquipment": {
      spendActionTier(player.actionBudget, "support");
      player.equipmentUses = 0;
      addPendingAction(
        state,
        createPendingAction("useEquipment", "Equipment", {
          actorPlayerId: playerId,
          detail: action.detail,
        }),
      );
      return `${playerLabel(player)} used equipment (pending GM)`;
    }
    case "interact": {
      spendActionTier(player.actionBudget, "support");
      addPendingAction(
        state,
        createPendingAction("interact", "Interact", {
          actorPlayerId: playerId,
          detail: action.detail,
        }),
      );
      return `${playerLabel(player)} interacted (pending GM)`;
    }
  }
}

export function validateGmEnemyAction(state: GameState, action: GmEnemyAction): string | null {
  if (!canGmMoveEnemies(state)) return "Not GM turn";
  const enemy = state.enemies.find((e) => e.id === action.enemyId);
  if (!enemy) return "Unknown enemy";

  switch (action.action) {
    case "move": {
      if (action.path.length === 0) return "Empty path";
      if (enemy.exhausted) return "Enemy has ended turn";
      let cx = enemy.x;
      let cy = enemy.y;
      for (const step of action.path) {
        if (!isOrthogonallyAdjacent({ x: cx, y: cy }, step)) return "Invalid enemy path";
        const err = validateEnemyFootprint(state, step.x, step.y, getEnemyScale(enemy), enemy.id);
        if (err) return err;
        cx = step.x;
        cy = step.y;
      }
      if (state.enforceTurns !== false) {
        ensureEnemyMovement(enemy);
        if ((enemy.movementRemaining ?? 0) < action.path.length) return "Not enough movement";
      }
      return null;
    }
    case "attack":
    case "assisted":
      return null;
    case "exhaust":
      return null;
  }
}

export function applyGmEnemyAction(state: GameState, action: GmEnemyAction): string {
  const enemy = state.enemies.find((e) => e.id === action.enemyId);
  if (!enemy) return "Unknown enemy";

  switch (action.action) {
    case "move": {
      const dest = action.path[action.path.length - 1]!;
      if (state.enforceTurns !== false) spendEnemyMovement(enemy, action.path.length);
      enemy.x = dest.x;
      enemy.y = dest.y;
      setActiveEnemy(state, enemy.id);
      return `${enemyLabel(enemy)} moved to (${dest.x}, ${dest.y})`;
    }
    case "attack": {
      setActiveEnemy(state, enemy.id);
      const attacks = enemy.name ? enemyAttacks(enemy.name) : [];
      const attackText = attacks[action.attackIndex];
      const parsed = attackText ? parseEnemyAttackString(attackText) : { raw: "" };
      let msg = `${enemyLabel(enemy)} used attack ${action.attackIndex + 1}`;
      if (parsed.damage && action.targetPlayerId) {
        const target = state.players.find((p) => p.id === action.targetPlayerId);
        if (target) {
          const dmg = action.damage ?? parsed.damage;
          applyDamageToPlayer(target, dmg, state);
          if (parsed.effects) applyEffectStacks(target, parsed.effects);
          msg += ` → ${playerLabel(target)} for ${dmg}`;
        }
      } else if (action.damage && action.targetPlayerId) {
        const target = state.players.find((p) => p.id === action.targetPlayerId)!;
        applyDamageToPlayer(target, action.damage, state);
        msg += ` → ${playerLabel(target)} for ${action.damage}`;
      } else {
        addPendingAction(
          state,
          createPendingAction("enemyAttack", `${enemyLabel(enemy)} attack ${action.attackIndex + 1}`, {
            actorEnemyId: enemy.id,
            detail: attackText,
            targetPlayerIds: action.targetPlayerId ? [action.targetPlayerId] : undefined,
            direction: action.direction,
            damage: action.damage,
          }),
        );
        msg += " (pending GM)";
      }
      if (action.targetPlayerId && state.combat) {
        const target = state.players.find((p) => p.id === action.targetPlayerId);
        const armor = target ? getArmorByName(target.armor ?? "") : undefined;
        if (target && armor?.reversal && (target.reversalCharges ?? 0) > 0) {
          state.combat.pendingReaction = {
            playerId: target.id,
            sourceEnemyId: enemy.id,
            trigger: armor.reversal.trigger,
            label: `${armor.name} Reversal`,
          };
        }
      }
      return msg;
    }
    case "assisted": {
      setActiveEnemy(state, enemy.id);
      addPendingAction(
        state,
        createPendingAction("enemySpecial", action.label, {
          actorEnemyId: enemy.id,
          detail: action.detail,
          targetPlayerIds: action.targetPlayerId ? [action.targetPlayerId] : undefined,
          damage: action.damage,
          effects: action.effects,
        }),
      );
      return `${enemyLabel(enemy)}: ${action.label} (pending)`;
    }
    case "exhaust": {
      markEnemyExhausted(state, enemy.id);
      if (state.combat?.activeEnemyId === enemy.id) setActiveEnemy(state, null);
      const ticks = tickUnitEndOfTurn(enemy);
      let msg = `${enemyLabel(enemy)} ended turn`;
      if (ticks.length) msg += `. ${ticks.join("; ")}`;
      const phaseMsg = finishGmTurnIfPlayersRemain(state);
      if (phaseMsg) msg += `. GM phase ended — ${phaseMsg}`;
      return msg;
    }
  }
}

import { getEnemyListingByName } from "../enemy-data.js";

function enemyAttacks(name: string): string[] {
  return getEnemyListingByName(name)?.attacks ?? [];
}

export function validateSetEnemyHp(state: GameState, enemyId: string, hp: number): string | null {
  const enemy = state.enemies.find((e) => e.id === enemyId);
  if (!enemy) return "Unknown enemy";
  if (!Number.isFinite(hp)) return "Invalid HP";
  return null;
}

export function applySetEnemyHp(state: GameState, enemyId: string, hp: number): string {
  const enemy = state.enemies.find((e) => e.id === enemyId)!;
  enemy.hp = clampHp(Math.trunc(hp), getEnemyMaxHp(enemy));
  return `${enemyLabel(enemy)} HP set to ${enemy.hp}`;
}

export function validateApplyEffect(
  state: GameState,
  target: { kind: "player" | "enemy"; id: string },
  effects: string[],
): string | null {
  if (target.kind === "player" && !state.players.some((p) => p.id === target.id)) return "Unknown player";
  if (target.kind === "enemy" && !state.enemies.some((e) => e.id === target.id)) return "Unknown enemy";
  if (!effects.length) return "No effects";
  for (const token of effects) {
    const parsed = parseEffectToken(token);
    if (!parsed) return `Invalid effect token: ${token}`;
    if (parsed.stacks === 0) return `Invalid effect stacks: ${token}`;
    if (!isKnownEffectId(parsed.id)) return `Unknown effect: ${parsed.id}`;
  }
  return null;
}

export function applyEffectTarget(
  state: GameState,
  target: { kind: "player" | "enemy"; id: string },
  effects: string[],
): string {
  const unit =
    target.kind === "player"
      ? state.players.find((p) => p.id === target.id)
      : state.enemies.find((e) => e.id === target.id);
  if (!unit) return "Unknown target";
  applyEffectStacks(unit, effects);
  const label = target.kind === "player" ? playerLabel(unit as import("../types.js").Player) : enemyLabel(unit as import("../types.js").Enemy);
  return `Applied ${effects.join(", ")} to ${label}`;
}

export function validateClearEffects(
  state: GameState,
  target: { kind: "player" | "enemy"; id: string },
): string | null {
  if (target.kind === "player" && !state.players.some((p) => p.id === target.id)) return "Unknown player";
  if (target.kind === "enemy" && !state.enemies.some((e) => e.id === target.id)) return "Unknown enemy";
  return null;
}

export function applyClearEffects(
  state: GameState,
  target: { kind: "player" | "enemy"; id: string },
): string {
  const unit =
    target.kind === "player"
      ? state.players.find((p) => p.id === target.id)
      : state.enemies.find((e) => e.id === target.id);
  if (!unit) return "Unknown target";
  clearEffectStacks(unit);
  const label = target.kind === "player" ? playerLabel(unit as import("../types.js").Player) : enemyLabel(unit as import("../types.js").Enemy);
  return `Cleared effects on ${label}`;
}

export function validateAssistedOutcome(_state: GameState, _outcome: AssistedOutcome, role: GaemRole): string | null {
  if (role !== "gm") return "Only GM can apply assisted outcomes";
  return null;
}

export { applyAssistedOutcome };

export function validateTriggerReversal(state: GameState, playerId: string): string | null {
  const reaction = state.combat?.pendingReaction;
  if (!reaction || reaction.playerId !== playerId) return "No reversal pending";
  const player = state.players.find((p) => p.id === playerId);
  if (!player || (player.reversalCharges ?? 0) <= 0) return "No reversal charges";
  return null;
}

export function applyTriggerReversal(state: GameState, playerId: string): string {
  const player = state.players.find((p) => p.id === playerId)!;
  player.reversalCharges = (player.reversalCharges ?? 0) - 1;
  if (state.combat) state.combat.pendingReaction = null;
  const armor = getArmorByName(player.armor ?? "");
  addPendingAction(
    state,
    createPendingAction("reversal", `${armor?.name ?? "Armor"} Reversal`, {
      actorPlayerId: playerId,
      detail: armor?.reversal?.effect,
    }),
  );
  return `${playerLabel(player)} triggered Reversal (pending GM)`;
}

export function validateDeclineReversal(state: GameState, playerId: string): string | null {
  const reaction = state.combat?.pendingReaction;
  if (!reaction || reaction.playerId !== playerId) return "No reversal pending";
  return null;
}

export function applyDeclineReversal(state: GameState, playerId: string): string {
  if (state.combat) state.combat.pendingReaction = null;
  const player = state.players.find((p) => p.id === playerId);
  return `${player ? playerLabel(player) : "Player"} declined Reversal`;
}

export function previewPlayerAttack(
  state: GameState,
  playerId: string,
  direction: import("../pattern-data.js").PatternDirection,
): { x: number; y: number }[] {
  const player = state.players.find((p) => p.id === playerId);
  const spec = getWeaponAttackSpec(player?.weapon);
  if (!player || !spec) return [];
  return collectAttackTiles(state, { x: player.x, y: player.y }, spec, direction);
}

export function previewEnemyAttack(
  state: GameState,
  enemyId: string,
  attackIndex: number,
  direction: import("../pattern-data.js").PatternDirection,
): { x: number; y: number }[] {
  const enemy = state.enemies.find((e) => e.id === enemyId);
  if (!enemy?.name) return [];
  const attacks = enemyAttacks(enemy.name);
  const parsed = parseEnemyAttackString(attacks[attackIndex] ?? "");
  if (!parsed.patternId || !parsed.size) return [];
  const spec = {
    patternId: parsed.patternId,
    size: parsed.size,
    range: parsed.range,
    width: parsed.width ?? 1,
    damage: String(parsed.damage ?? 0),
  };
  return collectAttackTiles(state, { x: enemy.x, y: enemy.y }, spec, direction);
}

export function previewAttackTargets(
  state: GameState,
  tiles: { x: number; y: number }[],
): string[] {
  return enemiesInTiles(state, tiles).map((t) => t.enemyId);
}
export type CombatHandleResult = { handled: true; message: string } | { handled: false };

export function handleCombatMessage(
  state: GameState,
  parsed: ClientMessage,
  ctx: CombatMessageContext,
): CombatHandleResult | { handled: true; error: string } {
  switch (parsed.type) {
    case "movePath": {
      if (!ctx.playerId) return { handled: true, error: "Only players can move" };
      const err = validateMovePath(state, ctx.playerId, parsed.path);
      if (err) return { handled: true, error: err };
      return { handled: true, message: applyMovePath(state, ctx.playerId, parsed.path) };
    }
    case "playerAction": {
      if (!ctx.playerId) return { handled: true, error: "Only players can act" };
      const err = validatePlayerAction(state, ctx.playerId, parsed.action);
      if (err) return { handled: true, error: err };
      return { handled: true, message: applyPlayerAction(state, ctx.playerId, parsed.action) };
    }
    case "gmEnemyAction": {
      if (ctx.role !== "gm") return { handled: true, error: "Only GM can do that" };
      const err = validateGmEnemyAction(state, parsed.action);
      if (err) return { handled: true, error: err };
      return { handled: true, message: applyGmEnemyAction(state, parsed.action) };
    }
    case "applyAssistedOutcome": {
      const err = validateAssistedOutcome(state, parsed.outcome, ctx.role);
      if (err) return { handled: true, error: err };
      const msg = applyAssistedOutcome(state, parsed.outcome);
      return { handled: true, message: msg ?? "Applied" };
    }
    case "setEnemyHp": {
      if (ctx.role !== "gm") return { handled: true, error: "Only GM can do that" };
      const err = validateSetEnemyHp(state, parsed.enemyId, parsed.hp);
      if (err) return { handled: true, error: err };
      return { handled: true, message: applySetEnemyHp(state, parsed.enemyId, parsed.hp) };
    }
    case "applyEffect": {
      const err = validateApplyEffect(state, parsed.target, parsed.effects);
      if (err) return { handled: true, error: err };
      return { handled: true, message: applyEffectTarget(state, parsed.target, parsed.effects) };
    }
    case "clearEffects": {
      if (ctx.role !== "gm") return { handled: true, error: "Only GM can do that" };
      const err = validateClearEffects(state, parsed.target);
      if (err) return { handled: true, error: err };
      return { handled: true, message: applyClearEffects(state, parsed.target) };
    }
    case "triggerReversal": {
      if (!ctx.playerId) return { handled: true, error: "Only players can trigger reversal" };
      const err = validateTriggerReversal(state, ctx.playerId);
      if (err) return { handled: true, error: err };
      return { handled: true, message: applyTriggerReversal(state, ctx.playerId) };
    }
    case "declineReversal": {
      if (!ctx.playerId) return { handled: true, error: "Only players can decline reversal" };
      const err = validateDeclineReversal(state, ctx.playerId);
      if (err) return { handled: true, error: err };
      return { handled: true, message: applyDeclineReversal(state, ctx.playerId) };
    }
    default:
      return { handled: false };
  }
}

