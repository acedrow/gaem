import { describe, expect, it } from "vitest";
import { getEnemyMaxHp } from "../game.js";
import { addTestPlayer, makeGameState } from "../test/fixtures.js";
import { applyPlaceTower, getPlayerTower, TOWER_KATAPTY } from "./yadathan.js";

describe("Yadathan towers", () => {
  it("initializes tower HP from armor data, not enemy listings", () => {
    const state = makeGameState();
    const player = addTestPlayer(state, "p1", { x: 2, y: 2, armor: "YADATHAN" });
    player.yadathanTower = TOWER_KATAPTY;

    const result = applyPlaceTower(state, player, 4, 2);
    expect("error" in result).toBe(false);

    const tower = getPlayerTower(state, player.id);
    expect(tower).toBeDefined();
    expect(tower!.hp).toBe(5);
    expect(getEnemyMaxHp(tower!)).toBe(5);
  });
});
