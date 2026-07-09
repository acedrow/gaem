import type { MapTile } from "@gaem/shared";
import { tileAt } from "@gaem/shared";

export type ElevationContourEdges = { east: boolean; south: boolean };

export function elevationContourEdges(
  elevation: number,
  eastElevation: number | undefined,
  southElevation: number | undefined,
): ElevationContourEdges {
  return {
    east: eastElevation != null && eastElevation !== elevation,
    south: southElevation != null && southElevation !== elevation,
  };
}

export type BoardCellMetrics = {
  width: number;
  height: number;
  cellW: number;
  cellH: number;
  gap: number;
};

export function boardCellMetrics(
  mapWidth: number,
  mapHeight: number,
  boardWidthPx: number,
  gap = 3,
): BoardCellMetrics {
  const boardHeightPx = boardWidthPx * (mapHeight / mapWidth);
  const cellW = (boardWidthPx - (mapWidth - 1) * gap) / mapWidth;
  const cellH = (boardHeightPx - (mapHeight - 1) * gap) / mapHeight;
  return { width: mapWidth, height: mapHeight, cellW, cellH, gap };
}

type Segment = {
  horizontal: boolean;
  fixed: number;
  start: number;
  end: number;
};

function boundaryX(x: number, cellW: number, gap: number): number {
  return (x + 1) * cellW + x * gap + gap / 2;
}

function boundaryY(y: number, cellH: number, gap: number): number {
  return (y + 1) * cellH + y * gap + gap / 2;
}

function verticalSpan(y: number, height: number, cellH: number, gap: number): { start: number; end: number } {
  const y0 = y * (cellH + gap) - (y > 0 ? gap / 2 : 0);
  const y1 = y0 + cellH + (y < height - 1 ? gap : gap / 2);
  return { start: y0, end: y1 };
}

function horizontalSpan(x: number, width: number, cellW: number, gap: number): { start: number; end: number } {
  const x0 = x * (cellW + gap) - (x > 0 ? gap / 2 : 0);
  const x1 = x0 + cellW + (x < width - 1 ? gap : gap / 2);
  return { start: x0, end: x1 };
}

function collectRawSegments(tiles: MapTile[], metrics: BoardCellMetrics): Segment[] {
  const { width, height, cellW, cellH, gap } = metrics;
  const segments: Segment[] = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const tile = tileAt(tiles, x, y);
      if (!tile) continue;
      const elev = tile.elevation;

      const east = tileAt(tiles, x + 1, y);
      if (east && east.elevation !== elev) {
        const span = verticalSpan(y, height, cellH, gap);
        segments.push({
          horizontal: false,
          fixed: boundaryX(x, cellW, gap),
          start: span.start,
          end: span.end,
        });
      }

      const south = tileAt(tiles, x, y + 1);
      if (south && south.elevation !== elev) {
        const span = horizontalSpan(x, width, cellW, gap);
        segments.push({
          horizontal: true,
          fixed: boundaryY(y, cellH, gap),
          start: span.start,
          end: span.end,
        });
      }
    }
  }

  return segments;
}

function mergeCollinearSegments(segments: Segment[]): Segment[] {
  const verticals = new Map<number, { start: number; end: number }[]>();
  const horizontals = new Map<number, { start: number; end: number }[]>();

  for (const seg of segments) {
    const key = Math.round(seg.fixed * 1000) / 1000;
    const bucket = seg.horizontal ? horizontals : verticals;
    const ranges = bucket.get(key) ?? [];
    ranges.push({ start: seg.start, end: seg.end });
    bucket.set(key, ranges);
  }

  const merged: Segment[] = [];
  for (const [fixed, ranges] of verticals) {
    for (const range of mergeRanges(ranges)) {
      merged.push({ horizontal: false, fixed, start: range.start, end: range.end });
    }
  }
  for (const [fixed, ranges] of horizontals) {
    for (const range of mergeRanges(ranges)) {
      merged.push({ horizontal: true, fixed, start: range.start, end: range.end });
    }
  }
  return merged;
}

