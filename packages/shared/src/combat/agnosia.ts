import type { Enemy, GameState } from "../types.js";
import { enemyLabel } from "../console.js";
import { getEnemyListingByName, getEnemyScale } from "../enemy-data.js";
import { buildBoardOccupancy, isSandboxMode } from "../game.js";
import { coordKey, isInBounds, tileAt } from "../map.js";
import { STAIN_GEYSER_OVERLAY_GROUP_KEY } from "./stain-geyser.js";
import { setTileEffect } from "./effects.js";
import { applyPullToward } from "./pull.js";
import { swarmGroupForEnemy } from "./swarm.js";
import { applyChalazaorAgnosia } from "./chalazaor.js";

export type AgnosiaHandler = (state: GameState, enemy: Enemy) => string[];

const handlers = new Map<string, AgnosiaHandler>();

export const GORGENAUT_AGNOSIA_BOX = 5;
const STAIN_OVERLAY_MEMBER_COUNT = 16;

export function registerAgnosiaHandler(listingName: string, handler: AgnosiaHandler): void {
  handlers.set(listingName.trim().toLowerCase(), handler);
}

export function getAgnosiaHp(enemy: Pick<Enemy, "name">): number | null {
  const listing = getEnemyListingByName(enemy.name);
  if (listing?.agnosiaHp == null) return null;
  return listing.agnosiaHp;
}

export function isGorgenautEnemy(enemy: Pick<Enemy, "name">): boolean {
  const listing = getEnemyListingByName(enemy.name);
  return listing?.name.trim().toLowerCase() === "gorgenaut";
}

export function agnosiaBoxTiles(
  anchorX: number,
  anchorY: number,
  scale: number,
  boxSize: number,
  width: number,
  height: number,
): { x: number; y: number }[] {
  const offset = Math.floor((boxSize - scale) / 2);
  return agnosiaPlacementBoxTiles(
    anchorX,
    anchorY,
    scale,
    anchorX - offset,
    anchorY - offset,
    boxSize,
    width,
    height,
  );
}

export function agnosiaCenteredHover(
  anchorX: number,
  anchorY: number,
  scale: number,
  boxSize: number,
): { x: number; y: number } {
  const offset = Math.floor((boxSize - scale) / 2);
  return { x: anchorX - offset, y: anchorY - offset };
}

// NxN containing the full enemy footprint; hover is desired top-left (clamped to valid alignments).
export function agnosiaPlacementBoxTiles(
  anchorX: number,
  anchorY: number,
  scale: number,
  hoverX: number,
  hoverY: number,
  boxSize: number,
  width: number,
  height: number,
): { x: number; y: number }[] {
  if (boxSize < 1 || scale < 1) return [];

  const maxOffset = Math.max(0, boxSize - scale);
  const tlx = Math.max(anchorX - maxOffset, Math.min(anchorX, hoverX));
  const tly = Math.max(anchorY - maxOffset, Math.min(anchorY, hoverY));

  const tiles: { x: number; y: number }[] = [];
  for (let dy = 0; dy < boxSize; dy++) {
    for (let dx = 0; dx < boxSize; dx++) {
      const x = tlx + dx;
      const y = tly + dy;
      if (isInBounds(x, y, width, height)) tiles.push({ x, y });
    }
  }
  return tiles;
}

function stainOverlayKeyForTile(x: number, y: number): string {
  const n = 1 + ((x * 17 + y * 31) % STAIN_OVERLAY_MEMBER_COUNT);
  return `${STAIN_GEYSER_OVERLAY_GROUP_KEY}/${n}.png`;
}

function markAgnosiaTriggered(state: GameState, enemy: Enemy): void {
  const group = swarmGroupForEnemy(state, enemy.id);
  if (group) {
    for (const id of group.memberIds) {
      const member = state.enemies.find((e) => e.id === id);
      if (member) member.agnosiaTriggered = true;
    }
    return;
  }
  enemy.agnosiaTriggered = true;
}

function queueAgnosiaPending(state: GameState, enemy: Enemy, detail: string): void {
  if (!state.combat) return;
  state.combat.pendingActions.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    kind: "enemySpecial",
    label: `${enemyLabel(enemy)} Agnosia`,
    detail,
    actorEnemyId: enemy.id,
    createdAt: Date.now(),
  });
}

export function findGorgenautAgnosiaPending(state: GameState, enemyId: string) {
  return (
    state.combat?.pendingActions.find(
      (p) => p.kind === "enemySpecial" && p.actorEnemyId === enemyId && p.label.includes("Agnosia"),
    ) ?? null
  );
}

