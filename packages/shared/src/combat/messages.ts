import type { GaemRole, ClientMessage } from "../types.js";
import { isCampaignFeatureUnlocked } from "../base-upgrades-unlocks.js";
import type {
  AssistedOutcome,
  GmEnemyAction,
  PlayerAction,
} from "./types.js";
import type { GameState, Player } from "../types.js";
import {
  canGmMoveEnemies,
  canPlayerMove,
  clampHp,
  finishGmTurnIfPlayersRemain,
  getEnemyMaxHp,
  getPlayerMaxHp,
  areActionLimitsEnforced,
  validateEnemyFootprint,
} from "../game.js";
import { getArmorByName, getArmorSpeed, getWeaponByName } from "../player-data.js";
import type { StructuredArmorAction } from "./types.js";
import { createDefaultActionBudget, type ActionTier } from "./types.js";
import { getEnemyScale, enemyFootprintTiles, ensureEnemyMovement, spendEnemyMovement } from "../enemy-data.js";
import { buildBoardOccupancy } from "../game.js";
import { coordKey, isInBounds, isWalkable, tileAt } from "../map.js";
import { isOrthogonallyAdjacent } from "../patterns.js";
import { actionTierBlockedReason, applyCommitHaste, spendActionTierOrHaste, validateCommitHaste } from "./actions.js";
import {
  adjacentEnemies,
  applyMovementPath,
  applySprintBegin,
  applySprintCancel,
  applySprintMove,
  validateMovementPath,
  validateResetMovement,
  applyResetMovement,
  validateSprintBegin,
  validateSprintCancel,
  validateSprintMove,
} from "./movement.js";
import {
  applyAttackToEnemies,
  applyDamageToEnemy,
  applyDamageToPlayer,
  applyOmnistrike,
  applyWarhook,
  collectAttackTiles,
  enemiesInTiles,
  getWeaponAttackSpec,
  isWarhookWeaponName,
  manhattanDistance,
  parseEnemyAttackString,
  resolveAttackDamage,
  resolveAttackWeapon,
  resolveCombatAttackSpec,
  resolveRangeAttackTargetIds,
  ensureSabaothCharges,
  hasSabaothBombSelected,
  isSabaothWeaponName,
  validateOmnistrikeAction,
  validateWarhookAction,
} from "./attack.js";
import { applyEffectStacks, clearEffectStacks, parseEffectToken, tickUnitEndOfTurn } from "./effects.js";
import { isKnownEffectId } from "../effects-data.js";
import { createPendingAction, addPendingAction, applyAssistedOutcome } from "./pending.js";
import { markEnemyExhausted, setActiveEnemy } from "./enemy.js";
import { enemyLabel, playerLabel } from "../console.js";
import {
  isRangeTargetAttack,
  patternOriginFromAnchor,
  evaluateAnchoredPatternPlacement,
  rangeTargetDistance,
  rangeTargetMax,
  usesAnchoredPatternPlacement,
} from "../weapon-patterns.js";
import {
  applyKataptyStrike,
  applyPlaceTower,
  applySeedInteract,
  applyTowerTeleport,
  applyYadathanReversal,
  getPlayerTower,
  getSeedAt,
  isYadathanArmorName,
  validateKataptyEndTurn,
  validatePlaceTower,
  validateSeedInteract,
  validateTowerTeleport,
  yadathanReversalEligible,
} from "./yadathan.js";

export type CombatMessageContext = {
  role: GaemRole;
  playerId: string | null;
};

function actionTierBlocked(player: Player, tier: ActionTier, state: GameState): string | null {
  if (!areActionLimitsEnforced(state)) return null;
  return actionTierBlockedReason(player, tier);
}

function maybeSpendActionTier(state: GameState, player: Player, tier: ActionTier): void {
  if (areActionLimitsEnforced(state)) spendActionTierOrHaste(player, tier);
}

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

