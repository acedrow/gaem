import type { MapTile } from "@gaem/shared";
import { describe, expect, it } from "vitest";

import {
  boardCellMetrics,
  buildElevationContourPaths,
  contourInsetIndex,
  contourStepInsetPx,
  elevationContourEdges,
  elevationStepsBetween,
  parsePathCommands,
} from "./elevationContours.js";

function tile(x: number, y: number, elevation: number): MapTile {
  return { x, y, terrain: ["standard"], elevation };
}

function flatGrid(width: number, height: number, elevation = 0): MapTile[] {
  const tiles: MapTile[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      tiles.push(tile(x, y, elevation));
    }
  }
  return tiles;
}

const metrics2x2 = boardCellMetrics(2, 2, 100, 3);

describe("elevationContourEdges", () => {
  it("returns no edges for flat neighbors", () => {
    expect(elevationContourEdges(0, 0, 0)).toEqual({ east: false, south: false });
  });

  it("returns east edge when east neighbor differs", () => {
    expect(elevationContourEdges(0, 1, 0)).toEqual({ east: true, south: false });
    expect(elevationContourEdges(0, 1, undefined)).toEqual({ east: true, south: false });
  });

  it("returns south edge when south neighbor differs", () => {
    expect(elevationContourEdges(0, 0, 1)).toEqual({ east: false, south: true });
    expect(elevationContourEdges(0, 0, -1)).toEqual({ east: false, south: true });
  });

  it("returns both edges when both neighbors differ", () => {
    expect(elevationContourEdges(0, 1, -1)).toEqual({ east: true, south: true });
  });

  it("returns no edges when neighbors are missing", () => {
    expect(elevationContourEdges(0, undefined, undefined)).toEqual({ east: false, south: false });
    expect(elevationContourEdges(2, undefined, 1)).toEqual({ east: false, south: true });
    expect(elevationContourEdges(2, 1, undefined)).toEqual({ east: true, south: false });
  });
});

function countPathQs(path: string): number {
  return (path.match(/\sQ\s/g) ?? []).length;
}

function elevatedBlockGrid(
  blockX: number,
  blockY: number,
  blockW: number,
  blockH: number,
  mapW: number,
  mapH: number,
  blockElev = 1,
): MapTile[] {
  const tiles: MapTile[] = [];
  for (let y = 0; y < mapH; y++) {
    for (let x = 0; x < mapW; x++) {
      const inBlock = x >= blockX && x < blockX + blockW && y >= blockY && y < blockY + blockH;
      tiles.push(tile(x, y, inBlock ? blockElev : 0));
    }
  }
  return tiles;
}

function singleTileGrid(x: number, y: number, elevation: number, mapW: number, mapH: number): MapTile[] {
  const tiles: MapTile[] = [];
  for (let ty = 0; ty < mapH; ty++) {
    for (let tx = 0; tx < mapW; tx++) {
      tiles.push(tile(tx, ty, tx === x && ty === y ? elevation : 0));
    }
  }
  return tiles;
}

