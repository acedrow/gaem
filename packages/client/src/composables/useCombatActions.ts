import type { ActionTier, Player } from "@gaem/shared";
import {
  canCommitHasteForTier,
  canSpendActionTier,
  canUseActionTier,
  createDefaultActionBudget,
  getArmorByName,
  getArmorSpeed,
  getSabaothChargesRemaining,
  getWeaponAttackSpec,
  getPlayerTower,
  getSeedAt,
  hasSabaothBombSelected,
  hasteStacks,
  isSabaothWeaponName,
  isYadathanArmorName,
  previewPlayerAttack,
} from "@gaem/shared";
import { computed, ref } from "vue";

import { useGameState } from "./useGameState.js";
import { useSession } from "./useSession.js";

export function useCombatActions(playerId?: () => string | null) {
  const { gameState, yourPlayerId, send } = useGameState();
  const { isGm } = useSession();

  const activePlayerId = computed(() => playerId?.() ?? yourPlayerId.value);

  const activePlayer = computed(() => {
    const id = activePlayerId.value;
    const s = gameState.value;
    if (!id || !s) return null;
    return s.players.find((p) => p.id === id) ?? null;
  });

  const enforceTurns = computed(() => gameState.value?.enforceTurns !== false);
  const enforceActionLimits = computed(() => gameState.value?.enforceActionLimits !== false);

  const isPlayerTurn = computed(() => {
    const s = gameState.value;
    const id = activePlayerId.value;
    if (!s || !id) return false;
    return s.roundPhase === "playerTurn" && s.turn?.role === "player" && s.turn.playerId === id;
  });

  const combatUiUnlocked = computed(() => {
    const s = gameState.value;
    return s != null && s.roundPhase !== "deployment";
  });

  const showPlayerActionBar = computed(() => {
    if (!activePlayerId.value || isGm.value || !combatUiUnlocked.value) return false;
    return isPlayerTurn.value || !enforceTurns.value;
  });

  const showGmCombatUi = computed(() => {
    if (!isGm.value || !combatUiUnlocked.value) return false;
    const s = gameState.value;
    if (!s) return false;
    return s.roundPhase === "gmTurn" || !enforceTurns.value;
  });

  const budget = computed(() => {
    const p = activePlayer.value;
    const s = gameState.value;
    if (!p) return null;
    if (p.actionBudget) return p.actionBudget;
    if (s?.enforceTurns === false || s?.enforceActionLimits === false) {
      const speed = p.speed ?? getArmorSpeed(p.armor);
      if (speed) return createDefaultActionBudget(speed);
    }
    return null;
  });

  const canMain = computed(() => {
    if (!enforceActionLimits.value) return true;
    const p = activePlayer.value;
    return !!p && canUseActionTier(p, "main");
  });
  const canSupport = computed(() => {
    if (!enforceActionLimits.value) return true;
    const p = activePlayer.value;
    return !!p && canUseActionTier(p, "support");
  });
  const canAux = computed(() => {
    if (!enforceActionLimits.value) return true;
    const p = activePlayer.value;
    return !!p && canUseActionTier(p, "aux");
  });

  const hasteRemaining = computed(() => hasteStacks(activePlayer.value ?? {}));

  const hasteGrantedTier = computed(() => activePlayer.value?.hasteActionTier ?? null);

  const actionBudgetChips = computed(() => {
    const p = activePlayer.value;
    const b = budget.value;
    const granted = hasteGrantedTier.value;
    const tierSpent = (tier: ActionTier) => !!b && !canSpendActionTier(b, tier);
    const tierGranted = (tier: ActionTier) => granted === tier;
    const canCommit = (tier: ActionTier) =>
      !!p && enforceActionLimits.value && canCommitHasteForTier(p, tier);
    return {
      mainSpent: tierSpent("main"),
      supportSpent: tierSpent("support"),
      auxSpent: tierSpent("aux"),
      mainGranted: tierGranted("main"),
      supportGranted: tierGranted("support"),
      auxGranted: tierGranted("aux"),
      canCommitMain: canCommit("main"),
      canCommitSupport: canCommit("support"),
      canCommitAux: canCommit("aux"),
    };
  });

  const sprintRemaining = computed(() => budget.value?.sprintRemaining ?? 0);

  const canStartSprint = computed(
    () => canAux.value && sprintRemaining.value <= 0,
  );

  const sabaothChargesRemaining = computed(() => {
    const p = activePlayer.value;
    if (!p) return null;
    return getSabaothChargesRemaining(p);
  });

  const canUseWeaponActive = computed(() => {
    const p = activePlayer.value;
    if (!p?.weapon || !canMain.value) return false;
    if (isSabaothWeaponName(p.weapon)) {
      return (sabaothChargesRemaining.value ?? 0) > 0;
    }
    return true;
  });

  const hasWeaponAttack = computed(() => {
    const p = activePlayer.value;
    if (!getWeaponAttackSpec(p?.weapon)) return false;
    if (isSabaothWeaponName(p?.weapon) && !hasSabaothBombSelected(p ?? undefined)) return false;
    return true;
  });

  const armorStructured = computed(() => {
    const armor = getArmorByName(activePlayer.value?.armor ?? "");
    return armor?.armorActionStructured;
  });

  const canTowerTeleport = computed(() => {
    const p = activePlayer.value;
    const s = gameState.value;
    if (!p || !s || !isYadathanArmorName(p.armor)) return false;
    if ((p.actionBudget?.movementRemaining ?? 0) <= 0) return false;
    return !!getPlayerTower(s, p.id);
  });

  const canInteractSeed = computed(() => {
    const p = activePlayer.value;
    const s = gameState.value;
    if (!p || !s) return false;
    return !!getSeedAt(s, p.x, p.y);
  });

  const pendingActions = computed(() => gameState.value?.combat?.pendingActions ?? []);
  const pendingReaction = computed(() => {
    const id = activePlayerId.value;
    const r = gameState.value?.combat?.pendingReaction;
    if (!id || !r || r.playerId !== id) return null;
    return r;
  });

  const reversalExtraAllyIds = ref<string[]>([]);

  const hasSpentActionTier = computed(() => {
    if (!enforceActionLimits.value || !budget.value) return false;
    return !budget.value.main || !budget.value.support || !budget.value.aux;
  });

  const hasPendingPlayerActions = computed(() => {
    const id = activePlayerId.value;
    if (!id) return false;
    return pendingActions.value.some((p) => p.actorPlayerId === id);
  });

  const canResetMovement = computed(() => {
    if (!showPlayerActionBar.value || !activePlayer.value) return false;
    if (hasSpentActionTier.value || hasPendingPlayerActions.value) return false;
    const p = activePlayer.value;
    if (p.turnStartX === undefined || p.turnStartY === undefined) return false;
    if (!budget.value) return false;
    return (
      p.x !== p.turnStartX ||
      p.y !== p.turnStartY ||
      budget.value.movementRemaining < budget.value.movementMax
    );
  });

  function commitHaste(tier: ActionTier) {
    sendPlayerAction({ action: "commitHaste", tier });
  }

  function sendPlayerAction(action: import("@gaem/shared").PlayerAction) {
    send({ type: "playerAction", action });
  }

  function resetMovement() {
    send({ type: "resetMovement" });
  }

  function sendMovePath(path: { x: number; y: number }[]) {
    send({ type: "movePath", path });
  }

  function applyAssisted(outcome: import("@gaem/shared").AssistedOutcome) {
    send({ type: "applyAssistedOutcome", outcome });
  }

  function triggerReversal(extraAllyIds: string[] = []) {
    send({ type: "triggerReversal", extraAllyIds: extraAllyIds.length ? extraAllyIds : undefined });
    reversalExtraAllyIds.value = [];
  }

  function declineReversal() {
    send({ type: "declineReversal" });
    reversalExtraAllyIds.value = [];
  }

  function attackPreview(direction: import("@gaem/shared").PatternDirection) {
    const s = gameState.value;
    const id = activePlayerId.value;
    if (!s || !id) return [];
    return previewPlayerAttack(s, id, direction);
  }

  function effectPills(player: Player) {
    if (!player.effects) return [];
    return Object.entries(player.effects).map(([id, stacks]) => `${id}:${stacks}`);
  }

  return {
    isGm,
    gameState,
    activePlayer,
    activePlayerId,
    enforceTurns,
    enforceActionLimits,
    isPlayerTurn,
    showPlayerActionBar,
    showGmCombatUi,
    budget,
    canMain,
    canSupport,
    canAux,
    hasteRemaining,
    hasteGrantedTier,
    actionBudgetChips,
    canStartSprint,
    sprintRemaining,
    hasWeaponAttack,
    canUseWeaponActive,
    sabaothChargesRemaining,
    armorStructured,
    canTowerTeleport,
    canInteractSeed,
    pendingActions,
    pendingReaction,
    reversalExtraAllyIds,
    hasSpentActionTier,
    canResetMovement,
    sendPlayerAction,
    commitHaste,
    resetMovement,
    sendMovePath,
    applyAssisted,
    triggerReversal,
    declineReversal,
    attackPreview,
    effectPills,
  };
}
