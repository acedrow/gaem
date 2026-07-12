import { describe, expect, it } from "vitest";

import { applyGmPaintTile, handleCombatMessage, validateGmPaintTile } from "./combat/messages.js";
import { tileAt } from "./map.js";
import { makeGameState, makeTiles } from "./test/fixtures.js";

describe("gmPaintTile", () => {
  it("sets elevation, terrain, and tile effects", () => {
    const state = makeGameState();
    const fields = {
      elevation: 1,
      terrain: "cover" as const,
      tileEffects: ["Stained:2"],
      tileName: "",
      baseColor: null,
      appearanceKey: null,
    };
    expect(validateGmPaintTile(state, 2, 3, fields)).toBeNull();
    applyGmPaintTile(state, 2, 3, fields);
    const tile = tileAt(state.tiles, 2, 3)!;
    expect(tile.elevation).toBe(1);
    expect(tile.terrain).toEqual(["cover"]);
    expect(tile.tileEffects).toEqual({ Stained: 2 });
  });

  it("sets cosmetic tile fields", () => {
    const state = makeGameState();
    applyGmPaintTile(state, 1, 1, {
      elevation: 0,
      terrain: "standard",
      tileEffects: [],
      tileName: "Forest",
      baseColor: "#aabbcc",
      appearanceKey: "tile-appearances/abc.png",
      featureKey: "tiles/features/rock.png",
      imageRotation: 90,
      imageFlip: true,
    });
    const tile = tileAt(state.tiles, 1, 1)!;
    expect(tile.name).toBe("Forest");
    expect(tile.baseColor).toBe("#aabbcc");
    expect(tile.appearanceKey).toBe("tile-appearances/abc.png");
    expect(tile.featureKey).toBe("tiles/features/rock.png");
    expect(tile.imageRotation).toBe(90);
    expect(tile.imageFlip).toBe(true);
  });

  it("clears cosmetic tile fields", () => {
    const state = makeGameState();
    applyGmPaintTile(state, 0, 0, {
      elevation: 0,
      terrain: "standard",
      tileEffects: [],
      tileName: "Named",
      baseColor: "#fff",
      appearanceKey: "key",
      featureKey: "feature-key",
      imageRotation: 180,
      imageFlip: true,
    });
    applyGmPaintTile(state, 0, 0, {
      elevation: 0,
      terrain: "standard",
      tileEffects: [],
      tileName: "",
      baseColor: null,
      appearanceKey: null,
      featureKey: null,
      imageRotation: null,
      imageFlip: null,
    });
    const tile = tileAt(state.tiles, 0, 0)!;
    expect(tile.name).toBeUndefined();
    expect(tile.baseColor).toBeUndefined();
    expect(tile.appearanceKey).toBeUndefined();
    expect(tile.featureKey).toBeUndefined();
    expect(tile.imageRotation).toBeUndefined();
    expect(tile.imageFlip).toBeUndefined();
  });

  it("replaces existing tile effects", () => {
    const state = makeGameState();
    applyGmPaintTile(state, 1, 1, {
      elevation: 0,
      terrain: "standard",
      tileEffects: ["Fortified:1"],
      tileName: "",
      baseColor: null,
      appearanceKey: null,
    });
    applyGmPaintTile(state, 1, 1, {
      elevation: 0,
      terrain: "standard",
      tileEffects: ["Stained:1"],
      tileName: "",
      baseColor: null,
      appearanceKey: null,
    });
    const tile = tileAt(state.tiles, 1, 1)!;
    expect(tile.tileEffects).toEqual({ Stained: 1 });
  });

  it("clears tile effects with an empty list", () => {
    const state = makeGameState();
    applyGmPaintTile(state, 0, 0, {
      elevation: 0,
      terrain: "standard",
      tileEffects: ["Fortified:1"],
      tileName: "",
      baseColor: null,
      appearanceKey: null,
    });
    const clearFields = {
      elevation: 0,
      terrain: "standard" as const,
      tileEffects: [] as string[],
      tileName: "",
      baseColor: null,
      appearanceKey: null,
    };
    expect(validateGmPaintTile(state, 0, 0, clearFields)).toBeNull();
    applyGmPaintTile(state, 0, 0, clearFields);
    expect(tileAt(state.tiles, 0, 0)!.tileEffects).toBeUndefined();
  });

  it("rejects invalid input", () => {
    const state = makeGameState({ width: 4, height: 4, tiles: makeTiles(4, 4) });
    expect(
      validateGmPaintTile(state, 9, 0, {
        elevation: 0,
        terrain: "standard",
        tileEffects: [],
        tileName: "",
        baseColor: null,
        appearanceKey: null,
      }),
    ).toBe("Out of bounds");
    expect(
      validateGmPaintTile(state, 0, 0, {
        elevation: 4,
        terrain: "standard",
        tileEffects: [],
        tileName: "",
        baseColor: null,
        appearanceKey: null,
      }),
    ).toBe("Elevation must be an integer from -3 to 3");
    expect(
      validateGmPaintTile(state, 0, 0, {
        elevation: 0,
        terrain: "bogus" as never,
        tileEffects: [],
        tileName: "",
        baseColor: null,
        appearanceKey: null,
      }),
    ).toBe("Invalid terrain type: bogus");
    expect(
      validateGmPaintTile(state, 0, 0, {
        elevation: 0,
        terrain: "standard",
        tileEffects: ["Nope:1"],
        tileName: "",
        baseColor: null,
        appearanceKey: null,
      }),
    ).toBe("Unknown effect: Nope");
    expect(
      validateGmPaintTile(state, 0, 0, {
        elevation: 0,
        terrain: "standard",
        tileEffects: [],
        tileName: "",
        baseColor: "not-a-color",
        appearanceKey: null,
      }),
    ).toBe("baseColor must be a #RGB or #RRGGBB hex color");
  });

  it("leaves omitted fields unchanged", () => {
    const state = makeGameState();
    applyGmPaintTile(state, 1, 1, {
      elevation: 2,
      terrain: "cover",
      tileEffects: ["Fortified:1"],
      tileName: "Keep",
      baseColor: "#112233",
      appearanceKey: "keep.png",
      featureKey: "feature.png",
      imageRotation: 270,
      imageFlip: true,
    });
    applyGmPaintTile(state, 1, 1, { terrain: "obstacle" });
    const tile = tileAt(state.tiles, 1, 1)!;
    expect(tile.elevation).toBe(2);
    expect(tile.terrain).toEqual(["obstacle"]);
    expect(tile.tileEffects).toEqual({ Fortified: 1 });
    expect(tile.name).toBe("Keep");
    expect(tile.baseColor).toBe("#112233");
    expect(tile.appearanceKey).toBe("keep.png");
    expect(tile.featureKey).toBe("feature.png");
    expect(tile.imageRotation).toBe(270);
    expect(tile.imageFlip).toBe(true);
  });

  it("rejects a message with no paint fields", () => {
    const state = makeGameState();
    expect(validateGmPaintTile(state, 0, 0, {})).toBe("No paint fields provided");
    const result = handleCombatMessage(
      state,
      { type: "gmPaintTile", coords: [{ x: 0, y: 0 }] },
      { role: "gm", playerId: null },
    );
    expect(result).toEqual({ handled: true, error: "No paint fields provided" });
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