function pushSideEffectMessages(state: GameState, messages: string[]): void {
  if (!messages.length || !state.combat) return;
  if (!state.combat.sideEffectMessages) state.combat.sideEffectMessages = [];
  state.combat.sideEffectMessages.push(...messages);
}

export function takeCombatSideEffectMessages(state: GameState): string[] {
  if (!state.combat?.sideEffectMessages?.length) return [];
  const msgs = state.combat.sideEffectMessages;
  state.combat.sideEffectMessages = [];
  return msgs;
}

export function appendCombatSideEffectMessages(state: GameState, message: string): string {
  const extra = takeCombatSideEffectMessages(state);
  if (!extra.length) return message;
  return `${message}. ${extra.join("; ")}`;
}

export function maybeTriggerAgnosia(state: GameState, enemy: Enemy, hpBefore: number): string[] {
  if (isSandboxMode(state)) return [];
  const threshold = getAgnosiaHp(enemy);
  if (threshold == null) return [];
  if (enemy.agnosiaTriggered) return [];
  const hpAfter = enemy.hp ?? 0;
  if (!(hpBefore > threshold && hpAfter <= threshold)) return [];

  markAgnosiaTriggered(state, enemy);
  const listing = getEnemyListingByName(enemy.name);
  const key = listing?.name.trim().toLowerCase() ?? "";
  const handler = handlers.get(key);
  if (handler) {
    const msgs = handler(state, enemy);
    pushSideEffectMessages(state, msgs);
    return msgs;
  }

  const detail = listing?.agnosia?.trim() || "Resolve Agnosia effect";
  queueAgnosiaPending(state, enemy, detail);
  const msg = `${enemyLabel(enemy)} entered Agnosia (pending GM)`;
  pushSideEffectMessages(state, [msg]);
  return [msg];
}

export function applyGorgenautAgnosia(
  state: GameState,
  enemy: Enemy,
  hoverX: number,
  hoverY: number,
): { message: string; coords: { x: number; y: number }[] } {
  const scale = getEnemyScale(enemy);
  const tiles = agnosiaPlacementBoxTiles(
    enemy.x,
    enemy.y,
    scale,
    hoverX,
    hoverY,
    GORGENAUT_AGNOSIA_BOX,
    state.width,
    state.height,
  );
  let stained = 0;
  for (const t of tiles) {
    const mapTile = tileAt(state.tiles, t.x, t.y);
    if (!mapTile) continue;
    setTileEffect(mapTile, "Stained:1");
    mapTile.overlayKey = stainOverlayKeyForTile(t.x, t.y);
    stained++;
  }

  const boxKeys = new Set(tiles.map((t) => coordKey(t.x, t.y)));
  const occ = buildBoardOccupancy(state);
  const messages: string[] = [`${enemyLabel(enemy)} Agnosia: stained ${stained} tiles`];
  const pulled = new Set<string>();
  for (const key of boxKeys) {
    const player = occ.playerByKey.get(key);
    if (!player || pulled.has(player.id)) continue;
    if ((player.hp ?? 0) <= 0) continue;
    pulled.add(player.id);
    const pullMsg = applyPullToward(state, player, enemy.x, enemy.y, 1, { kind: "player" });
    if (pullMsg) messages.push(pullMsg);
  }

  const pending = findGorgenautAgnosiaPending(state, enemy.id);
  if (pending && state.combat) {
    state.combat.pendingActions = state.combat.pendingActions.filter((p) => p.id !== pending.id);
  }

  return { message: messages.join("; "), coords: tiles };
}

export function validateConfirmGorgenautAgnosia(
  state: GameState,
  enemyId: string,
  hoverX: number,
  hoverY: number,
): string | null {
  if (!Number.isInteger(hoverX) || !Number.isInteger(hoverY)) return "Invalid hover coordinates";
  if (!isInBounds(hoverX, hoverY, state.width, state.height)) return "Hover out of bounds";
  const enemy = state.enemies.find((e) => e.id === enemyId);
  if (!enemy) return "Enemy not found";
  if (!isGorgenautEnemy(enemy)) return "Not a Gorgenaut";
  if (!findGorgenautAgnosiaPending(state, enemyId)) return "No pending Gorgenaut Agnosia";
  return null;
}

registerAgnosiaHandler("soaring bombardier", (state, enemy) => applyChalazaorAgnosia(state, enemy));
