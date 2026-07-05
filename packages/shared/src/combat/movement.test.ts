import { describe, expect, it } from "vitest";
import {
  applyMovementPath,
  applyResetMovement,
  validateMovementPath,
  validateResetMovement,
} from "./movement.js";
import { addTestPlayer, makeGameState, makeTiles } from "../test/fixtures.js";
import { coordKey } from "../map.js";

describe("movement", () => {
  it("validateMovementPath rejects invalid paths", () => {
    const state = makeGameState({
      roundPhase: "playerTurn",
      turn: { role: "player", playerId: "p1" },
    });
    addTestPlayer(state, "p1", { x: 2, y: 2, speed: 5 });

    expect(validateMovementPath(state, "p1", [])).toBe("Empty path");
    expect(validateMovementPath(state, "p1", [{ x: 4, y: 2 }])).toBe(
      "Path must be adjacent steps",
    );

    const blocked = makeGameState({
      roundPhase: "playerTurn",
      turn: { role: "player", playerId: "p1" },
      tiles: makeTiles(8, 8, new Set([coordKey(3, 2)])),
    });
    addTestPlayer(blocked, "p1", { x: 2, y: 2, speed: 5 });
    expect(validateMovementPath(blocked, "p1", [{ x: 3, y: 2 }])).toBe("Blocked");

    const occupied = makeGameState({
      roundPhase: "playerTurn",
      turn: { role: "player", playerId: "p1" },
    });
    addTestPlayer(occupied, "p1", { x: 2, y: 2, speed: 5 });
    addTestPlayer(occupied, "p2", { x: 3, y: 2, speed: 5, actionBudget: false });
    expect(validateMovementPath(occupied, "p1", [{ x: 3, y: 2 }])).toBe("Tile occupied");
  });

  it("rejects movement when pinned", () => {
    const state = makeGameState({
      roundPhase: "playerTurn",
      turn: { role: "player", playerId: "p1" },
    });
    addTestPlayer(state, "p1", { x: 2, y: 2, speed: 5, effects: { Pin: 1 } });
    expect(validateMovementPath(state, "p1", [{ x: 3, y: 2 }])).toBe("Pinned — cannot move");
  });

  it("applyMovementPath updates position and spends budget", () => {
    const state = makeGameState({
      roundPhase: "playerTurn",
      turn: { role: "player", playerId: "p1" },
    });
    const player = addTestPlayer(state, "p1", { x: 2, y: 2, speed: 5 });
    const err = applyMovementPath(state, "p1", [{ x: 3, y: 2 }, { x: 4, y: 2 }]);
    expect(err).toBeNull();
    expect(player.x).toBe(4);
    expect(player.y).toBe(2);
    expect(player.actionBudget!.movementRemaining).toBe(3);
  });

  it("validateResetMovement and applyResetMovement", () => {
    const state = makeGameState({
      roundPhase: "playerTurn",
      turn: { role: "player", playerId: "p1" },
    });
    const player = addTestPlayer(state, "p1", { x: 2, y: 2, speed: 5 });
    applyMovementPath(state, "p1", [{ x: 3, y: 2 }]);

    expect(validateResetMovement(state, "p1")).toBeNull();
    applyResetMovement(state, "p1");
    expect(player.x).toBe(2);
    expect(player.y).toBe(2);
    expect(player.actionBudget!.movementRemaining).toBe(5);

    const deployment = makeGameState();
    addTestPlayer(deployment, "p1", { x: 2, y: 2 });
    expect(validateResetMovement(deployment, "p1")).toBe("Wrong phase");
  });
});