function mergeRanges(ranges: { start: number; end: number }[]): { start: number; end: number }[] {
  if (ranges.length === 0) return [];
  const sorted = ranges
    .map((r) => (r.start <= r.end ? r : { start: r.end, end: r.start }))
    .sort((a, b) => a.start - b.start);
  const merged: { start: number; end: number }[] = [{ ...sorted[0]! }];
  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i]!;
    const last = merged[merged.length - 1]!;
    if (cur.start <= last.end + 1e-6) {
      last.end = Math.max(last.end, cur.end);
    } else {
      merged.push({ ...cur });
    }
  }
  return merged;
}

function pointKey(x: number, y: number): string {
  return `${x},${y}`;
}

function parsePoint(key: string): [number, number] {
  const [x, y] = key.split(",").map(Number);
  return [x!, y!];
}

function edgeKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function segmentsToAdjacency(segments: Segment[]): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>();
  const addEdge = (a: string, b: string) => {
    if (!adj.has(a)) adj.set(a, new Set());
    if (!adj.has(b)) adj.set(b, new Set());
    adj.get(a)!.add(b);
    adj.get(b)!.add(a);
  };

  for (const seg of segments) {
    if (seg.horizontal) {
      addEdge(pointKey(seg.start, seg.fixed), pointKey(seg.end, seg.fixed));
    } else {
      addEdge(pointKey(seg.fixed, seg.start), pointKey(seg.fixed, seg.end));
    }
  }
  return adj;
}

function chainToPath(vertices: string[]): string {
  const pts = vertices.map(parsePoint);
  let d = `M ${pts[0]![0]} ${pts[0]![1]}`;
  for (let i = 1; i < pts.length; i++) {
    d += ` L ${pts[i]![0]} ${pts[i]![1]}`;
  }
  return d;
}

function tracePaths(adj: Map<string, Set<string>>): string[] {
  const visitedEdges = new Set<string>();
  const paths: string[] = [];

  const walkFrom = (start: string, next: string): string[] => {
    visitedEdges.add(edgeKey(start, next));
    const vertices = [start, next];
    let prev = start;
    let current = next;

    while (true) {
      const neighbors = adj.get(current);
      if (!neighbors) break;

      let found: string | null = null;
      for (const n of neighbors) {
        if (n === prev) continue;
        const ek = edgeKey(current, n);
        if (visitedEdges.has(ek)) continue;
        visitedEdges.add(ek);
        found = n;
        break;
      }
      if (!found) break;

      vertices.push(found);
      prev = current;
      current = found;
    }

    return vertices;
  };

  for (const [node, neighbors] of adj) {
    if (neighbors.size === 1) {
      const n = [...neighbors][0]!;
      const ek = edgeKey(node, n);
      if (visitedEdges.has(ek)) continue;
      const chain = walkFrom(node, n);
      if (chain.length >= 2) paths.push(chainToPath(chain));
    }
  }

  for (const [node, neighbors] of adj) {
    for (const n of neighbors) {
      const ek = edgeKey(node, n);
      if (visitedEdges.has(ek)) continue;
      const chain = walkFrom(node, n);
      if (chain.length >= 2) paths.push(chainToPath(chain));
    }
  }

  return paths;
}

export function buildElevationContourPaths(tiles: MapTile[], metrics: BoardCellMetrics): string[] {
  const raw = collectRawSegments(tiles, metrics);
  if (raw.length === 0) return [];
  const merged = mergeCollinearSegments(raw);
  const adj = segmentsToAdjacency(merged);
  return tracePaths(adj);
}

export function parsePathCommands(d: string): { cmd: string; x: number; y: number }[] {
  const tokens = d.trim().split(/\s+/);
  const points: { cmd: string; x: number; y: number }[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const cmd = tokens[i]!;
    if (cmd !== "M" && cmd !== "L") continue;
    const x = Number(tokens[++i]);
    const y = Number(tokens[++i]);
    points.push({ cmd, x, y });
  }
  return points;
}
