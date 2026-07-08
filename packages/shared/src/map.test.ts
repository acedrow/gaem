import { describe, expect, it } from "vitest";
import {
  buildTileIndex,
  computeWalkable,
  createInitialStateFromMap,
  isFootprintInBounds,
  isInBounds,
  isWalkable,
  parseGameMap,
  tileAt,
} from "./map.js";
import type { GameMap, MapTile } from "./types.js";
import { makeTiles } from "./test/fixtures.js";

describe("map", () => {
  it("isInBounds and isFootprintInBounds", () => {
    expect(isInBounds(0, 0, 5, 5)).toBe(true);
    expect(isInBounds(4, 4, 5, 5)).toBe(true);
    expect(isInBounds(5, 0, 5, 5)).toBe(false);
    expect(isInBounds(-1, 0, 5, 5)).toBe(false);

    expect(isFootprintInBounds(0, 0, 1, 5, 5)).toBe(true);
    expect(isFootprintInBounds(4, 4, 1, 5, 5)).toBe(true);
    expect(isFootprintInBounds(4, 0, 2, 5, 5)).toBe(false);
    expect(isFootprintInBounds(0, 4, 2, 5, 5)).toBe(false);
  });

  it("isWalkable respects terrain and walkable override", () => {
    const standard: MapTile = { x: 0, y: 0, terrain: ["standard"], elevation: 0 };
    const impassable: MapTile = { x: 0, y: 0, terrain: ["impassable"], elevation: 0 };
    const voidTile: MapTile = { x: 0, y: 0, terrain: ["void"], elevation: 0 };
    const obstacle: MapTile = { x: 0, y: 0, terrain: ["obstacle"], elevation: 0 };
    const advantageous: MapTile = { x: 0, y: 0, terrain: ["advantageous"], elevation: 0 };
    const override: MapTile = { x: 0, y: 0, terrain: ["impassable"], elevation: 0, walkable: true };

    expect(isWalkable(standard)).toBe(true);
    expect(computeWalkable(standard)).toBe(true);
    expect(isWalkable(advantageous)).toBe(true);
    expect(isWalkable(impassable)).toBe(false);
    expect(isWalkable(voidTile)).toBe(false);
    expect(isWalkable(obstacle)).toBe(false);
    expect(isWalkable(override)).toBe(true);
    expect(isWalkable(undefined)).toBe(false);
  });

  it("tileAt and buildTileIndex", () => {
    const tiles = makeTiles(3, 3);
    const index = buildTileIndex(tiles);
    expect(tileAt(tiles, 1, 1)?.terrain).toEqual(["standard"]);
    expect(tileAt(index, 2, 0)?.x).toBe(2);
    expect(tileAt(tiles, 9, 9)).toBeUndefined();
  });

  it("createInitialStateFromMap", () => {
    const map: GameMap = {
      id: "arena",
      name: "Arena",
      width: 6,
      height: 6,
      tiles: makeTiles(6, 6),
      enemies: [{ id: "e1", x: 3, y: 3, name: "Stain Creep" }],
    };
    const state = createInitialStateFromMap(map);
    expect(state.mapId).toBe("arena");
    expect(state.mapName).toBe("Arena");
    expect(state.width).toBe(6);
    expect(state.height).toBe(6);
    expect(state.roundPhase).toBe("deployment");
    expect(state.turn).toEqual({ role: "gm" });
    expect(state.players).toEqual([]);
    expect(state.enemies).toHaveLength(1);
    expect(state.enemies[0]!.hp).toBe(1);
    expect(state.enemies[0]!.movementRemaining).toBeDefined();
  });

  it("parseGameMap reads optional tile cosmetics and presets", () => {
    const tiles = makeTiles(2, 2).map((tile, i) =>
      i === 0
        ? {
            ...tile,
            name: "Start",
            baseColor: "#abc",
            appearanceKey: "tile-appearances/test.png",
          }
        : tile,
    );
    const map = parseGameMap({
      id: "test",
      width: 2,
      height: 2,
      tiles,
      tilePresets: {
        Forest: {
          elevation: 1,
          terrain: "cover",
          tileEffectId: "Stained",
          tileEffectStacks: 2,
          tileName: "Forest",
          baseColor: "#112233",
        },
      },
    });
    expect(map.tiles[0]!.name).toBe("Start");
    expect(map.tiles[0]!.baseColor).toBe("#abc");
    expect(map.tiles[0]!.appearanceKey).toBe("tile-appearances/test.png");
    expect(map.tilePresets?.Forest?.terrain).toBe("cover");
  });
});
