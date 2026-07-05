import type { Enemy, GameState, Player } from "../types.js";
import { buildBoardOccupancy } from "../game.js";
import { buildSwarmGroups, reconcileSwarmHp } from "./swarm.js";
import { coordKey, isInBounds, isWalkable, tileAt } from "../map.js";
import { enemyLabel, playerLabel } from "../console.js";
import { enemyFootprintTiles, getEnemyScale } from "../enemy-data.js";

export function isAttractorVoidTile(state: GameState, x: number, y: number): boolean {
  return (state.combat?.attractors ?? []).some((a) => a.x === x && a.y === y && a.void);
}

function isTileFreeForUnit(
  state: GameState,
  occ: ReturnType<typeof buildBoardOccupancy>,
  x: number,
  y: number,
  excludeEnemyId?: string,
  excludePlayerId?: string,
): boolean {
  if (!isInBounds(x, y, state.width, state.height)) return false;
  const tile = tileAt(state.tiles, x, y);
  if (!tile || !isWalkable(tile)) return false;
  const key = coordKey(x, y);
  const p = occ.playerByKey.get(key);
  if (p && p.id !== excludePlayerId) return false;
  const e = occ.enemyByKey.get(key);
  if (e && e.id !== excludeEnemyId) return false;
  return true;
}

function stepToward(fromX: number, fromY: number, towardX: number, towardY: number): { x: number; y: number } {
  const dx = towardX - fromX;
  const dy = towardY - fromY;
  if (Math.abs(dx) + Math.abs(dy) === 0) return { x: fromX, y: fromY };
  if (Math.abs(dx) >= Math.abs(dy)) {
    return { x: fromX + Math.sign(dx), y: fromY };
  }
  return { x: fromX, y: fromY + Math.sign(dy) };
}

export function applyPullToward(
  state: GameState,
  unit: Player | Enemy,
  towardX: number,
  towardY: number,
  distance: number,
  opts?: { kind?: "player" | "enemy" },
): string {
  if (distance <= 0) return "";
  const kind = opts?.kind ?? ("weapon" in unit && unit.weapon !== undefined ? "player" : "enemy");
  const isPlayer = kind === "player" || "playerKey" in unit;
  const parts: string[] = [];
  let cx = unit.x;
  let cy = unit.y;
  const excludeEnemyId = isPlayer ? undefined : unit.id;
  const excludePlayerId = isPlayer ? unit.id : undefined;
  const occ = buildBoardOccupancy(state);

  for (let i = 0; i < distance; i++) {
    const next = stepToward(cx, cy, towardX, towardY);
    if (next.x === cx && next.y === cy) break;
    if (!isTileFreeForUnit(state, occ, next.x, next.y, excludeEnemyId, excludePlayerId)) break;
    cx = next.x;
    cy = next.y;
    parts.push(`(${cx},${cy})`);
    if (isAttractorVoidTile(state, cx, cy)) {
      if (isPlayer) {
        (unit as Player).hp = 0;
        parts.push("void defeat");
      } else {
        (unit as Enemy).hp = 0;
        parts.push("void defeat");
      }
      break;
    }
  }

  if (cx === unit.x && cy === unit.y) return "";

  if (isPlayer) {
    const player = unit as Player;
    player.x = cx;
    player.y = cy;
    return `pulled ${playerLabel(player)} → ${parts.join(" → ")}`;
  }

  const enemy = unit as Enemy;
  const prevGroups = buildSwarmGroups(state);
  const scale = getEnemyScale(enemy);
  const footprint = enemyFootprintTiles(cx, cy, scale);
  const anchor = footprint[0] ?? { x: cx, y: cy };
  enemy.x = anchor.x;
  enemy.y = anchor.y;
  reconcileSwarmHp(state, prevGroups);
  return `pulled ${enemyLabel(enemy)} → ${parts.join(" → ")}`;
}
