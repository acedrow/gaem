import { describe, expect, it } from "vitest";
import { primaryTerrainTypeForIcon, terrainTypeIcon } from "./terrain-data.js";
import { TERRAIN_TYPES } from "./types.js";

describe("terrain-data", () => {
  it("includes advantageous in TERRAIN_TYPES", () => {
    expect(TERRAIN_TYPES).toContain("advantageous");
  });

  it("exposes rulebook icons for terrain types", () => {
    expect(terrainTypeIcon("standard")).toBeUndefined();
    expect(terrainTypeIcon("void")).toBeUndefined();
    expect(terrainTypeIcon("impassable")).toBeTruthy();
    expect(terrainTypeIcon("uneasy")).toBeTruthy();
    expect(terrainTypeIcon("cover")).toBeTruthy();
    expect(terrainTypeIcon("obstacle")).toBeTruthy();
    expect(terrainTypeIcon("advantageous")).toBeTruthy();
  });

  it("primaryTerrainTypeForIcon skips void and standard", () => {
    expect(primaryTerrainTypeForIcon(["void"])).toBeNull();
    expect(primaryTerrainTypeForIcon(["standard"])).toBeNull();
    expect(primaryTerrainTypeForIcon(["advantageous"])).toBe("advantageous");
    expect(primaryTerrainTypeForIcon(["cover", "void"])).toBeNull();
    expect(primaryTerrainTypeForIcon(["cover", "uneasy"])).toBe("cover");
  });
});
