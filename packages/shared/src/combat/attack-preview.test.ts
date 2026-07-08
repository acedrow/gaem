import { describe, expect, it } from "vitest";

import { computeAttackPreviewHighlights } from "./attack-preview.js";
import type { GameState } from "../types.js";
import { createDefaultCombatState } from "./types.js";

function baseState(): GameState {
  return {
    mapId: "test",
    mapName: "Test",
    width: 5,
    height: 5,
    tiles: [],
    players: [
      {
        id: "p1",
        x: 2,
        y: 2,
        weapon: "Ten Thousand Year Reign Shattering Blade",
        hp: 10,
      },
    ],
    enemies: [],
    round: 1,
    roundPhase: "playerTurn",
    turn: { role: "player", playerId: "p1" },
    actedPlayerIds: [],
    turnLog: [],
    combat: createDefaultCombatState(1),
  };
}

describe("computeAttackPreviewHighlights", () => {
  it("shows all directional previews before aim", () => {
    const state = baseState();
    const highlights = computeAttackPreviewHighlights(state, {
      playerId: "p1",
      mode: "attack",
      direction: "n",
      aimed: false,
    });
    expect(highlights.primary).toHaveLength(0);
    expect(highlights.secondary.length).toBeGreaterThan(0);
  });

  it("shows only the selected direction after aim", () => {
    const state = baseState();
    const highlights = computeAttackPreviewHighlights(state, {
      playerId: "p1",
      mode: "attack",
      direction: "n",
      aimed: true,
    });
    expect(highlights.primary.length).toBeGreaterThan(0);
  });
});
