import type { GameState, GaemRole, Player } from "../types.js";
import { isOrthogonallyAdjacent } from "../patterns.js";
import type { AttractorTile } from "./types.js";
import { applyPullToward } from "./pull.js";
import { getGearByName } from "../player-data.js";

const ATTRACTOR_ZONE_RADIUS = 2;

function ensureCombatObjects(state: GameState): void {
  if (!state.combat) return;
  if (!state.combat.attractors) state.combat.attractors = [];
}

export function getAttractors(state: GameState): AttractorTile[] {
  return state.combat?.attractors ?? [];
}

export function isAttractorVoidTile(state: GameState, x: number, y: number): boolean {
  return getAttractors(state).some((a) => a.x === x && a.y === y && a.void);
}

export function tilesInAttractorZone(attractor: AttractorTile): { x: number; y: number }[] {
  const tiles: { x: number; y: number }[] = [];
  for (let dx = -ATTRACTOR_ZONE_RADIUS; dx <= ATTRACTOR_ZONE_RADIUS; dx++) {
    for (let dy = -ATTRACTOR_ZONE_RADIUS; dy <= ATTRACTOR_ZONE_RADIUS; dy++) {
      if (Math.abs(dx) + Math.abs(dy) <= ATTRACTOR_ZONE_RADIUS) {
        tiles.push({ x: attractor.x + dx, y: attractor.y + dy });
      }
    }
  }
  return tiles;
}

export function placeAttractor(
  state: GameState,
  ownerId: string,
  x: number,
  y: number,
): AttractorTile {
  ensureCombatObjects(state);
  const id = `attractor-${ownerId}-${x}-${y}-${Date.now()}`;
  const attractor: AttractorTile = { id, ownerId, x, y, void: false };
  state.combat!.attractors!.push(attractor);
  return attractor;
}

export function getAttractorAt(state: GameState, x: number, y: number): AttractorTile | undefined {
  return getAttractors(state).find((a) => a.x === x && a.y === y);
}

export function validateRemoveAttractor(
  state: GameState,
  x: number,
  y: number,
  ctx: { role: GaemRole; playerId: string | null },
): string | null {
  const attractor = getAttractorAt(state, x, y);
  if (!attractor) return "No attractor here";
  if (ctx.role === "gm") return null;
  if (ctx.playerId && ctx.playerId === attractor.ownerId) return null;
  return "Not your attractor";
}

export function applyRemoveAttractor(state: GameState, x: number, y: number): string {
  const attractor = getAttractorAt(state, x, y);
  if (!attractor) return "No attractor here";
  state.combat!.attractors = getAttractors(state).filter((a) => a.id !== attractor.id);
  if (attractor.void) {
    const tile = state.tiles.find((t) => t.x === x && t.y === y);
    if (tile) tile.terrain = tile.terrain.filter((t) => t !== "void");
  }
  const owner = state.players.find((p) => p.id === attractor.ownerId);
  const ownerName = owner?.nickname ?? attractor.ownerId;
  return `Removed attractor at (${x}, ${y}) · ${ownerName}`;
}

export function convertOwnerAttractorsToVoid(state: GameState, ownerId: string): number {
  let count = 0;
  for (const a of getAttractors(state)) {
    if (a.ownerId !== ownerId || a.void) continue;
    a.void = true;
    const tile = state.tiles.find((t) => t.x === a.x && t.y === a.y);
    if (tile && !tile.terrain.includes("void")) {
      tile.terrain = [...tile.terrain, "void"];
    }
    count++;
  }
  return count;
}

function attractorsAffectingTile(state: GameState, x: number, y: number): AttractorTile[] {
  const hits: AttractorTile[] = [];
  for (const a of getAttractors(state)) {
    for (const t of tilesInAttractorZone(a)) {
      if (t.x === x && t.y === y) {
        hits.push(a);
        break;
      }
    }
  }
  return hits;
}

export function applyAttractorEntryPulls(
  state: GameState,
  unit: Player | { id: string; x: number; y: number; hp?: number },
  x: number,
  y: number,
  kind: "player" | "enemy",
): string[] {
  const attractors = attractorsAffectingTile(state, x, y);
  if (!attractors.length) return [];
  const messages: string[] = [];
  for (const a of attractors) {
    const msg = applyPullToward(state, unit as Player, a.x, a.y, 1, { kind });
    if (msg) messages.push(msg);
  }
  return messages;
}

export function applyAttractorEndOfTurnPulls(
  state: GameState,
  unit: Player | { id: string; x: number; y: number; hp?: number },
  kind: "player" | "enemy",
): string[] {
  const attractors = attractorsAffectingTile(state, unit.x, unit.y);
  if (!attractors.length) return [];
  const messages: string[] = [];
  for (const a of attractors) {
    const msg = applyPullToward(state, unit as Player, a.x, a.y, 1, { kind });
    if (msg) messages.push(`end-of-turn ${msg}`);
  }
  return messages;
}

export function checkSharurEmergencyDefenses(state: GameState, player: Player): string | null {
  if (player.class !== "SHARUR") return null;
  if ((player.hp ?? 0) > 10) return null;
  if (!player.counters) player.counters = {};
  if (player.counters.sharurEmergencyTriggered) return null;
  player.counters.sharurEmergencyTriggered = 1;
  const count = convertOwnerAttractorsToVoid(state, player.id);
  if (!count) return "Emergency Auto Defenses (no attractors)";
  return `Emergency Auto Defenses — ${count} attractor(s) became Void`;
}

export function grantVarunastraGearCheck(state: GameState, varunastra: Player): string[] {
  if (varunastra.class !== "VARUNASTRA") return [];
  if (!state.combat) return [];
  if (!state.combat.gearCheckGrants) state.combat.gearCheckGrants = {};
  const messages: string[] = [];
  for (const ally of state.players) {
    if (ally.id === varunastra.id) continue;
    if (!isOrthogonallyAdjacent(varunastra, ally)) continue;
    state.combat.gearCheckGrants[ally.id] = varunastra.id;
    messages.push(`Gear Check! → ${ally.nickname ?? ally.id} may free-swap`);
  }
  return messages;
}

export function playerArmorGearName(player: Player): string | undefined {
  if (player.gearArmor) return player.gearArmor;
  if (player.gear && getGearByName(player.gear)?.slot === "armor") return player.gear;
  return undefined;
}

export function playerWeaponGearName(player: Player): string | undefined {
  if (player.gear && getGearByName(player.gear)?.slot === "weapon") return player.gear;
  if (player.class === "EPEUS" && player.gear) return player.gear;
  return undefined;
}
