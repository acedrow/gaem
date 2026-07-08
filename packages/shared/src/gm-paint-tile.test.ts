import { describe, expect, it } from "vitest";

import { applyGmPaintTile, validateGmPaintTile } from "./combat/messages.js";
import { tileAt } from "./map.js";
import { makeGameState, makeTiles } from "./test/fixtures.js";

describe("gmPaintTile", () => {
  it("sets elevation, terrain, and tile effects", () => {
    const state = makeGameState();
    expect(validateGmPaintTile(state, 2, 3, 1, "cover", ["Stained:2"])).toBeNull();
    applyGmPaintTile(state, 2, 3, 1, "cover", ["Stained:2"]);
    const tile = tileAt(state.tiles, 2, 3)!;
    expect(tile.elevation).toBe(1);
    expect(tile.terrain).toEqual(["cover"]);
    expect(tile.tileEffects).toEqual({ Stained: 2 });
  });

  it("replaces existing tile effects", () => {
    const state = makeGameState();
    applyGmPaintTile(state, 1, 1, 0, "standard", ["Fortified:1"]);
    applyGmPaintTile(state, 1, 1, 0, "standard", ["Stained:1"]);
    const tile = tileAt(state.tiles, 1, 1)!;
    expect(tile.tileEffects).toEqual({ Stained: 1 });
  });

  it("clears tile effects with an empty list", () => {
    const state = makeGameState();
    applyGmPaintTile(state, 0, 0, 0, "standard", ["Fortified:1"]);
    expect(validateGmPaintTile(state, 0, 0, 0, "standard", [])).toBeNull();
    applyGmPaintTile(state, 0, 0, 0, "standard", []);
    expect(tileAt(state.tiles, 0, 0)!.tileEffects).toBeUndefined();
  });

  it("rejects invalid input", () => {
    const state = makeGameState({ width: 4, height: 4, tiles: makeTiles(4, 4) });
    expect(validateGmPaintTile(state, 9, 0, 0, "standard", [])).toBe("Out of bounds");
    expect(validateGmPaintTile(state, 0, 0, 4, "standard", [])).toBe(
      "Elevation must be an integer from -3 to 3",
    );
    expect(validateGmPaintTile(state, 0, 0, 0, "bogus", [])).toBe("Invalid terrain type: bogus");
    expect(validateGmPaintTile(state, 0, 0, 0, "standard", ["Nope:1"])).toBe("Unknown effect: Nope");
  });
});
