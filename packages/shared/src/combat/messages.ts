import type { GaemRole, ClientMessage, TerrainType } from "../types.js";
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
  isSandboxMode,
  applyEnemyMove,
  validateEnemyMove,
} from "../game.js";
import { getArmorByName, getArmorSpeed, getWeaponByName } from "../player-data.js";
import type { StructuredArmorAction } from "./types.js";
import { createDefaultActionBudget, type ActionTier } from "./types.js";
import { getEnemyScale, enemyFootprintTiles } from "../enemy-data.js";
import { buildBoardOccupancy } from "../game.js";
import { coordKey, isInBounds, isTerrainType, isWalkable, setTileTerrain, tileAt } from "../map.js";
import { isOrthogonallyAdjacent } from "../patterns.js";
import { actionTierBlockedReason, applyCommitHaste, spendActionTierOrHaste, validateCommitHaste } from "./actions.js";
import {
  adjacentEnemies,
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
  applyRangeAttackToEnemies,
  applySwarmEnemyAttackToPlayer,
  applyWarhook,
  collectAttackTiles,
  effectiveRangeLimit,
  elevationBonusTileCandidates,
  enemiesInTiles,
  getWeaponAttackSpec,
  isDirectTargetEnemyAttack,
  isWarhookWeaponName,
  manhattanDistance,
  parseEnemyAttackString,
  resolveAttackWeapon,
  resolveCombatAttackSpec,
  resolveRangeAttackTargetIds,
  ensureSabaothCharges,
  hasSabaothBombSelected,
  isSabaothWeaponName,
  validateOmnistrikeAction,
  validateWarhookAction,
} from "./attack.js";
import {
  applyAnnihilationCorridorEndOfTurnDamage,
  applyForceProjection,
  applyHylicCorridor,
  applyHylicRejectionField,
  applyRedirectionCircuits,
  equipmentRequiresBoardPlacement,
  isHylicAnnihilationCorridor,
  isHylicRejectionField,
  isMotesOfBountifulForethought,
  isThoughtGuidingRedirectionCircuits,
  isTransientForceProjection,
  validateForceProjection,
  validateHylicCorridorAction,
  validateHylicRejectionField,
  validateMotesPlacement,
  validateRedirectionCircuits,
  applyMotesPlacement,
} from "./equipment.js";
import { applyEffectStacks, applyTileEffectStacks, clearEffectStacks, clearTileEffects, hasTileEffects, parseEffectToken, tickUnitEndOfTurn } from "./effects.js";
import { isKnownEffectId } from "../effects-data.js";
import { createPendingAction, addPendingAction, applyAssistedOutcome } from "./pending.js";
import { setActiveEnemy } from "./enemy.js";
import {
  buildSwarmGroups,
  dedupeSwarmTargetIds,
  exhaustSwarmMembers,
  markSwarmChipResolved,
  maxSwarmStrikesAgainstTarget,
  reconcileSwarmHp,
  requireSwarmChipResolved,
  swarmGroupForEnemy,
  validateSwarmChip,
} from "./swarm.js";
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
  resolveKataptyTargetIds,
  validateKataptyEndTurn,
  validatePlaceTower,
  validateSeedInteract,
  validateTowerTeleport,
  yadathanReversalEligible,
} from "./yadathan.js";
import {
  computeAssistedLaunch,
  formatAssistedLaunchMessage,
  validateAssistedLaunch,
} from "./assisted-launch.js";
import {
  applyProvokeAndFormat,
  collectPathProvokeTriggers,
  previewSprintProvokes,
  previewPathProvokes,
  recordPassedEnemiesOnPath,
} from "./provoke.js";
import { applyUseGear, validateUseGear, applySoterCoverIfEligible } from "./gear.js";
import {
  applyKushielPushRecoil,
  applyPostAttackLoadoutHooks,
  applyStructuredReversalEffect,
  applyWeaponActiveStructured,
  resolveAttackUseBreaker,
  validateWeaponActiveStructured,
} from "./loadout-combat.js";
import {
  applyClassActive,
  applyClassPassive,
  applyPostMovementHooks,
  applyResolveClassReaction,
  classActiveTierFor,
  handleEnemyDefeated,
  validateClassActive,
  validateClassPassive,
  validateResolveClassReaction,
} from "./class-abilities.js";
import { playerArmorGearName, validateRemoveAttractor, applyRemoveAttractor, applyAttractorEndOfTurnPulls } from "./attractor.js";
import { applyTransferenceHeal } from "./transference.js";
import {
  computePathCost,
  normalizeMovementPath,
} from "./movement.js";
import { spendMovement } from "./actions.js";

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
    const hookMsgs = applyPostMovementHooks(state, player, "player").messages;
    let msg = `${playerLabel(player)} moved to (${dest.x}, ${dest.y})`;
    if (hookMsgs.length) msg = `${hookMsgs.join("; ")}; ${msg}`;
    return msg;
  }
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return "Unknown player";
  const resolved = normalizeMovementPath(state, playerId, path);
  if (!resolved) return "No path to destination";
  const err = validateMovementPath(state, playerId, resolved);
  if (err) return err;
  const computed = computePathCost(state, player, resolved)!;
  if (!isSandboxMode(state) && player.actionBudget) {
    if (!spendMovement(player.actionBudget, computed.total)) return "Not enough movement";
  }
  const triggers = collectPathProvokeTriggers(state, playerId, resolved);
  const stepMessages: string[] = [];
  const traveled: { x: number; y: number }[] = [];
  for (const step of resolved) {
    player.x = step.x;
    player.y = step.y;
    traveled.push(step);
    const hooks = applyPostMovementHooks(state, player, "player");
    stepMessages.push(...hooks.messages);
    if (hooks.interrupt || (player.hp ?? 0) <= 0) break;
  }
  let provokeMsg = "";
  if (triggers.length) {
    provokeMsg = applyProvokeAndFormat(state, { kind: "player", player }, triggers);
  }
  recordPassedEnemiesOnPath(state, player, traveled.length ? traveled : resolved);
  const dest = traveled[traveled.length - 1] ?? resolved[resolved.length - 1]!;
  let msg = `${playerLabel(player)} moved to (${dest.x}, ${dest.y})`;
  if (stepMessages.length) msg = `${stepMessages.join("; ")}; ${msg}`;
  if (provokeMsg) msg = `${provokeMsg}; ${msg}`;
  return msg;
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
  if (!isSandboxMode(state) && state.roundPhase !== "playerTurn") return "Wrong phase";
  if (!player.actionBudget) {
    const speed = player.speed ?? getArmorSpeed(player.armor);
    if (speed) player.actionBudget = createDefaultActionBudget(speed);
  }

  switch (action.action) {
    case "attack": {
      const freeAttack = (player.counters?.freeWeaponAttack ?? 0) > 0;
      if (!freeAttack) {
        const blocked = actionTierBlocked(player, "main", state);
        if (blocked) return blocked;
      }
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
          const limit = effectiveRangeLimit(state, player, rangeTargetDistance(spec), enemy);
          if (manhattanDistance(player, enemy) > limit) return "Target out of range";
        }
      } else if (usesAnchoredPatternPlacement(spec)) {
        if (action.anchorX === undefined || action.anchorY === undefined) return "Select placement";
        const placement = evaluateAnchoredPatternPlacement(
          player,
          { x: action.anchorX, y: action.anchorY },
          spec,
          action.direction,
          state,
        );
        if (placement.tooFar) return "outside maximum range";
        if (placement.tooCloseKeys.size > 0) return "inside minimum range";
        if (!placement.valid) return "Placement out of range";
      } else if (action.elevationBonusTile) {
        const attackOrigin = { x: player.x, y: player.y };
        const baseTiles = collectAttackTiles(state, attackOrigin, spec, action.direction);
        const candidates = elevationBonusTileCandidates(state, attackOrigin, baseTiles);
        const key = `${action.elevationBonusTile.x},${action.elevationBonusTile.y}`;
        if (!candidates.some((c) => `${c.x},${c.y}` === key)) return "Invalid elevation bonus tile";
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
      const freeSwap = state.combat?.gearCheckGrants?.[playerId];
      if (!freeSwap) {
        const blocked = actionTierBlocked(player, "aux", state);
        if (blocked) return blocked;
      }
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
    case "assistedLaunch": {
      return validateAssistedLaunch(state, playerId, action.anchorX, action.anchorY);
    }
    case "kataptyEndTurn": {
      return validateKataptyEndTurn(state, player, action.targetEnemyIds);
    }
    case "classActive": {
      const tier = classActiveTierFor(player);
      const blocked = actionTierBlocked(player, tier, state);
      if (blocked) return blocked;
      return validateClassActive(state, player, action);
    }
    case "classPassive": {
      return validateClassPassive(state, player, action);
    }
    case "resolveClassReaction": {
      return validateResolveClassReaction(state, playerId, action);
    }
    case "weaponActive": {
      if (player.weapon === "Heaven Burning Sword") {
        const blocked = actionTierBlocked(player, "aux", state);
        if (blocked) return blocked;
      } else {
        const blocked = actionTierBlocked(player, "main", state);
        if (blocked) return blocked;
      }
      if (isSabaothWeaponName(player.weapon) && action.omnistrike) {
        return validateOmnistrikeAction(state, player, action.omnistrike);
      }
      if (isWarhookWeaponName(player.weapon) && action.warhook) {
        return validateWarhookAction(state, player, action.warhook);
      }
      return validateWeaponActiveStructured(state, player, action);
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
      const equipmentName = action.detail ?? player.equipment;
      if (equipmentRequiresBoardPlacement(equipmentName)) {
        if (isHylicAnnihilationCorridor(equipmentName)) {
          if (action.anchorX === undefined || action.anchorY === undefined) return "Select placement";
          if (!action.direction) return "Select corridor direction";
          return validateHylicCorridorAction(
            state,
            player,
            { x: action.anchorX, y: action.anchorY },
            action.direction,
          );
        }
        if (isHylicRejectionField(equipmentName)) {
          if (!action.coverTiles?.length) return "Select cover tiles";
          return validateHylicRejectionField(state, player, action.coverTiles);
        }
        if (isTransientForceProjection(equipmentName)) {
          return validateForceProjection(state, player, action);
        }
        if (isThoughtGuidingRedirectionCircuits(equipmentName)) {
          return validateRedirectionCircuits(state, player, action);
        }
        if (isMotesOfBountifulForethought(equipmentName)) {
          if (!action.coverTiles?.length) return "Select 3 tiles";
          return validateMotesPlacement(state, player, action.coverTiles);
        }
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
    case "useGear": {
      const blocked = actionTierBlocked(player, "support", state);
      if (blocked) return blocked;
      return validateUseGear(state, player, action.detail);
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
      const freeAttack = (player.counters?.freeWeaponAttack ?? 0) > 0;
      if (freeAttack) {
        if (!player.counters) player.counters = {};
        player.counters.freeWeaponAttack = 0;
      } else {
        maybeSpendActionTier(state, player, "main");
      }
      const weapon = resolveAttackWeapon(player, action.weaponName);
      if (!weapon) return "Invalid weapon";
      const spec = resolveCombatAttackSpec(player, weapon);
      if (!spec) return "Weapon has no attack profile";
      let result;
      const weaponName = weapon;
      const useBreaker = resolveAttackUseBreaker(player, weaponName, action.useBreaker);
      if (isRangeTargetAttack(spec)) {
        const targetIds = dedupeSwarmTargetIds(state, resolveRangeAttackTargetIds(action));
        if (targetIds.length) {
          result = applyRangeAttackToEnemies(state, spec, targetIds, action.damageRoll, {
            useBreaker,
            weaponName,
          });
        } else {
          result = applyAttackToEnemies(
            state,
            spec,
            { x: player.x, y: player.y },
            action.direction,
            action.damageRoll,
            { useBreaker, weaponName, elevationBonusTile: action.elevationBonusTile },
          );
        }
      } else {
        const direction = action.direction;
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
          { useBreaker, weaponName, elevationBonusTile: action.elevationBonusTile },
        );
      }
      const attackTileKeys = new Set(
        collectAttackTiles(state, { x: player.x, y: player.y }, spec, action.direction).map((t) =>
          coordKey(t.x, t.y),
        ),
      );
      const hitIds = result.targets.map((t) => t.enemyId);
      const hitEnemies = hitIds
        .map((id) => state.enemies.find((e) => e.id === id))
        .filter(Boolean);
      const names = hitEnemies.map((e) => enemyLabel(e!)).join(", ");
      const defeated = hitEnemies
        .filter((e) => (e!.hp ?? 0) <= 0)
        .map((e) => enemyLabel(e!))
        .join(", ");
      let msg = `${playerLabel(player)} attacked (${result.detail} dmg) → ${names || "no targets"}`;
      const xfer = applyTransferenceHeal(player, result.damage);
      if (xfer) msg += `; ${xfer}`;
      const defeatMsgs: string[] = [];
      for (const e of hitEnemies) {
        if ((e!.hp ?? 0) <= 0) {
          const tokenMsg = handleEnemyDefeated(state, e!, playerId);
          if (tokenMsg) defeatMsgs.push(tokenMsg);
        }
      }
      if (defeated) msg += `; defeated ${defeated}`;
      if (defeatMsgs.length) msg += `; ${defeatMsgs.join("; ")}`;
      const loadoutMsgs = applyPostAttackLoadoutHooks(state, player, weaponName, hitIds, attackTileKeys);
      if (loadoutMsgs.length) msg += `; ${loadoutMsgs.join("; ")}`;
      applySoterCoverIfEligible(player, (player.counters?.movedThisTurn ?? 0) > 0, true);
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
          const prevGroups = buildSwarmGroups(state);
          enemy.x = pushX;
          enemy.y = pushY;
          reconcileSwarmHp(state, prevGroups);
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
      const player = state.players.find((p) => p.id === playerId)!;
      const triggers = previewSprintProvokes(state, playerId, action.x, action.y);
      let provokeMsg = "";
      if (triggers.length) {
        provokeMsg = applyProvokeAndFormat(state, { kind: "player", player }, triggers);
      }
      const base = applySprintMove(state, playerId, action.x, action.y);
      const hookMsgs = applyPostMovementHooks(state, player, "player").messages;
      recordPassedEnemiesOnPath(state, player, [{ x: action.x, y: action.y }]);
      let msg = base;
      if (hookMsgs.length) msg = `${hookMsgs.join("; ")}; ${msg}`;
      if (provokeMsg) msg = `${provokeMsg}; ${msg}`;
      return msg;
    }
    case "sprintCancel": {
      return applySprintCancel(state, playerId);
    }
    case "weaponSwap": {
      const freeSwap = state.combat?.gearCheckGrants?.[playerId];
      if (freeSwap) {
        delete state.combat!.gearCheckGrants![playerId];
        applyEffectStacks(player, ["Transference:1"]);
      } else {
        maybeSpendActionTier(state, player, "aux");
      }
      const primary = player.weapon;
      player.weapon = player.weapon2!;
      player.weapon2 = primary;
      let msg = `${playerLabel(player)} swapped to ${player.weapon}`;
      if (freeSwap) msg += " (Gear Check!)";
      return msg;
    }
    case "selectWeaponVariant": {
      const weapon = getWeaponByName(player.weapon ?? "");
      // Only reached for bomb-carrying weapons (Sabaoth), so bombs is present.
      // eslint-disable-next-line @typescript-eslint/no-non-null-asserted-optional-chain
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
        const triggers = previewSprintProvokes(state, playerId, landing.x, landing.y);
        let provokeMsg = "";
        if (triggers.length) {
          provokeMsg = applyProvokeAndFormat(state, { kind: "player", player }, triggers);
        }
        player.x = landing.x;
        player.y = landing.y;
        maybeSpendActionTier(state, player, "support");
        let msg = `${playerLabel(player)} used ${armor.name} armor action`;
        if (provokeMsg) msg = `${provokeMsg}; ${msg}`;
        return msg;
      }
      maybeSpendActionTier(state, player, "support");
      if (structured.kind === "push_recoil") {
        const push = action.push ?? structured.push ?? 1;
        const detail = applyKushielPushRecoil(
          state,
          player,
          action.targetEnemyId,
          action.targetPlayerId,
          push,
        );
        return `${playerLabel(player)} ${detail}`;
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
    case "assistedLaunch": {
      const preview = computeAssistedLaunch(state, playerId, action.anchorX, action.anchorY)!;
      const triggers = previewPathProvokes(state, playerId, preview.path);
      let provokeMsg = "";
      if (triggers.length) {
        provokeMsg = applyProvokeAndFormat(state, { kind: "player", player }, triggers);
      }
      const stepMessages: string[] = [];
      for (const step of preview.path) {
        player.x = step.x;
        player.y = step.y;
        stepMessages.push(...applyPostMovementHooks(state, player, "player").messages);
        if ((player.hp ?? 0) <= 0) break;
      }
      if (!player.counters) player.counters = {};
      player.counters.assistedLaunchUsed = 1;
      recordPassedEnemiesOnPath(state, player, preview.path);
      let msg = formatAssistedLaunchMessage(player, preview);
      if (stepMessages.length) msg = `${stepMessages.join("; ")}; ${msg}`;
      if (provokeMsg) msg = `${provokeMsg}; ${msg}`;
      return msg;
    }
    case "kataptyEndTurn": {
      const tower = getPlayerTower(state, player.id)!;
      const resolved = resolveKataptyTargetIds(state, player.id, action.targetEnemyIds);
      if ("error" in resolved) return resolved.error;
      const strikeMsg = applyKataptyStrike(state, tower, resolved.ids);
      if (!player.counters) player.counters = {};
      player.counters.kataptyResolved = 1;
      return `${playerLabel(player)} ${strikeMsg}`;
    }
    case "classActive": {
      const tier = classActiveTierFor(player);
      maybeSpendActionTier(state, player, tier);
      return applyClassActive(state, playerId, action);
    }
    case "classPassive": {
      return applyClassPassive(state, playerId, action);
    }
    case "resolveClassReaction": {
      const reaction = state.combat?.pendingClassReaction;
      if (reaction?.kind === "borrowing_follow_up" && action.accept) {
        maybeSpendActionTier(state, player, "support");
      }
      return applyResolveClassReaction(state, playerId, action);
    }
    case "weaponActive": {
      const structuredMsg = applyWeaponActiveStructured(state, player, action);
      if (structuredMsg) {
        if (player.weapon === "Heaven Burning Sword") {
          maybeSpendActionTier(state, player, "aux");
        } else {
          maybeSpendActionTier(state, player, "main");
        }
        return structuredMsg;
      }
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
        const wh = action.warhook;
        const triggers = previewSprintProvokes(state, playerId, wh.landingX, wh.landingY);
        let provokeMsg = "";
        if (triggers.length) {
          provokeMsg = applyProvokeAndFormat(state, { kind: "player", player }, triggers);
        }
        const result = applyWarhook(state, player, wh);
        recordPassedEnemiesOnPath(state, player, [{ x: wh.landingX, y: wh.landingY }]);
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
        if (provokeMsg) msg = `${provokeMsg}; ${msg}`;
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
      if (playerArmorGearName(player) === "Expanded Aggression Rituals (Armor)") {
        const gearMsg = applyUseGear(state, player, "Expanded Aggression Rituals (Armor)");
        return `${playerLabel(player)} used equipment${gearMsg ? ` — ${gearMsg}` : ""}`;
      }
      if (isHylicAnnihilationCorridor(action.detail ?? player.equipment) && action.direction) {
        const anchor = { x: action.anchorX!, y: action.anchorY! };
        const detail = applyHylicCorridor(state, player, anchor, action.direction);
        return `${playerLabel(player)} used Hylic Annihilation Corridor — ${detail}`;
      }
      if (isHylicRejectionField(action.detail ?? player.equipment) && action.coverTiles) {
        const detail = applyHylicRejectionField(state, action.coverTiles);
        return `${playerLabel(player)} used Hylic Rejection Field — ${detail}`;
      }
      if (isThoughtGuidingRedirectionCircuits(action.detail ?? player.equipment) && action.sourceEnemyId != null) {
        const { message, hitEnemyIds } = applyRedirectionCircuits(state, player, action);
        const defeatMsgs: string[] = [];
        for (const id of hitEnemyIds) {
          const enemy = state.enemies.find((e) => e.id === id);
          if (enemy && (enemy.hp ?? 0) <= 0) {
            const tokenMsg = handleEnemyDefeated(state, enemy, playerId);
            if (tokenMsg) defeatMsgs.push(tokenMsg);
          }
        }
        if (defeatMsgs.length) return `${message}; ${defeatMsgs.join("; ")}`;
        return message;
      }
      if (isTransientForceProjection(action.detail ?? player.equipment) && action.projectionX != null) {
        const { message, result, hitEnemyIds } = applyForceProjection(state, player, action);
        const xfer = applyTransferenceHeal(player, result.damage);
        const defeatMsgs: string[] = [];
        for (const id of hitEnemyIds) {
          const enemy = state.enemies.find((e) => e.id === id);
          if (enemy && (enemy.hp ?? 0) <= 0) {
            const tokenMsg = handleEnemyDefeated(state, enemy, playerId);
            if (tokenMsg) defeatMsgs.push(tokenMsg);
          }
        }
        let msg = message;
        if (xfer) msg += `; ${xfer}`;
        if (defeatMsgs.length) msg += `; ${defeatMsgs.join("; ")}`;
        return msg;
      }
      if (isMotesOfBountifulForethought(action.detail ?? player.equipment) && action.coverTiles) {
        const detail = applyMotesPlacement(state, player, action.coverTiles);
        return `${playerLabel(player)} used Motes of Bountiful Forethought — ${detail}`;
      }
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
    case "useGear": {
      maybeSpendActionTier(state, player, "support");
      const detail = applyUseGear(state, player, action.detail);
      return `${playerLabel(player)} ${detail}`;
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
      if (!isSandboxMode(state) && enemy.exhausted) return "Enemy has ended turn";
      const chipErr = requireSwarmChipResolved(state, action.enemyId);
      if (chipErr) return chipErr;
      for (const step of action.path) {
        const err = validateEnemyMove(state, action.enemyId, step.x, step.y);
        if (err) return err;
      }
      return null;
    }
    case "swarmChip":
      return validateSwarmChip(state, action.enemyId, action.targetPlayerIds, action.targetEnemyIds);
    case "attack": {
      const chipErr = requireSwarmChipResolved(state, action.enemyId);
      if (chipErr) return chipErr;
      if (action.swarmStrikes != null) {
        const group = swarmGroupForEnemy(state, action.enemyId);
        if (!group) return "Not a swarm";
        const target = action.targetPlayerId
          ? state.players.find((p) => p.id === action.targetPlayerId)
          : null;
        if (!target) return "Invalid target";
        const max = maxSwarmStrikesAgainstTarget(state, action.enemyId, target);
        if (!Number.isInteger(action.swarmStrikes) || action.swarmStrikes < 1 || action.swarmStrikes > max) {
          return "Invalid strike count";
        }
      }
      return null;
    }
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
      for (const step of action.path) {
        applyEnemyMove(state, action.enemyId, step.x, step.y);
      }
      setActiveEnemy(state, action.enemyId);
      return `${enemyLabel(enemy)} moved to (${dest.x}, ${dest.y})`;
    }
    case "swarmChip": {
      const group = swarmGroupForEnemy(state, action.enemyId);
      const hits: string[] = [];
      for (const id of action.targetPlayerIds) {
        const player = state.players.find((p) => p.id === id);
        if (!player) continue;
        applyDamageToPlayer(player, 1, state);
        hits.push(playerLabel(player));
      }
      for (const id of action.targetEnemyIds) {
        const target = state.enemies.find((e) => e.id === id);
        if (!target) continue;
        applyDamageToEnemy(target, 1, state);
        hits.push(enemyLabel(target));
      }
      markSwarmChipResolved(state, action.enemyId);
      setActiveEnemy(state, group?.canonicalId ?? action.enemyId);
      const label = enemyLabel(enemy);
      if (!hits.length) return `${label} swarm chip (no targets)`;
      return `${label} swarm chip → ${hits.join(", ")}`;
    }
    case "attack": {
      setActiveEnemy(state, enemy.id);
      const attacks = enemy.name ? enemyAttacks(enemy.name) : [];
      const attackText = attacks[action.attackIndex];
      const parsed = attackText ? parseEnemyAttackString(attackText) : { raw: "" };
      let msg = `${enemyLabel(enemy)} used attack ${action.attackIndex + 1}`;
      const group = swarmGroupForEnemy(state, enemy.id);
      if (parsed.damage && action.targetPlayerId && group && isDirectTargetEnemyAttack(parsed)) {
        const target = state.players.find((p) => p.id === action.targetPlayerId);
        if (target) {
          const preview = applySwarmEnemyAttackToPlayer(
            state,
            enemy.id,
            parsed,
            action.targetPlayerId,
            { damage: action.damage ?? parsed.damage, strikeCount: action.swarmStrikes },
          );
          msg += ` → ${playerLabel(target)} for ${preview.totalDamage} (${preview.detail})`;
        }
      } else if (parsed.damage && action.targetPlayerId) {
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
      exhaustSwarmMembers(state, enemy.id);
      if (state.combat?.activeEnemyId === enemy.id) setActiveEnemy(state, null);
      const group = swarmGroupForEnemy(state, enemy.id);
      const ticks = tickUnitEndOfTurn(state, enemy);
      const corridorMsg = applyAnnihilationCorridorEndOfTurnDamage(state, enemy);
      const attractorEndMsgs: string[] = [];
      const pullIds = group ? group.memberIds : [enemy.id];
      for (const id of pullIds) {
        const member = state.enemies.find((e) => e.id === id);
        if (!member || (member.hp ?? 0) <= 0) continue;
        attractorEndMsgs.push(...applyAttractorEndOfTurnPulls(state, member, "enemy"));
      }
      let msg = group
        ? `${enemyLabel(enemy)} swarm ended turn`
        : `${enemyLabel(enemy)} ended turn`;
      if (ticks.length) msg += `. ${ticks.join("; ")}`;
      if (corridorMsg) msg += `. ${corridorMsg}`;
      if (attractorEndMsgs.length) msg += `. ${attractorEndMsgs.join("; ")}`;
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
  const prevGroups = buildSwarmGroups(state);
  const enemy = state.enemies.find((e) => e.id === enemyId)!;
  const group = swarmGroupForEnemy(state, enemyId);
  const maxHp = group ? group.maxHp : getEnemyMaxHp(enemy);
  const clamped = clampHp(Math.trunc(hp), maxHp);
  if (group) {
    for (const id of group.memberIds) {
      const member = state.enemies.find((e) => e.id === id);
      if (member) member.hp = clamped;
    }
  } else {
    enemy.hp = clamped;
  }
  reconcileSwarmHp(state, prevGroups);
  return group
    ? `Swarm HP set to ${clamped}`
    : `${enemyLabel(enemy)} HP set to ${clamped}`;
}

export function validateGmApplyDamage(
  state: GameState,
  target: { kind: "player" | "enemy"; id: string },
  amount: number,
): string | null {
  if (!Number.isFinite(amount) || amount <= 0) return "Invalid damage amount";
  if (target.kind === "player" && !state.players.some((p) => p.id === target.id)) return "Unknown player";
  if (target.kind === "enemy" && !state.enemies.some((e) => e.id === target.id)) return "Unknown enemy";
  return null;
}

export function applyGmApplyDamage(
  state: GameState,
  target: { kind: "player" | "enemy"; id: string },
  amount: number,
): string {
  const damage = Math.trunc(amount);
  if (target.kind === "player") {
    const player = state.players.find((p) => p.id === target.id);
    if (!player) return "Unknown player";
    const dealt = applyDamageToPlayer(player, damage, state);
    return `Dealt ${dealt} to ${playerLabel(player)}`;
  }
  const enemy = state.enemies.find((e) => e.id === target.id);
  if (!enemy) return "Unknown enemy";
  const dealt = applyDamageToEnemy(enemy, damage, state);
  return `Dealt ${dealt} to ${enemyLabel(enemy)}`;
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

function validateTileEffectTokens(effects: string[]): string | null {
  if (!effects.length) return "No effects";
  for (const token of effects) {
    const parsed = parseEffectToken(token);
    if (!parsed) return `Invalid effect token: ${token}`;
    if (parsed.stacks === 0) return `Invalid effect stacks: ${token}`;
    if (!isKnownEffectId(parsed.id)) return `Unknown effect: ${parsed.id}`;
  }
  return null;
}

export function validateApplyTileEffect(
  state: GameState,
  x: number,
  y: number,
  effects: string[],
): string | null {
  if (!isInBounds(x, y, state.width, state.height)) return "Out of bounds";
  const tile = tileAt(state.tiles, x, y);
  if (!tile) return "No tile here";
  return validateTileEffectTokens(effects);
}

export function applyApplyTileEffect(
  state: GameState,
  x: number,
  y: number,
  effects: string[],
): string {
  const tile = tileAt(state.tiles, x, y)!;
  applyTileEffectStacks(tile, effects);
  return `Applied ${effects.join(", ")} to (${x}, ${y})`;
}

export function validateClearTileEffects(state: GameState, x: number, y: number): string | null {
  if (!isInBounds(x, y, state.width, state.height)) return "Out of bounds";
  const tile = tileAt(state.tiles, x, y);
  if (!tile) return "No tile here";
  if (!hasTileEffects(tile)) return "No tile effects here";
  return null;
}

export function applyClearTileEffects(state: GameState, x: number, y: number): string {
  const tile = tileAt(state.tiles, x, y)!;
  clearTileEffects(tile);
  return `Cleared tile effects at (${x}, ${y})`;
}

export function validateSetTileTerrain(
  state: GameState,
  x: number,
  y: number,
  terrain: string,
): string | null {
  if (!isInBounds(x, y, state.width, state.height)) return "Out of bounds";
  const tile = tileAt(state.tiles, x, y);
  if (!tile) return "No tile here";
  if (!isTerrainType(terrain)) return `Invalid terrain type: ${terrain}`;
  return null;
}

export function applySetTileTerrain(
  state: GameState,
  x: number,
  y: number,
  terrain: TerrainType,
): string {
  const tile = tileAt(state.tiles, x, y)!;
  setTileTerrain(tile, terrain);
  return `Set (${x}, ${y}) terrain to ${terrain}`;
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

  const structured = applyStructuredReversalEffect(
    state,
    player,
    player.armor ?? "",
    incomingDamage,
    extraAllyIds,
  );
  if (structured) {
    return `${playerLabel(player)} triggered Reversal — ${structured}`;
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
    case "gmApplyDamage": {
      if (ctx.role !== "gm") return { handled: true, error: "Only GM can do that" };
      const err = validateGmApplyDamage(state, parsed.target, parsed.amount);
      if (err) return { handled: true, error: err };
      return { handled: true, message: applyGmApplyDamage(state, parsed.target, parsed.amount) };
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
    case "applyTileEffect": {
      if (ctx.role !== "gm") return { handled: true, error: "Only GM can do that" };
      const err = validateApplyTileEffect(state, parsed.x, parsed.y, parsed.effects);
      if (err) return { handled: true, error: err };
      return { handled: true, message: applyApplyTileEffect(state, parsed.x, parsed.y, parsed.effects) };
    }
    case "clearTileEffects": {
      if (ctx.role !== "gm") return { handled: true, error: "Only GM can do that" };
      const err = validateClearTileEffects(state, parsed.x, parsed.y);
      if (err) return { handled: true, error: err };
      return { handled: true, message: applyClearTileEffects(state, parsed.x, parsed.y) };
    }
    case "setTileTerrain": {
      if (ctx.role !== "gm") return { handled: true, error: "Only GM can do that" };
      const err = validateSetTileTerrain(state, parsed.x, parsed.y, parsed.terrain);
      if (err) return { handled: true, error: err };
      return {
        handled: true,
        message: applySetTileTerrain(state, parsed.x, parsed.y, parsed.terrain),
      };
    }
    case "removeAttractor": {
      const err = validateRemoveAttractor(state, parsed.x, parsed.y, ctx);
      if (err) return { handled: true, error: err };
      return { handled: true, message: applyRemoveAttractor(state, parsed.x, parsed.y) };
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

