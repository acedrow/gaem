import { describe, expect, it } from "vitest";
import {
  baseUnitElevation,
  effectiveElevation,
  initializeUnitElevation,
  isFlyingUnit,
  syncUnitElevationOnTile,
  tickFallingStartOfTurn,
} from "./elevation.js";
import { hasLineOfSight } from "./los.js";
import { terrainStepCost } from "./movement.js";
import { resolveDamageAgainstTarget } from "./damage.js";
import { addTestPlayer, makeGameState } from "../test/fixtures.js";
import { tileAt } from "../map.js";

describe("elevation helpers", () => {
  it("uses tile elevation when unit elevation unset", () => {
    const state = makeGameState();
    tileAt(state.tiles, 2, 2)!.elevation = 2;
    const player = addTestPlayer(state, "p1", { x: 2, y: 2 });
    expect(baseUnitElevation(state, player)).toBe(2);
    expect(effectiveElevation(state, player)).toBe(2);
  });

  it("Aegis grants +1 effective elevation", () => {
    const state = makeGameState();
    const player = addTestPlayer(state, "p1", { x: 2, y: 2, effects: { Aegis: 1 } });
    player.elevation = 1;
    expect(isFlyingUnit(player)).toBe(true);
    expect(effectiveElevation(state, player)).toBe(2);
  });

  it("sync snaps to higher tile and to lower tile when not Flying", () => {
    const state = makeGameState();
    tileAt(state.tiles, 3, 2)!.elevation = 2;
    const player = addTestPlayer(state, "p1", { x: 2, y: 2 });
    player.elevation = 0;
    syncUnitElevationOnTile(state, player, 3, 2);
    expect(player.elevation).toBe(2);
    tileAt(state.tiles, 4, 2)!.elevation = 0;
    syncUnitElevationOnTile(state, player, 4, 2);
    expect(player.elevation).toBe(0);
  });

  it("charges flat +1 for uphill step", () => {
    const state = makeGameState();
    tileAt(state.tiles, 2, 2)!.elevation = 0;
    tileAt(state.tiles, 3, 2)!.elevation = 2;
    expect(terrainStepCost(state, 2, 2, 3, 2)).toBe(2);
  });

  it("Seeking ignores uphill cost", () => {
    const state = makeGameState();
    tileAt(state.tiles, 3, 2)!.elevation = 2;
    expect(terrainStepCost(state, 2, 2, 3, 2, { seeking: true })).toBe(1);
  });
});

describe("Falling", () => {
  it("begins Falling above elev 1 and deals peak damage on landing", () => {
    const state = makeGameState();
    tileAt(state.tiles, 2, 2)!.elevation = 0;
    const player = addTestPlayer(state, "p1", { x: 2, y: 2, hp: 20, class: "HARPE" });
    player.elevation = 3;
    const first = tickFallingStartOfTurn(state, player, "player");
    expect(first.some((m) => m.includes("began Falling"))).toBe(true);
    expect(player.falling?.peak).toBe(3);
    expect(player.elevation).toBe(2);

    tickFallingStartOfTurn(state, player, "player");
    expect(player.elevation).toBe(1);

    const land = tickFallingStartOfTurn(state, player, "player");
    expect(land.some((m) => m.includes("landed"))).toBe(true);
    expect(player.falling).toBeUndefined();
    expect(player.elevation).toBe(0);
    expect(player.hp).toBe(17);
  });
});

describe("Piercing and Seeking LOS", () => {
  it("Piercing may ignore one obstacle tile", () => {
    const state = makeGameState();
    setObstacle(state, 3, 2);
    expect(hasLineOfSight(state, 2, 2, 5, 2)).toBe(false);
    expect(hasLineOfSight(state, 2, 2, 5, 2, { piercing: 1 })).toBe(true);
  });

  it("Seeking ignores elevation ridge blockers", () => {
    const state = makeGameState();
    tileAt(state.tiles, 2, 2)!.elevation = 0;
    tileAt(state.tiles, 3, 2)!.elevation = 2;
    tileAt(state.tiles, 4, 2)!.elevation = 0;
    expect(hasLineOfSight(state, 2, 2, 4, 2)).toBe(false);
    expect(hasLineOfSight(state, 2, 2, 4, 2, { seeking: true })).toBe(true);
  });

  it("Piercing skips Cover reduction", () => {
    const state = makeGameState();
    tileAt(state.tiles, 3, 2)!.terrain = ["cover"];
    expect(resolveDamageAgainstTarget(5, { x: 3, y: 2 }, { state })).toBe(4);
    expect(resolveDamageAgainstTarget(5, { x: 3, y: 2 }, { state, piercing: true })).toBe(5);
  });
});

describe("initializeUnitElevation", () => {
  it("sets elev from tile on add", () => {
    const state = makeGameState();
    tileAt(state.tiles, 2, 2)!.elevation = 1;
    const player = addTestPlayer(state, "p1", { x: 2, y: 2 });
    initializeUnitElevation(state, player);
    expect(player.elevation).toBe(1);
  });
});

function setObstacle(state: ReturnType<typeof makeGameState>, x: number, y: number) {
  tileAt(state.tiles, x, y)!.terrain = ["obstacle"];
}
