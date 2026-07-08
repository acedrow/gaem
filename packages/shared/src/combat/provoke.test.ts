import { describe, expect, it } from "vitest";
import {
  collectPathProvokeTriggers,
  JEHOEL_ARMOR_NAME,
  KOPIS_CLASS_NAME,
  MURIEL_ARMOR_NAME,
  previewEnemyMoveProvokes,
  previewSprintProvokes,
  resolveProvokeTriggers,
} from "./provoke.js";
import { applyMovePath, applyPlayerAction } from "./messages.js";
import { SETHIAN_WEAPON_NAME } from "./attack.js";
import { applyPullToward } from "./pull.js";
import { addEnemy } from "../game.js";
import { createDefaultCombatState } from "./types.js";
import { addTestEnemy, addTestPlayer, makeGameState } from "../test/fixtures.js";

const SWARM_NAME = "Scorned Eyes";

function combatPlayerTurn(state: ReturnType<typeof makeGameState>, playerId: string) {
  state.roundPhase = "playerTurn";
  state.turn = { role: "player", playerId };
  state.combat = createDefaultCombatState(state.players.length);
}

function addSwarmL(state: ReturnType<typeof makeGameState>, ids: [string, string, string]) {
  addTestEnemy(state, ids[0], 3, 2, { name: SWARM_NAME });
  addTestEnemy(state, ids[1], 2, 3, { name: SWARM_NAME });
  addTestEnemy(state, ids[2], 3, 3, { name: SWARM_NAME });
}

