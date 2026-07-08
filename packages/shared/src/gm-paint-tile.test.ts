import { describe, expect, it } from "vitest";

import { applyGmPaintTile, handleCombatMessage, validateGmPaintTile } from "./combat/messages.js";
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

  it("paints every coordinate in a batched gmPaintTile message", () => {
    const state = makeGameState({ width: 4, height: 4, tiles: makeTiles(4, 4) });
    const result = handleCombatMessage(
      state,
      {
        type: "gmPaintTile",
        coords: [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }],
        elevation: 2,
        terrain: "cover",
        tileEffects: ["Stained:1"],
        tileName: "",
        baseColor: null,
        appearanceKey: null,
      },
      { role: "gm", playerId: null },
    );
    expect(result).toEqual({ handled: true, message: "Painted 3 tiles" });
    for (const { x, y } of [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }]) {
      const tile = tileAt(state.tiles, x, y)!;
      expect(tile.elevation).toBe(2);
      expect(tile.terrain).toEqual(["cover"]);
      expect(tile.tileEffects).toEqual({ Stained: 1 });
    }
  });

  it("applies none of a batch if any coordinate fails validation", () => {
    const state = makeGameState({ width: 4, height: 4, tiles: makeTiles(4, 4) });
    const result = handleCombatMessage(
      state,
      {
        type: "gmPaintTile",
        coords: [{ x: 0, y: 0 }, { x: 9, y: 9 }],
        elevation: 1,
        terrain: "cover",
        tileEffects: [],
        tileName: "",
        baseColor: null,
        appearanceKey: null,
      },
      { role: "gm", playerId: null },
    );
    expect(result).toEqual({ handled: true, error: "Out of bounds" });
    expect(tileAt(state.tiles, 0, 0)!.terrain).toEqual(["standard"]);
  });

  it("rejects an empty coords list", () => {
    const state = makeGameState({ width: 4, height: 4, tiles: makeTiles(4, 4) });
    const result = handleCombatMessage(
      state,
      {
        type: "gmPaintTile",
        coords: [],
        elevation: 0,
        terrain: "standard",
        tileEffects: [],
        tileName: "",
        baseColor: null,
        appearanceKey: null,
      },
      { role: "gm", playerId: null },
    );
    expect(result).toEqual({ handled: true, error: "No tiles selected" });
  });
});
