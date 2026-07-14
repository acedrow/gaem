import { describe, expect, it } from "vitest";
import { applyPhaseAction, getPlayerMaxHp } from "../game.js";
import { resetUnitCombatState } from "./taccom-reset.js";
import { createDefaultCombatState } from "./types.js";
import type { GameMap } from "../types.js";
import { addTestPlayer, gmCtx, makeGameState } from "../test/fixtures.js";

describe("resetUnitCombatState", () => {
  it("restores HP, clears effects, and resets equipment uses", () => {
    const state = makeGameState();
    const player = addTestPlayer(state, "p1", {
      x: 2,
      y: 2,
      hp: 3,
      class: "HARPE",
      equipmentUses: 0,
      effects: { Bleed: 2, Armor: 1 },
    });
    player.reversalCharges = 0;
    resetUnitCombatState(player);
    expect(player.hp).toBe(getPlayerMaxHp(player));
    expect(player.effects).toBeUndefined();
    expect(player.equipmentUses).toBe(1);
  });
});

describe("TACCOM phase actions", () => {
  it("endDeployment enters TACCOM and resets players", () => {
    const state = makeGameState({
      roundPhase: "deployment",
      combat: createDefaultCombatState(1),
    });
    const player = addTestPlayer(state, "p1", {
      x: 2,
      y: 2,
      hp: 4,
      class: "HARPE",
      effects: { Slow: 1 },
    });
    applyPhaseAction(state, "endDeployment", gmCtx());
    expect(state.roundPhase).toBe("startRoundEffects");
    expect(state.combat).toBeDefined();
    expect(player.hp).toBe(getPlayerMaxHp(player));
    expect(player.effects).toBeUndefined();
  });

  it("endCombat exits to TACCOM not started and resets players", () => {
    const state = makeGameState({
      round: 2,
      roundPhase: "gmTurn",
      combat: createDefaultCombatState(1),
    });
    const player = addTestPlayer(state, "p1", {
      x: 2,
      y: 2,
      hp: 2,
      class: "HARPE",
      effects: { Pin: 1 },
    });
    applyPhaseAction(state, "endCombat", gmCtx());
    expect(state.roundPhase).toBe("taccomNotStarted");
    expect(state.round).toBe(1);
    expect(player.hp).toBe(getPlayerMaxHp(player));
    expect(player.effects).toBeUndefined();
  });

  it("resetCombat exits to TACCOM not started", () => {
    const state = makeGameState({
      round: 2,
      roundPhase: "gmTurn",
      combat: createDefaultCombatState(1),
    });
    addTestPlayer(state, "p1", { x: 2, y: 2, class: "HARPE" });
    applyPhaseAction(state, "resetCombat", gmCtx());
    expect(state.roundPhase).toBe("taccomNotStarted");
    expect(state.round).toBe(1);
    expect(state.combat).toBeDefined();
  });

  it("resetCombat restores board from map startingState when present", () => {
    const state = makeGameState({
      round: 2,
      roundPhase: "gmTurn",
      combat: createDefaultCombatState(1),
      enemies: [{ id: "e1", x: 3, y: 3, name: "Stain Creep", hp: 99, scale: 1 }],
    });
    addTestPlayer(state, "p1", { x: 2, y: 2, class: "HARPE" });
    const map: GameMap = {
      id: "test",
      width: state.width,
      height: state.height,
      tiles: state.tiles.map((t) => ({ ...t, terrain: [...t.terrain] })),
      startingState: {
        tiles: state.tiles.map((t) => ({ ...t, terrain: [...t.terrain] })),
        enemies: [{ id: "e1", x: 1, y: 1, name: "Stain Creep", hp: 1, scale: 1 }],
      },
    };
    const message = applyPhaseAction(state, "resetCombat", gmCtx(), map);
    expect(message).toContain("starting state");
    expect(state.roundPhase).toBe("taccomNotStarted");
    expect(state.enemies).toHaveLength(1);
    expect(state.enemies[0]!.x).toBe(1);
    expect(state.enemies[0]!.hp).toBe(1);
  });
});
