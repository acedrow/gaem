import type { MapTile } from "@gaem/shared";
import { describe, it } from "vitest";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { boardCellMetrics, __debugSegments } from "./elevationContours.js";

function tile(x: number, y: number, elevation: number): MapTile {
  return { x, y, terrain: ["standard"], elevation };
}

function grid(mapW: number, mapH: number, spots: [number, number, number][]): MapTile[] {
  const map = new Map(spots.map(([x, y, e]) => [`${x},${y}`, e]));
  const tiles: MapTile[] = [];
  for (let y = 0; y < mapH; y++) {
    for (let x = 0; x < mapW; x++) {
      tiles.push(tile(x, y, map.get(`${x},${y}`) ?? 0));
    }
  }
  return tiles;
}

function show(name: string, tiles: MapTile[]) {
  const m = boardCellMetrics(5, 5, 250, 3);
  const { raw, merged } = __debugSegments(tiles, m);
  // eslint-disable-next-line no-console
  console.log(`\n=== ${name} === raw=${raw.length} merged=${merged.length}`);
  for (const s of merged) {
    const o = s.horizontal ? "H" : "V";
    // eslint-disable-next-line no-console
    console.log(`  ${o} fixed=${s.fixed.toFixed(3)} [${s.start.toFixed(3)}..${s.end.toFixed(3)}] inset=${s.inset.toFixed(3)}`);
  }
}

describe("dbg segs", () => {
  it("segments", () => {
    show("two +1 diagonal (1,1)&(2,2)", grid(5, 5, [[1, 1, 1], [2, 2, 1]]));
    show("two -1 diagonal (1,1)&(2,2)", grid(5, 5, [[1, 1, -1], [2, 2, -1]]));
    show("L +1 (1,1)(2,1)(2,2)", grid(5, 5, [[1, 1, 1], [2, 1, 1], [2, 2, 1]]));
    show("L -1 (1,1)(2,1)(2,2)", grid(5, 5, [[1, 1, -1], [2, 1, -1], [2, 2, -1]]));
  });
});
