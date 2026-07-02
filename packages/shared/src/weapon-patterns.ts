import type { PatternDirection } from "./pattern-data.js";
import type { RelativeTile, WeaponAttackSpec } from "./combat/types.js";

export type PatternGridCell = "empty" | "origin" | "attack" | "heal";

export type PatternGrid = {
  minX: number;
  minY: number;
  width: number;
  height: number;
  cells: PatternGridCell[][];
};

export function rotateRelativeTile(
  [rx, ry]: RelativeTile,
  direction: PatternDirection,
): [number, number] {
  switch (direction) {
    case "e":
      return [rx, ry];
    case "n":
      return [ry, -rx];
    case "s":
      return [-ry, rx];
    case "w":
      return [-rx, -ry];
  }
}

export function bespokeTilesInBounds(
  origin: { x: number; y: number },
  tiles: RelativeTile[],
  direction: PatternDirection,
  boardWidth: number,
  boardHeight: number,
): { x: number; y: number }[] {
  const seen = new Set<string>();
  const result: { x: number; y: number }[] = [];
  for (const tile of tiles) {
    const [dx, dy] = rotateRelativeTile(tile, direction);
    const x = origin.x + dx;
    const y = origin.y + dy;
    if (x < 0 || y < 0 || x >= boardWidth || y >= boardHeight) continue;
    const key = `${x},${y}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ x, y });
  }
  return result;
}

export function attackSpecHasDiagram(spec: WeaponAttackSpec): boolean {
  return !!(
    spec.tiles?.length ||
    spec.levels?.length ||
    spec.bombs?.length ||
    spec.rangeTargets
  );
}

export function buildPatternGrid(
  tiles: RelativeTile[],
  options?: { healTiles?: RelativeTile[]; showOrigin?: boolean },
): PatternGrid {
  const showOrigin = options?.showOrigin ?? true;
  const healKeys = new Set((options?.healTiles ?? []).map((t) => `${t[0]},${t[1]}`));
  const attackKeys = new Set(tiles.map((t) => `${t[0]},${t[1]}`));

  let minX = showOrigin ? 0 : Infinity;
  let maxX = showOrigin ? 0 : -Infinity;
  let minY = showOrigin ? 0 : Infinity;
  let maxY = showOrigin ? 0 : -Infinity;

  const mark = (x: number, y: number) => {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  };

  if (showOrigin) mark(0, 0);
  for (const [x, y] of tiles) mark(x, y);
  for (const [x, y] of options?.healTiles ?? []) mark(x, y);

  if (!Number.isFinite(minX)) {
    return { minX: 0, minY: 0, width: 1, height: 1, cells: [["empty"]] };
  }

  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  const cells: PatternGridCell[][] = [];
  for (let row = 0; row < height; row++) {
    const line: PatternGridCell[] = [];
    for (let col = 0; col < width; col++) {
      const x = minX + col;
      const y = minY + row;
      const key = `${x},${y}`;
      if (showOrigin && x === 0 && y === 0) {
        line.push("origin");
      } else if (healKeys.has(key)) {
        line.push("heal");
      } else if (attackKeys.has(key)) {
        line.push("attack");
      } else {
        line.push("empty");
      }
    }
    cells.push(line);
  }

  return { minX, minY, width, height, cells };
}

export function formatWeaponPatternSummary(spec: WeaponAttackSpec): string {
  if (spec.rangeTargets) {
    return `Up to ${spec.rangeTargets.maxTargets} targets within Range:${spec.rangeTargets.range}`;
  }
  if (spec.tiles?.length) {
    return `${spec.tiles.length}-tile pattern`;
  }
  if (spec.patternId && spec.size != null) {
    const parts = [`${spec.patternId}:${spec.size}`];
    if (spec.range) parts.push(`range ${spec.range}`);
    if (spec.width && spec.width > 1) parts.push(`width ${spec.width}`);
    return parts.join(", ");
  }
  return "Variable pattern";
}

export function isRangeTargetAttack(spec: WeaponAttackSpec): boolean {
  return !!(spec.rangeTargets || (spec.patternId === "range" && spec.range));
}

export function rangeTargetDistance(spec: WeaponAttackSpec): number {
  return spec.rangeTargets?.range ?? spec.range ?? 1;
}
