import { describe, expect, it } from "vitest";
import {
  getHeavenBurningLevel,
  HEAVEN_BURNING_MAX_LEVEL,
  HEAVEN_BURNING_SWORD_NAME,
  initHeavenBurningLevel,
  resolveCombatAttackSpec,
} from "./attack.js";
import { applyPlayerAction, validatePlayerAction } from "./messages.js";
import { resetUnitCombatState } from "./taccom-reset.js";
import { createDefaultCombatState } from "./types.js";
import { addTestEnemy, addTestPlayer, makeGameState } from "../test/fixtures.js";

function heavenBurningSetup() {
  const state = makeGameState({ width: 12, height: 12 });
  const player = addTestPlayer(state, "p1", {
    x: 5,
    y: 5,
    weapon: HEAVEN_BURNING_SWORD_NAME,
    actionBudget: true,
  });
  state.roundPhase = "playerTurn";
  state.turn = { role: "player", playerId: "p1" };
  state.combat = createDefaultCombatState(1);
  initHeavenBurningLevel(player);
  return { state, player };
}

describe("Heaven Burning Sword", () => {
  it("starts at level 1 after taccom reset", () => {
    const { player } = heavenBurningSetup();
    resetUnitCombatState(player);
    expect(getHeavenBurningLevel(player)).toBe(1);
  });

  it("uses level damage and pattern from sword level", () => {
    const { player } = heavenBurningSetup();
    player.counters!.heavenBurningLevel = 2;
    const spec = resolveCombatAttackSpec(player, HEAVEN_BURNING_SWORD_NAME);
    expect(spec?.damage).toBe("15");
    expect(spec?.tiles?.length).toBe(8);
  });

  it("Unfolding charges the sword as an aux action up to level 3", () => {
    const { state, player } = heavenBurningSetup();

    expect(validatePlayerAction(state, "p1", { action: "heavenBurningUnfold" })).toBeNull();
    applyPlayerAction(state, "p1", { action: "heavenBurningUnfold" });
    expect(getHeavenBurningLevel(player)).toBe(2);
    expect(player.actionBudget?.aux).toBe(false);

    applyPlayerAction(state, "p1", { action: "heavenBurningUnfold" });
    expect(getHeavenBurningLevel(player)).toBe(HEAVEN_BURNING_MAX_LEVEL);

    player.actionBudget!.aux = true;
    expect(validatePlayerAction(state, "p1", { action: "heavenBurningUnfold" })).toBe(
      "Sword already at max level",
    );
  });

  it("resets to level 1 after attacking", () => {
    const { state, player } = heavenBurningSetup();
    addTestEnemy(state, "e1", 8, 5, { name: "Gorgenaut", hp: 30 });
    player.counters!.heavenBurningLevel = 3;

    applyPlayerAction(state, "p1", {
      action: "attack",
      direction: "e",
      weaponName: HEAVEN_BURNING_SWORD_NAME,
    });

    expect(getHeavenBurningLevel(player)).toBe(1);
  });
});