describe("provoke", () => {
  it("does not trigger when player steps away from adjacent player", () => {
    const state = makeGameState();
    addTestPlayer(state, "p1", { x: 2, y: 2, actionBudget: true });
    addTestPlayer(state, "p2", { x: 3, y: 2 });
    combatPlayerTurn(state, "p1");

    const triggers = previewSprintProvokes(state, "p1", 2, 1);
    expect(triggers).toHaveLength(0);
  });

  it("triggers when player steps away from adjacent enemy", () => {
    const state = makeGameState();
    addTestPlayer(state, "p1", { x: 2, y: 2, actionBudget: true });
    addTestEnemy(state, "e1", 3, 2, { name: "Gorgenaut" });
    combatPlayerTurn(state, "p1");

    const triggers = previewSprintProvokes(state, "p1", 2, 1);
    expect(triggers).toHaveLength(1);
    expect(triggers[0]!.sourceKind).toBe("enemy");
  });

  it("triggers once when player leaves last swarm adjacency", () => {
    const state = makeGameState();
    addTestPlayer(state, "p1", { x: 2, y: 2, actionBudget: true });
    addSwarmL(state, ["a", "b", "c"]);
    combatPlayerTurn(state, "p1");

    const triggers = previewSprintProvokes(state, "p1", 1, 2);
    expect(triggers).toHaveLength(1);
    expect(triggers[0]!.sourceKind).toBe("enemy");
    expect(triggers[0]!.dice).toBe(1);
  });

  it("does not provoke when player still adjacent to swarm after move", () => {
    const state = makeGameState();
    addTestPlayer(state, "p1", { x: 2, y: 2, actionBudget: true });
    addTestEnemy(state, "a", 3, 2, { name: SWARM_NAME });
    addTestEnemy(state, "b", 3, 3, { name: SWARM_NAME });
    addTestEnemy(state, "c", 4, 3, { name: SWARM_NAME });
    combatPlayerTurn(state, "p1");

    const triggers = previewSprintProvokes(state, "p1", 2, 3);
    expect(triggers).toHaveLength(0);
  });

  it("swarm move does not provoke while still adjacent", () => {
    const state = makeGameState({ roundPhase: "gmTurn", turn: { role: "gm" } });
    addTestPlayer(state, "p1", { x: 0, y: 2 });
    addEnemy(state, { id: "a", x: 1, y: 2, name: SWARM_NAME, hp: 10 });
    addEnemy(state, { id: "b", x: 2, y: 2, name: SWARM_NAME, hp: 10 });
    addEnemy(state, { id: "c", x: 3, y: 2, name: SWARM_NAME, hp: 10 });

    const triggers = previewEnemyMoveProvokes(state, "a", 1, 3);
    expect(triggers).toHaveLength(0);
  });

  it("swarm move provokes when last adjacent square leaves player", () => {
    const state = makeGameState({ roundPhase: "gmTurn", turn: { role: "gm" } });
    addTestPlayer(state, "p1", { x: 0, y: 2 });
    addEnemy(state, { id: "a", x: 1, y: 2, name: SWARM_NAME, hp: 10 });
    addEnemy(state, { id: "b", x: 2, y: 2, name: SWARM_NAME, hp: 10 });

    const triggers = previewEnemyMoveProvokes(state, "a", 2, 3);
    expect(triggers).toHaveLength(1);
    expect(triggers[0]!.sourceKind).toBe("player");
  });

  it("MURIEL skips provoke from enemies moved through on path", () => {
    const state = makeGameState();
    addTestPlayer(state, "p1", {
      x: 2,
      y: 2,
      armor: MURIEL_ARMOR_NAME,
      actionBudget: true,
    });
    addTestEnemy(state, "e1", 3, 2, { name: "Gorgenaut" });
    combatPlayerTurn(state, "p1");
    state.combat = createDefaultCombatState(1);
    state.combat.passedEnemyIdsByPlayer = { p1: ["e1"] };

    const triggers = collectPathProvokeTriggers(state, "p1", [{ x: 2, y: 1 }]);
    expect(triggers).toHaveLength(0);
  });

  it("JEHOEL skips provoke on steps into or out of special terrain", () => {
    const state = makeGameState();
    state.tiles.find((t) => t.x === 2 && t.y === 1)!.terrain = ["uneasy"];
    addTestPlayer(state, "p1", { x: 2, y: 2, armor: JEHOEL_ARMOR_NAME, actionBudget: true });
    addTestEnemy(state, "e1", 3, 2, { name: "Gorgenaut" });
    combatPlayerTurn(state, "p1");

    const triggers = previewSprintProvokes(state, "p1", 2, 1);
    expect(triggers).toHaveLength(0);
  });

  it("forced movement opts skip provoke", () => {
    const state = makeGameState();
    addTestPlayer(state, "p1", { x: 2, y: 2, actionBudget: true });
    addTestEnemy(state, "e1", 3, 2, { name: "Gorgenaut" });
    combatPlayerTurn(state, "p1");

    const triggers = previewSprintProvokes(state, "p1", 2, 1, { forced: true });
    expect(triggers).toHaveLength(0);
  });

  it("pull does not provoke when leaving swarm adjacency", () => {
    const state = makeGameState();
    const player = addTestPlayer(state, "p1", { x: 2, y: 2, hp: 20, actionBudget: true });
    addSwarmL(state, ["a", "b", "c"]);
    combatPlayerTurn(state, "p1");

    expect(previewSprintProvokes(state, "p1", 0, 2)).toHaveLength(1);
    applyPullToward(state, player, 0, 2, 2);
    expect(player.x).toBe(0);
    expect(player.y).toBe(2);
    expect(player.hp).toBe(20);
  });

  it("push does not provoke when leaving swarm adjacency", () => {
    const state = makeGameState();
    const shover = addTestPlayer(state, "p1", { x: 1, y: 2, actionBudget: true });
    const target = addTestPlayer(state, "p2", { x: 2, y: 2, hp: 20, actionBudget: true });
    addTestEnemy(state, "a", 1, 3, { name: SWARM_NAME });
    addTestEnemy(state, "b", 2, 3, { name: SWARM_NAME });
    combatPlayerTurn(state, "p1");

    expect(previewSprintProvokes(state, "p2", 3, 2)).toHaveLength(1);
    const msg = applyPlayerAction(state, "p1", { action: "shove", targetPlayerId: "p2" });
    expect(msg).not.toContain("Provoke");
    expect(target.x).toBe(3);
    expect(target.y).toBe(2);
    expect(target.hp).toBe(20);
    expect(shover.x).toBe(1);
  });

  it("canticle boosted warhook does not provoke when leaving swarm adjacency", () => {
    const state = makeGameState();
    const player = addTestPlayer(state, "p1", {
      x: 2,
      y: 2,
      hp: 20,
      weapon: SETHIAN_WEAPON_NAME,
      actionBudget: true,
    });
    addSwarmL(state, ["a", "b", "c"]);
    addTestEnemy(state, "target", 6, 2, { name: "Gorgenaut", hp: 20 });
    combatPlayerTurn(state, "p1");

    expect(previewSprintProvokes(state, "p1", 5, 2)).toHaveLength(1);
    const msg = applyPlayerAction(state, "p1", {
      action: "weaponActive",
      warhook: {
        targetEnemyId: "target",
        targetX: 6,
        targetY: 2,
        landingX: 5,
        landingY: 2,
        damageRoll: 1,
      },
    });
    expect(msg).not.toContain("Provoke");
    expect(player.x).toBe(5);
    expect(player.y).toBe(2);
    expect(player.hp).toBe(20);
  });

  it("scale:2 enemy adjacency uses footprint", () => {
    const state = makeGameState();
    addTestPlayer(state, "p1", { x: 1, y: 2, actionBudget: true });
    addTestEnemy(state, "e1", 2, 2, { name: "Gorgenaut", scale: 2 });
    combatPlayerTurn(state, "p1");

    const triggers = previewSprintProvokes(state, "p1", 1, 1);
    expect(triggers).toHaveLength(1);
  });

  it("resolveProvokeTriggers applies KOPIS retaliation", () => {
    const state = makeGameState();
    const player = addTestPlayer(state, "p1", {
      x: 2,
      y: 2,
      class: KOPIS_CLASS_NAME,
      actionBudget: true,
    });
    const enemy = addTestEnemy(state, "e1", 3, 2, { name: "Gorgenaut", hp: 20 });
    combatPlayerTurn(state, "p1");

    const triggers = previewSprintProvokes(state, "p1", 2, 1);
    if (!player.counters) player.counters = {};
    player.counters.movedThisTurn = 1;
    const rng = () => 0.99;
    const result = resolveProvokeTriggers(state, { kind: "player", player }, triggers, rng);
    expect(result.totalDamage).toBe(6);
    expect((player.hp ?? 0)).toBeLessThan(10);
    expect(result.kopisDetail).toContain("Offhand Pistol");
    expect((enemy.hp ?? 0)).toBeLessThan(20);
  });

  it("applyMovePath provokes in player turn and sandbox", () => {
    for (const sandbox of [false, true]) {
      const state = makeGameState({ sandboxMode: sandbox, roundPhase: sandbox ? "gmTurn" : "playerTurn" });
      const player = addTestPlayer(state, "p1", { x: 2, y: 2, hp: 20, actionBudget: true });
      addTestEnemy(state, "e1", 3, 2, { name: "Gorgenaut", hp: 10 });
      if (!sandbox) {
        state.turn = { role: "player", playerId: "p1" };
      } else {
        state.turn = { role: "gm" };
      }
      state.combat = createDefaultCombatState(1);

      const msg = applyMovePath(state, "p1", [{ x: 2, y: 1 }]);
      expect(msg).toContain("Provoke");
      expect(player.hp).toBeLessThan(20);
    }
  });
});