function validateSelectWeaponVariant(
  state: GameState,
  player: Player,
  action: Extract<PlayerAction, { action: "selectWeaponVariant" }>,
): string | null {
  if (state.roundPhase === "deployment") return "Wrong phase";
  const weapon = getWeaponByName(player.weapon ?? "");
  const bombs = weapon?.attack?.bombs;
  if (!bombs?.length) return "Weapon has no variants";
  if (!Number.isInteger(action.index) || action.index < 0 || action.index >= bombs.length) {
    return "Invalid variant";
  }
  ensureSabaothCharges(player);
  const current = player.counters!.sabaothBomb;
  if (action.index !== current && player.counters!.sabaothCharges! <= 0) {
    return "No charges remaining";
  }
  return null;
}

export function validatePlayerAction(
  state: GameState,
  playerId: string,
  action: PlayerAction,
): string | null {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return "Unknown player";

  if (action.action === "selectWeaponVariant") {
    return validateSelectWeaponVariant(state, player, action);
  }

  if (!canPlayerMove(state, playerId)) return "Not your turn";
  if (state.roundPhase === "deployment") return "Wrong phase";
  if (state.enforceTurns !== false && state.roundPhase !== "playerTurn") return "Wrong phase";
  if (!player.actionBudget) {
    const speed = player.speed ?? getArmorSpeed(player.armor);
    if (speed) player.actionBudget = createDefaultActionBudget(speed);
  }

  switch (action.action) {
    case "attack": {
      const blocked = actionTierBlocked(player, "main", state);
      if (blocked) return blocked;
      const weapon = resolveAttackWeapon(player, action.weaponName);
      if (!weapon) return "Invalid weapon";
      if (isSabaothWeaponName(weapon) && !hasSabaothBombSelected(player)) {
        return "Select bomb type";
      }
      const spec = resolveCombatAttackSpec(player, weapon);
      if (!spec) return "Weapon has no attack profile";
      if (isRangeTargetAttack(spec)) {
        const targetIds = resolveRangeAttackTargetIds(action);
        if (!targetIds.length) return "Select target";
        const maxTargets = rangeTargetMax(spec);
        if (targetIds.length > maxTargets) return `Too many targets (max ${maxTargets})`;
        for (const targetId of targetIds) {
          const enemy = state.enemies.find((e) => e.id === targetId);
          if (!enemy) return "Unknown target";
          if (manhattanDistance(player, enemy) > rangeTargetDistance(spec)) return "Target out of range";
        }
      } else if (usesAnchoredPatternPlacement(spec)) {
        if (action.anchorX === undefined || action.anchorY === undefined) return "Select placement";
        const direction = "e" as const;
        const placement = evaluateAnchoredPatternPlacement(
          player,
          { x: action.anchorX, y: action.anchorY },
          spec,
          direction,
          state,
        );
        if (placement.tooFar) return "outside maximum range";
        if (placement.tooCloseKeys.size > 0) return "inside minimum range";
        if (!placement.valid) return "Placement out of range";
      }
      return null;
    }
    case "shove": {
      const blocked = actionTierBlocked(player, "aux", state);
      if (blocked) return blocked;
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
      return validateSprintBegin(state, playerId);
    }
    case "sprintMove": {
      return validateSprintMove(state, playerId, action.x, action.y);
    }
    case "sprintCancel": {
      return validateSprintCancel(state, playerId);
    }
    case "weaponSwap": {
      const blocked = actionTierBlocked(player, "aux", state);
      if (blocked) return blocked;
      if (!player.weapon2) return "No carried weapon";
      return null;
    }
    case "rez": {
      const blocked = actionTierBlocked(player, "main", state);
      if (blocked) return blocked;
      const target = state.players.find((p) => p.id === action.targetPlayerId);
      if (!target) return "Unknown ally";
      if (!isOrthogonallyAdjacent({ x: player.x, y: player.y }, { x: target.x, y: target.y })) {
        return "Ally must be adjacent";
      }
      if ((target.hp ?? 0) > 0) return "Ally is not down";
      return null;
    }
    case "armorAction": {
      const blocked = actionTierBlocked(player, "support", state);
      if (blocked) return blocked;
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
      if (structured.kind === "place_tower") {
        if (action.x === undefined || action.y === undefined) return "Select placement tile";
        return validatePlaceTower(state, player, action.x, action.y, structured.range);
      }
      return null;
    }
    case "towerTeleport": {
      return validateTowerTeleport(state, player, action.x, action.y, action.keraunoTargetEnemyId);
    }
    case "kataptyEndTurn": {
      return validateKataptyEndTurn(state, player, action.targetEnemyIds);
    }
    case "classActive": {
      const blocked = actionTierBlocked(player, "support", state);
      if (blocked) return blocked;
      return null;
    }
    case "weaponActive": {
      const blocked = actionTierBlocked(player, "main", state);
      if (blocked) return blocked;
      if (isSabaothWeaponName(player.weapon) && action.omnistrike) {
        return validateOmnistrikeAction(state, player, action.omnistrike);
      }
      if (isWarhookWeaponName(player.weapon) && action.warhook) {
        return validateWarhookAction(state, player, action.warhook);
      }
      return null;
    }
    case "useEquipment": {
      const blocked = actionTierBlocked(player, "support", state);
      if (blocked) return blocked;
      if (
        areActionLimitsEnforced(state) &&
        player.equipmentUses !== undefined &&
        player.equipmentUses <= 0
      ) {
        return "Equipment already used";
      }
      return null;
    }
    case "interact": {
      const blocked = actionTierBlocked(player, "support", state);
      if (blocked) return blocked;
      if (validateSeedInteract(state, player) === null && getSeedAt(state, player.x, player.y)) {
        return null;
      }
      return null;
    }
    case "commitHaste": {
      if (!areActionLimitsEnforced(state)) return "Action limits disabled";
      return validateCommitHaste(player, action.tier);
    }
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
      maybeSpendActionTier(state, player, "main");
      const weapon = resolveAttackWeapon(player, action.weaponName);
      if (!weapon) return "Invalid weapon";
      const spec = resolveCombatAttackSpec(player, weapon);
      if (!spec) return "Weapon has no attack profile";
      let result;
      if (isRangeTargetAttack(spec)) {
        const targetIds = resolveRangeAttackTargetIds(action);
        if (targetIds.length) {
          const { total, detail } = resolveAttackDamage(spec, action.damageRoll);
          const effects = spec.effects ?? [];
          const targets: { enemyId: string; x: number; y: number }[] = [];
          for (const targetId of targetIds) {
            const enemy = state.enemies.find((e) => e.id === targetId)!;
            applyDamageToEnemy(enemy, total, state);
            applyEffectStacks(enemy, effects);
            targets.push({ enemyId: enemy.id, x: enemy.x, y: enemy.y });
          }
          result = { damage: total, detail, targets, effects };
        } else {
          result = applyAttackToEnemies(
            state,
            spec,
            { x: player.x, y: player.y },
            action.direction,
            action.damageRoll,
          );
        }
      } else {
        const direction = usesAnchoredPatternPlacement(spec) ? "e" : action.direction;
        const attackOrigin =
          usesAnchoredPatternPlacement(spec) && action.anchorX != null && action.anchorY != null
            ? patternOriginFromAnchor({ x: action.anchorX, y: action.anchorY }, spec.anchorTile, direction)
            : { x: player.x, y: player.y };
        result = applyAttackToEnemies(
          state,
          spec,
          attackOrigin,
          direction,
          action.damageRoll,
        );
      }
      const hitEnemies = result.targets
        .map((t) => state.enemies.find((e) => e.id === t.enemyId))
        .filter(Boolean);
      const names = hitEnemies.map((e) => enemyLabel(e!)).join(", ");
      const defeated = hitEnemies
        .filter((e) => (e!.hp ?? 0) <= 0)
        .map((e) => enemyLabel(e!))
        .join(", ");
      let msg = `${playerLabel(player)} attacked (${result.detail} dmg) → ${names || "no targets"}`;
      if (defeated) msg += `; defeated ${defeated}`;
      return msg;
    }
    case "shove": {
      maybeSpendActionTier(state, player, "aux");
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
      return applySprintBegin(state, playerId);
    }
    case "sprintMove": {
      return applySprintMove(state, playerId, action.x, action.y);
    }
    case "sprintCancel": {
      return applySprintCancel(state, playerId);
    }
    case "weaponSwap": {
      maybeSpendActionTier(state, player, "aux");
      const primary = player.weapon;
      player.weapon = player.weapon2!;
      player.weapon2 = primary;
      return `${playerLabel(player)} swapped to ${player.weapon}`;
    }
    case "selectWeaponVariant": {
      const weapon = getWeaponByName(player.weapon ?? "");
      const bombs = weapon?.attack?.bombs!;
      if (!player.counters) player.counters = {};
      ensureSabaothCharges(player);
      const current = player.counters.sabaothBomb;
      if (action.index !== current) {
        player.counters.sabaothCharges = (player.counters.sabaothCharges ?? 0) - 1;
      }
      player.counters.sabaothBomb = action.index;
      return `${playerLabel(player)} selected ${bombs[action.index]?.name ?? "variant"}`;
    }
    case "rez": {
      maybeSpendActionTier(state, player, "main");
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
        maybeSpendActionTier(state, player, "support");
        return `${playerLabel(player)} used ${armor.name} armor action`;
      }
      maybeSpendActionTier(state, player, "support");
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
      if (structured.kind === "place_tower" && action.x != null && action.y != null) {
        const result = applyPlaceTower(state, player, action.x, action.y);
        if ("error" in result) return result.error;
        return `${playerLabel(player)} ${result.message}`;
      }
      return `${playerLabel(player)} used armor action`;
    }
    case "towerTeleport": {
      const msg = applyTowerTeleport(state, player, action.x, action.y, action.keraunoTargetEnemyId);
      return `${playerLabel(player)} ${msg}`;
    }
    case "kataptyEndTurn": {
      const tower = getPlayerTower(state, player.id)!;
      const strikeMsg = applyKataptyStrike(state, tower, action.targetEnemyIds ?? []);
      if (!player.counters) player.counters = {};
      player.counters.kataptyResolved = 1;
      return `${playerLabel(player)} ${strikeMsg}`;
    }
    case "classActive": {
      maybeSpendActionTier(state, player, "support");
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
      maybeSpendActionTier(state, player, "main");
      if (isSabaothWeaponName(player.weapon) && action.omnistrike) {
        const result = applyOmnistrike(state, player, action.omnistrike);
        const hitEnemies = result.targets
          .map((t) => state.enemies.find((e) => e.id === t.enemyId))
          .filter(Boolean);
        const names = hitEnemies.map((e) => enemyLabel(e!)).join(", ");
        const defeated = hitEnemies
          .filter((e) => (e!.hp ?? 0) <= 0)
          .map((e) => enemyLabel(e!))
          .join(", ");
        let msg = `${playerLabel(player)} used ${result.message} → ${names || "no targets"}`;
        if (defeated) msg += `; defeated ${defeated}`;
        return msg;
      }
      if (isWarhookWeaponName(player.weapon) && action.warhook) {
        const result = applyWarhook(state, player, action.warhook);
        const hitEnemies = result.targets
          .map((t) => state.enemies.find((e) => e.id === t.enemyId))
          .filter(Boolean);
        const names = hitEnemies.map((e) => enemyLabel(e!)).join(", ");
        const defeated = hitEnemies
          .filter((e) => (e!.hp ?? 0) <= 0)
          .map((e) => enemyLabel(e!))
          .join(", ");
        let msg = `${playerLabel(player)} used ${result.message} (${result.detail} dmg) → ${names || "no targets"}`;
        if (defeated) msg += `; defeated ${defeated}`;
        return msg;
      }
      const weapon = getWeaponByName(player.weapon ?? "");
      addPendingAction(
        state,
        createPendingAction("weaponActive", `${weapon?.name ?? "Weapon"} active`, {
          actorPlayerId: playerId,
          detail: weapon?.name ?? action.detail,
          targetEnemyIds: action.targetEnemyIds,
          targetPlayerIds: action.targetPlayerIds,
          direction: action.direction,
        }),
      );
      return `${playerLabel(player)} used weapon active (pending GM)`;
    }
    case "useEquipment": {
      maybeSpendActionTier(state, player, "support");
      if (areActionLimitsEnforced(state)) player.equipmentUses = 0;
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
      maybeSpendActionTier(state, player, "support");
      const seedMsg = applySeedInteract(state, player);
      if (seedMsg) return `${playerLabel(player)} ${seedMsg}`;
      addPendingAction(
        state,
        createPendingAction("interact", "Interact", {
          actorPlayerId: playerId,
          detail: action.detail,
        }),
      );
      return `${playerLabel(player)} interacted (pending GM)`;
    }
    case "commitHaste": {
      const detail = applyCommitHaste(player, action.tier);
      return `${playerLabel(player)} ${detail}`;
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
        const reversalOk =
          isCampaignFeatureUnlocked("reversals", state.constructedBaseUpgrades ?? []) &&
          target &&
          armor?.reversal &&
          (target.reversalCharges ?? 0) > 0 &&
          (!isYadathanArmorName(target.armor) || yadathanReversalEligible(state, target.id));
        if (reversalOk) {
          const incomingDamage = action.damage ?? parsed.damage ?? 0;
          state.combat.pendingReaction = {
            playerId: target.id,
            sourceEnemyId: enemy.id,
            trigger: armor!.reversal!.trigger,
            label: `${armor!.name} Reversal`,
            incomingDamage: incomingDamage > 0 ? incomingDamage : undefined,
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
  if (!isCampaignFeatureUnlocked("reversals", state.constructedBaseUpgrades ?? [])) {
    return "Reversals disabled";
  }
  const reaction = state.combat?.pendingReaction;
  if (!reaction || reaction.playerId !== playerId) return "No reversal pending";
  const player = state.players.find((p) => p.id === playerId);
  if (!player || (player.reversalCharges ?? 0) <= 0) return "No reversal charges";
  return null;
}

export function applyTriggerReversal(
  state: GameState,
  playerId: string,
  extraAllyIds: string[] = [],
): string {
  const player = state.players.find((p) => p.id === playerId)!;
  const reaction = state.combat?.pendingReaction;
  const incomingDamage = reaction?.incomingDamage ?? 1;
  player.reversalCharges = (player.reversalCharges ?? 0) - 1;
  const extraCount = extraAllyIds.length;
  if (extraCount > 0) {
    player.reversalCharges = Math.max(0, (player.reversalCharges ?? 0) - extraCount);
  }
  if (state.combat) state.combat.pendingReaction = null;
  const armor = getArmorByName(player.armor ?? "");

  if (isYadathanArmorName(player.armor)) {
    const detail = applyYadathanReversal(state, player, incomingDamage, extraAllyIds);
    return `${playerLabel(player)} triggered Reversal — ${detail}`;
  }

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
  if (!isCampaignFeatureUnlocked("reversals", state.constructedBaseUpgrades ?? [])) {
    return "Reversals disabled";
  }
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
  weaponName?: string,
): { x: number; y: number }[] {
  const player = state.players.find((p) => p.id === playerId);
  const weapon = player ? resolveAttackWeapon(player, weaponName) ?? player.weapon : undefined;
  const spec = player ? resolveCombatAttackSpec(player, weapon) : getWeaponAttackSpec(weapon);
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
    case "resetMovement": {
      if (!ctx.playerId) return { handled: true, error: "Only players can reset movement" };
      const err = validateResetMovement(state, ctx.playerId);
      if (err) return { handled: true, error: err };
      return { handled: true, message: applyResetMovement(state, ctx.playerId) };
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
      return {
        handled: true,
        message: applyTriggerReversal(state, ctx.playerId, parsed.extraAllyIds ?? []),
      };
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