function pathBounds(path: string): { minX: number; maxX: number; minY: number; maxY: number } {
  const points = parsePathCommands(path);
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

describe("elevationStepsBetween", () => {
  it("returns one step for adjacent elevations", () => {
    expect(elevationStepsBetween(0, 1)).toEqual([0]);
    expect(elevationStepsBetween(1, 0)).toEqual([0]);
  });

  it("returns all intermediate steps for larger gaps", () => {
    expect(elevationStepsBetween(0, 2)).toEqual([0, 1]);
    expect(elevationStepsBetween(0, -2)).toEqual([-2, -1]);
  });
});

describe("contourInsetIndex", () => {
  it("places each elevation ring at a fixed depth from the boundary", () => {
    expect(contourInsetIndex(0)).toBe(0);
    expect(contourInsetIndex(1)).toBe(1);
    expect(contourInsetIndex(2)).toBe(2);
    expect(contourInsetIndex(-1)).toBe(0);
    expect(contourInsetIndex(-2)).toBe(1);
  });
});

describe("buildElevationContourPaths", () => {
  it("returns no paths for a flat map", () => {
    expect(buildElevationContourPaths(flatGrid(3, 3), boardCellMetrics(3, 3, 120, 3))).toEqual([]);
  });

  it("returns one path for a single elevation step (0 vs 1)", () => {
    const tiles = [tile(0, 0, 0), tile(1, 0, 1)];
    const paths = buildElevationContourPaths(tiles, boardCellMetrics(2, 1, 100, 3));
    expect(paths).toHaveLength(1);
  });

  it("returns two vertical paths for a two-step east edge (0 vs 2)", () => {
    const tiles = [tile(0, 0, 0), tile(1, 0, 2)];
    const m = boardCellMetrics(2, 1, 100, 3);
    const paths = buildElevationContourPaths(tiles, m);
    expect(paths).toHaveLength(2);
    const xs = paths.map((p) => pathBounds(p).minX);
    expect(new Set(xs.map((x) => Math.round(x * 100))).size).toBe(2);
    expect(Math.abs(xs[1]! - xs[0]!)).toBeCloseTo(contourStepInsetPx(m), 3);
  });

  it("returns nested closed paths for a single elevation-2 tile", () => {
    const tiles = singleTileGrid(2, 2, 2, 5, 5);
    const paths = buildElevationContourPaths(tiles, boardCellMetrics(5, 5, 200, 3));
    expect(paths).toHaveLength(2);
    const byArea = [...paths].sort(
      (a, b) =>
        (pathBounds(b).maxX - pathBounds(b).minX) * (pathBounds(b).maxY - pathBounds(b).minY) -
        (pathBounds(a).maxX - pathBounds(a).minX) * (pathBounds(a).maxY - pathBounds(a).minY),
    );
    const outer = pathBounds(byArea[0]!);
    const inner = pathBounds(byArea[1]!);
    expect(inner.minX).toBeGreaterThan(outer.minX);
    expect(inner.maxX).toBeLessThan(outer.maxX);
    expect(inner.minY).toBeGreaterThan(outer.minY);
    expect(inner.maxY).toBeLessThan(outer.maxY);
  });

  it("returns nested closed paths for a single elevation -2 pit tile", () => {
    const tiles = singleTileGrid(2, 2, -2, 5, 5);
    const paths = buildElevationContourPaths(tiles, boardCellMetrics(5, 5, 200, 3));
    expect(paths).toHaveLength(2);
    for (const path of paths) {
      expect(path).toContain(" Z");
    }
  });

  it("returns one continuous vertical path for a 2x1 elevation step", () => {
    const tiles = [tile(0, 0, 0), tile(1, 0, 1)];
    const m = boardCellMetrics(2, 1, 100, 3);
    const paths = buildElevationContourPaths(tiles, m);
    expect(paths).toHaveLength(1);
    const points = parsePathCommands(paths[0]!);
    expect(points).toHaveLength(2);
    expect(points[0]!.x).toBeCloseTo(points[1]!.x, 5);
    expect(points[0]!.y).toBe(0);
    expect(points[1]!.y).toBeCloseTo(m.cellH + m.gap / 2, 5);
  });

  it("returns one connected path with a corner for an L-shaped region", () => {
    const tiles = [
      tile(0, 0, 1),
      tile(1, 0, 1),
      tile(0, 1, 1),
      tile(1, 1, 0),
    ];
    const paths = buildElevationContourPaths(tiles, metrics2x2);
    expect(paths).toHaveLength(1);
    expect(paths[0]).toContain(" Q ");
    const points = parsePathCommands(paths[0]!);
    expect(points.length).toBeGreaterThanOrEqual(3);
    const xs = new Set(points.map((p) => Math.round(p.x * 100)));
    const ys = new Set(points.map((p) => Math.round(p.y * 100)));
    expect(xs.size).toBeGreaterThan(1);
    expect(ys.size).toBeGreaterThan(1);
  });

  it("rounds all four corners of a rectangular contour loop", () => {
    const tiles = elevatedBlockGrid(1, 1, 2, 2, 4, 4);
    const paths = buildElevationContourPaths(tiles, boardCellMetrics(4, 4, 160, 3));
    expect(paths).toHaveLength(1);
    expect(countPathQs(paths[0]!)).toBe(4);
    expect(paths[0]).toContain(" Z");
  });

  it("returns separate paths for disconnected elevation islands", () => {
    const tiles = [
      tile(0, 0, 0),
      tile(1, 0, 1),
      tile(0, 1, 1),
      tile(1, 1, 0),
    ];
    const paths = buildElevationContourPaths(tiles, metrics2x2);
    expect(paths).toHaveLength(2);
    for (const path of paths) {
      expect(parsePathCommands(path).length).toBeGreaterThanOrEqual(2);
    }
  });

  it("encloses a single elev-2 tile inside an elev-1 block without joining the outer ring", () => {
    const tiles = elevatedBlockGrid(1, 1, 2, 2, 4, 4, 1);
    const peak = tiles.find((t) => t.x === 2 && t.y === 1)!;
    peak.elevation = 2;
    const paths = buildElevationContourPaths(tiles, boardCellMetrics(4, 4, 160, 3));
    expect(paths).toHaveLength(2);
    for (const path of paths) {
      expect(path).toContain(" Z");
      expect(countPathQs(path)).toBe(4);
    }
    const byArea = [...paths].sort(
      (a, b) =>
        (pathBounds(b).maxX - pathBounds(b).minX) * (pathBounds(b).maxY - pathBounds(b).minY) -
        (pathBounds(a).maxX - pathBounds(a).minX) * (pathBounds(a).maxY - pathBounds(a).minY),
    );
    const outer = pathBounds(byArea[0]!);
    const inner = pathBounds(byArea[1]!);
    expect(inner.minX).toBeGreaterThan(outer.minX);
    expect(inner.maxX).toBeLessThan(outer.maxX);
    expect(inner.minY).toBeGreaterThan(outer.minY);
    expect(inner.maxY).toBeLessThan(outer.maxY);
  });

  it("draws a contiguous elev-2 rectangle inside an elev-1 block", () => {
    const tiles = elevatedBlockGrid(1, 1, 2, 2, 4, 4, 1);
    for (const t of tiles) {
      if (t.x === 2 && (t.y === 1 || t.y === 2)) t.elevation = 2;
    }
    const paths = buildElevationContourPaths(tiles, boardCellMetrics(4, 4, 160, 3));
    expect(paths).toHaveLength(2);
    for (const path of paths) {
      expect(path).toContain(" Z");
      expect(countPathQs(path)).toBe(4);
    }
    const byArea = [...paths].sort(
      (a, b) =>
        (pathBounds(b).maxX - pathBounds(b).minX) * (pathBounds(b).maxY - pathBounds(b).minY) -
        (pathBounds(a).maxX - pathBounds(a).minX) * (pathBounds(a).maxY - pathBounds(a).minY),
    );
    const outer = pathBounds(byArea[0]!);
    const inner = pathBounds(byArea[1]!);
    expect(inner.minX).toBeGreaterThan(outer.minX);
    expect(inner.maxX).toBeLessThan(outer.maxX);
    expect(inner.maxY - inner.minY).toBeGreaterThan((outer.maxY - outer.minY) * 0.6);
  });

  it("keeps nested elev-2 block contours fully connected across tile borders", () => {
    const tiles = elevatedBlockGrid(1, 1, 2, 2, 4, 4, 2);
    const paths = buildElevationContourPaths(tiles, boardCellMetrics(4, 4, 160, 3));
    expect(paths).toHaveLength(2);
    for (const path of paths) {
      expect(path).toContain(" Z");
      expect(countPathQs(path)).toBe(4);
    }
    const byArea = [...paths].sort(
      (a, b) =>
        (pathBounds(b).maxX - pathBounds(b).minX) * (pathBounds(b).maxY - pathBounds(b).minY) -
        (pathBounds(a).maxX - pathBounds(a).minX) * (pathBounds(a).maxY - pathBounds(a).minY),
    );
    const outer = pathBounds(byArea[0]!);
    const inner = pathBounds(byArea[1]!);
    expect(inner.minX).toBeGreaterThan(outer.minX);
    expect(inner.maxX).toBeLessThan(outer.maxX);
    expect(inner.minY).toBeGreaterThan(outer.minY);
    expect(inner.maxY).toBeLessThan(outer.maxY);
  });
});
