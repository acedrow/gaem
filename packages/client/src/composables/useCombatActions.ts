import type { Player } from "@gaem/shared";
import {
  canSpendActionTier,
  createDefaultActionBudget,
  getArmorByName,
  getArmorSpeed,
  getWeaponAttackSpec,
  hasSabaothBombSelected,
  isSabaothWeaponName,
  previewPlayerAttack,
} from "@gaem/shared";
import { computed } from "vue";

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

  const canMain = computed(
    () =>
      !enforceActionLimits.value ||
      !!(budget.value && canSpendActionTier(budget.value, "main")),
  );
  const canSupport = computed(
    () =>
      !enforceActionLimits.value ||
      !!(budget.value && canSpendActionTier(budget.value, "support")),
  );
  const canAux = computed(
    () =>
      !enforceActionLimits.value ||
      !!(budget.value && canSpendActionTier(budget.value, "aux")),
  );

  const sprintRemaining = computed(() => budget.value?.sprintRemaining ?? 0);

  const canStartSprint = computed(
    () => canAux.value && sprintRemaining.value <= 0,
  );

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

  const pendingActions = computed(() => gameState.value?.combat?.pendingActions ?? []);
  const pendingReaction = computed(() => {
    const id = activePlayerId.value;
    const r = gameState.value?.combat?.pendingReaction;
    if (!id || !r || r.playerId !== id) return null;
    return r;
  });

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

  function triggerReversal() {
    send({ type: "triggerReversal" });
  }

  function declineReversal() {
    send({ type: "declineReversal" });
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
    canStartSprint,
    sprintRemaining,
    hasWeaponAttack,
    armorStructured,
    pendingActions,
    pendingReaction,
    hasSpentActionTier,
    canResetMovement,
    sendPlayerAction,
    resetMovement,
    sendMovePath,
    applyAssisted,
    triggerReversal,
    declineReversal,
    attackPreview,
    effectPills,
  };
}
