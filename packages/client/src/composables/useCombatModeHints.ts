import type { Player } from "@gaem/shared";
import {
  isRangeTargetAttack,
  isRangedPatternAttack,
  rangeTargetMax,
  resolveCombatAttackSpec,
  usesAnchoredPatternPlacement,
} from "@gaem/shared";
import { computed, type Ref } from "vue";

import { useBoardActionMode } from "./useBoardActionMode.js";

const DEFAULT_ATTACK_HINT =
  "Click a highlighted tile to aim, then click the attack area to confirm";

export function useCombatModeHints(opts: {
  player: Ref<Player | null | undefined>;
  weaponName: Ref<string | undefined | null>;
}) {
  const {
    mode,
    rangeAttackTargetIds,
    omnistrikeStep,
    warhookStep,
    towerTeleportStep,
    kataptyTargetIds,
    borrowAllyId,
    assistedLaunchStep,
  } = useBoardActionMode();

  const attackHint = computed(() => {
    if (mode.value !== "attack" || !opts.player.value || !opts.weaponName.value) {
      return DEFAULT_ATTACK_HINT;
    }
    const spec = resolveCombatAttackSpec(opts.player.value, opts.weaponName.value);
    if (!spec) return DEFAULT_ATTACK_HINT;
    if (isRangeTargetAttack(spec)) {
      const max = rangeTargetMax(spec);
      const count = rangeAttackTargetIds.value.length;
      if (max <= 1) return "Click an enemy in range to attack";
      return `Select up to ${max} enemies (${count}/${max}). Click an enemy to toggle, empty tile to confirm.`;
    }
    if (usesAnchoredPatternPlacement(spec)) {
      return "Hover to preview, click to place the pattern, then click the pattern to attack";
    }
    if (isRangedPatternAttack(spec)) {
      return "Click a tile in range to aim, then click a highlighted tile to attack";
    }
    return DEFAULT_ATTACK_HINT;
  });

  const rangeAttackHint = computed(() => {
    if (mode.value !== "attack" || !opts.player.value || !opts.weaponName.value) return null;
    const spec = resolveCombatAttackSpec(opts.player.value, opts.weaponName.value);
    if (!spec || !isRangeTargetAttack(spec)) return null;
    const max = rangeTargetMax(spec);
    const count = rangeAttackTargetIds.value.length;
    if (max <= 1) return "Click an enemy in range to attack";
    return `Select up to ${max} enemies (${count}/${max}). Click an enemy to toggle, empty tile to confirm.`;
  });

  const rangedPatternAttackHint = computed(() => {
    if (mode.value !== "attack" || !opts.player.value || !opts.weaponName.value) return null;
    const spec = resolveCombatAttackSpec(opts.player.value, opts.weaponName.value);
    if (!spec || isRangeTargetAttack(spec)) return null;
    if (usesAnchoredPatternPlacement(spec)) {
      return "Hover to preview, click to place the pattern, then click the pattern to attack";
    }
    if (isRangedPatternAttack(spec)) {
      return "Click a tile in range to aim, then click a highlighted tile to attack";
    }
    return null;
  });

  const omnistrikeHint = computed(() => {
    if (mode.value !== "omnistrike") return null;
    switch (omnistrikeStep.value) {
      case "selectBombs":
        return "Select two bomb types to combine (tap to toggle).";
      case "placeFirst":
        return "Place the first pattern — hover to preview, click to confirm placement.";
      case "placeSecond":
        return "Place the second pattern adjacent to or overlapping the first.";
      case "confirm":
        return "Click the combined pattern to launch Omnistrike.";
      default:
        return null;
    }
  });

  const warhookHint = computed(() => {
    if (mode.value !== "warhook") return null;
    if (warhookStep.value === "selectLanding") return "Choose destination tile";
    return "Click an enemy, obstacle, or wall within range";
  });

  const armorHint = computed(() => {
    if (mode.value === "armorPlaceTower") return "Click a tile within Range:2 to place your tower";
    return null;
  });

  const towerTeleportHint = computed(() => {
    if (mode.value !== "towerTeleport") return null;
    if (towerTeleportStep.value === "selectKeraunoTarget") return "Select adjacent enemy for Kerauno";
    return "Spend all remaining Speed — click a tile adjacent to your tower";
  });

  const kataptyHint = computed(() => {
    if (mode.value !== "kataptyPick") return null;
    return `Select exactly 3 Katapty targets (${kataptyTargetIds.value.length}/3), then confirm`;
  });

  const varunastraBorrowHint = computed(() => {
    if (mode.value !== "varunastraBorrow") return null;
    if (!borrowAllyId.value) return "Click a squad ally to borrow their weapon pattern";
    return "Aim the borrowed pattern, then click highlighted tiles to attack";
  });

  const assistedLaunchHint = computed(() => {
    if (mode.value !== "assistedLaunch") return null;
    if (assistedLaunchStep.value === "selectAnchor") return "Select a wall or ally to launch from";
    return "Click the highlighted landing tile to launch";
  });

  const boardHintRows = computed(() => {
    const rows: { key: string; text: string }[] = [];
    if (mode.value === "attack") rows.push({ key: "attack", text: attackHint.value });
    if (omnistrikeHint.value) rows.push({ key: "omnistrike", text: omnistrikeHint.value });
    if (warhookHint.value) rows.push({ key: "warhook", text: warhookHint.value });
    if (armorHint.value) rows.push({ key: "armor", text: armorHint.value });
    if (towerTeleportHint.value) rows.push({ key: "towerTeleport", text: towerTeleportHint.value });
    if (kataptyHint.value) rows.push({ key: "katapty", text: kataptyHint.value });
    if (varunastraBorrowHint.value) rows.push({ key: "varunastraBorrow", text: varunastraBorrowHint.value });
    if (assistedLaunchHint.value) rows.push({ key: "assistedLaunch", text: assistedLaunchHint.value });
    return rows;
  });

  return {
    attackHint,
    rangeAttackHint,
    rangedPatternAttackHint,
    omnistrikeHint,
    warhookHint,
    armorHint,
    towerTeleportHint,
    kataptyHint,
    varunastraBorrowHint,
    assistedLaunchHint,
    boardHintRows,
  };
}
