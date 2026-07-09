import type { MapTile } from "@gaem/shared";
import { describe, it } from "vitest";

import { boardCellMetrics, buildElevationContourPaths } from "./elevationContours.js";

function tile(x: number, y: number, elevation: number): MapTile {
  return { x, y, terrain: ["standard"], elevation };
}

function elevatedBlockGrid(
  bx: number, by: number, bw: number, bh: number, mw: number, mh: number, be: number,
): MapTile[] {
  const tiles: MapTile[] = [];
  for (let y = 0; y < mh; y++) {
    for (let x = 0; x < mw; x++) {
      const inB = x >= bx && x < bx + bw && y >= by && y < by + bh;
      tiles.push(tile(x, y, inB ? be : 0));
    }
  }
  return tiles;
}

function radii(path: string): number[] {
  const tokens = path.trim().split(/\s+/);
  const rs: number[] = [];
  let x = 0, y = 0;
  for (let i = 0; i < tokens.length; i++) {
    const cmd = tokens[i]!;
    if (cmd === "M" || cmd === "L") { x = Number(tokens[++i]); y = Number(tokens[++i]); }
    else if (cmd === "Q") { const qx = Number(tokens[++i]); const qy = Number(tokens[++i]); const nx = Number(tokens[++i]); const ny = Number(tokens[++i]); rs.push(Math.hypot(qx - x, qy - y)); x = nx; y = ny; }
  }
  return rs;
}

describe("dbg radii", () => {
  it("dumps", () => {
    const m = boardCellMetrics(7, 7, 420, 3);
    const cornerR = Math.min(25, m.gap * 8.5);
    // eslint-disable-next-line no-console
    console.log(`cornerR=${cornerR}`);
    const t1 = elevatedBlockGrid(2, 3, 3, 4, 7, 7, -3);
    t1.find((t) => t.x === 3 && t.y === 6)!.elevation = 3;
    const paths = buildElevationContourPaths(t1, m);
    for (const p of paths.filter((p) => !p.includes(" Z"))) {
      // eslint-disable-next-line no-console
      console.log(`open radii=${radii(p).map((r) => r.toFixed(2)).join(",")}`);
    }
  });
});
