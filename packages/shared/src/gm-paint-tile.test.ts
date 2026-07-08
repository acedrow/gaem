import { describe, expect, it } from "vitest";

import { applyGmPaintTile, validateGmPaintTile } from "./combat/messages.js";
import { tileAt } from "./map.js";
import { makeGameState, makeTiles } from "./test/fixtures.js";

const NO_COSMETICS = ["", null, null] as const;

describe("gmPaintTile", () => {
  it("sets elevation, terrain, and tile effects", () => {
    const state = makeGameState();
    expect(validateGmPaintTile(state, 2, 3, 1, "cover", ["Stained:2"], ...NO_COSMETICS)).toBeNull();
    applyGmPaintTile(state, 2, 3, 1, "cover", ["Stained:2"], ...NO_COSMETICS);
    const tile = tileAt(state.tiles, 2, 3)!;
    expect(tile.elevation).toBe(1);
    expect(tile.terrain).toEqual(["cover"]);
    expect(tile.tileEffects).toEqual({ Stained: 2 });
  });

  it("sets cosmetic tile fields", () => {
    const state = makeGameState();
    applyGmPaintTile(
      state,
      1,
      1,
      0,
      "standard",
      [],
      "Forest",
      "#aabbcc",
      "tile-appearances/abc.png",
    );
    const tile = tileAt(state.tiles, 1, 1)!;
    expect(tile.name).toBe("Forest");
    expect(tile.baseColor).toBe("#aabbcc");
    expect(tile.appearanceKey).toBe("tile-appearances/abc.png");
  });

  it("clears cosmetic tile fields", () => {
    const state = makeGameState();
    applyGmPaintTile(state, 0, 0, 0, "standard", [], "Named", "#fff", "key");
    applyGmPaintTile(state, 0, 0, 0, "standard", [], "", null, null);
    const tile = tileAt(state.tiles, 0, 0)!;
    expect(tile.name).toBeUndefined();
    expect(tile.baseColor).toBeUndefined();
    expect(tile.appearanceKey).toBeUndefined();
  });

  it("replaces existing tile effects", () => {
    const state = makeGameState();
    applyGmPaintTile(state, 1, 1, 0, "standard", ["Fortified:1"], ...NO_COSMETICS);
    applyGmPaintTile(state, 1, 1, 0, "standard", ["Stained:1"], ...NO_COSMETICS);
    const tile = tileAt(state.tiles, 1, 1)!;
    expect(tile.tileEffects).toEqual({ Stained: 1 });
  });

  it("clears tile effects with an empty list", () => {
    const state = makeGameState();
    applyGmPaintTile(state, 0, 0, 0, "standard", ["Fortified:1"], ...NO_COSMETICS);
    expect(validateGmPaintTile(state, 0, 0, 0, "standard", [], ...NO_COSMETICS)).toBeNull();
    applyGmPaintTile(state, 0, 0, 0, "standard", [], ...NO_COSMETICS);
    expect(tileAt(state.tiles, 0, 0)!.tileEffects).toBeUndefined();
  });

  it("rejects invalid input", () => {
    const state = makeGameState({ width: 4, height: 4, tiles: makeTiles(4, 4) });
    expect(validateGmPaintTile(state, 9, 0, 0, "standard", [], ...NO_COSMETICS)).toBe("Out of bounds");
    expect(validateGmPaintTile(state, 0, 0, 4, "standard", [], ...NO_COSMETICS)).toBe(
      "Elevation must be an integer from -3 to 3",
    );
    expect(validateGmPaintTile(state, 0, 0, 0, "bogus", [], ...NO_COSMETICS)).toBe(
      "Invalid terrain type: bogus",
    );
    expect(validateGmPaintTile(state, 0, 0, 0, "standard", ["Nope:1"], ...NO_COSMETICS)).toBe(
      "Unknown effect: Nope",
    );
    expect(validateGmPaintTile(state, 0, 0, 0, "standard", [], "", "not-a-color", null)).toBe(
      "baseColor must be a #RGB or #RRGGBB hex color",
    );
  });
});
