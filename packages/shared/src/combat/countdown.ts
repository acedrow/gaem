import type { GameState, MapTile, Player, Enemy } from "../types.js";
import { enemyLabel, playerLabel } from "../console.js";
import {
  addEnemy,
  buildBoardOccupancy,
  clampHp,
  getEnemyMaxHp,
  getPlayerMaxHp,
  isSandboxMode,
} from "../game.js";
import { coordKey } from "../map.js";
import { fixedPatternTilesInBounds } from "../patterns.js";
import { addPendingAction, createPendingAction } from "./pending.js";

export type CountdownContext = {
  state: GameState;
  unit?: Player | Enemy;
  tile?: MapTile;
  kind?: string;
};

type CountdownHandler = (ctx: CountdownContext) => string[];

const handlers = new Map<string, CountdownHandler>();

export function registerCountdownHandler(kind: string, handler: CountdownHandler): void {
  handlers.set(kind, handler);
}

function burstDamageAt(
  state: GameState,
  center: { x: number; y: number },
  damage: number,
  size: number,
): string[] {
  const tiles = fixedPatternTilesInBounds("burst", center, size, "n", state.width, state.height);
  const occ = buildBoardOccupancy(state);
  const messages: string[] = [];
  const hitPlayers = new Set<string>();
  const hitEnemies = new Set<string>();
  for (const tile of tiles) {
    const player = occ.playerByKey.get(coordKey(tile.x, tile.y));
    if (player && !hitPlayers.has(player.id)) {
      hitPlayers.add(player.id);
      const maxHp = getPlayerMaxHp(player);
      const before = player.hp ?? maxHp;
      player.hp = clampHp(before - damage, maxHp);
      messages.push(`${playerLabel(player)} ${damage}`);
    }
    const enemies = occ.enemiesByKey.get(coordKey(tile.x, tile.y)) ?? [];
    for (const enemy of enemies) {
      if (hitEnemies.has(enemy.id)) continue;
      hitEnemies.add(enemy.id);
      const maxHp = getEnemyMaxHp(enemy);
      const before = enemy.hp ?? maxHp;
      enemy.hp = clampHp(before - damage, maxHp);
      messages.push(`${enemyLabel(enemy)} ${damage}`);
    }
  }
  return messages;
}

registerCountdownHandler("chazaor_agnosia", ({ state, unit }) => {
  if (!unit || !("name" in unit)) return ["Countdown: missing enemy"];
  const enemy = unit as Enemy;
  enemy.hp = 0;
  const msgs = burstDamageAt(state, enemy, 5, 2);
  return [`${enemyLabel(enemy)} agnosia expired`, ...msgs];
});

registerCountdownHandler("flowerbud", ({ state, unit }) => {
  if (!unit || !("name" in unit)) return ["Countdown: missing unit"];
  const enemy = unit as Enemy;
  const { x, y } = enemy;
  const idx = state.enemies.findIndex((e) => e.id === enemy.id);
  if (idx >= 0) state.enemies.splice(idx, 1);
  const id = `stain-flower-${x}-${y}-${Date.now()}`;
  const err = addEnemy(state, {
    id,
    name: "Stain Flower",
    x,
    y,
    scale: 1,
  });
  if (err) return [`Flowerbud bloom failed: ${err}`];
  return [`Flowerbud bloomed into Stain Flower at (${x}, ${y})`];
});

export function inferCountdownKind(unit: Player | Enemy): string | undefined {
  if ("class" in unit) return undefined;
  const name = (unit as Enemy).name?.toUpperCase() ?? "";
  if (name.includes("CHALAZAOR")) return "chazaor_agnosia";
  if (name.includes("FLOWERBUD")) return "flowerbud";
  return undefined;
}

export function setCountdownKind(state: GameState, unitId: string, kind: string): void {
  if (!state.combat) return;
  if (!state.combat.countdownKinds) state.combat.countdownKinds = {};
  state.combat.countdownKinds[unitId] = kind;
}

export function getCountdownKind(state: GameState, unitId: string): string | undefined {
  return state.combat?.countdownKinds?.[unitId];
}

export function resolveCountdownExpiry(ctx: CountdownContext): string[] {
  const unitId = ctx.unit?.id;
  const kind =
    ctx.kind ??
    (unitId && ctx.state.combat ? getCountdownKind(ctx.state, unitId) : undefined) ??
    (ctx.unit ? inferCountdownKind(ctx.unit) : undefined);
  if (kind && handlers.has(kind)) {
    const result = handlers.get(kind)!(ctx);
    if (unitId && ctx.state.combat?.countdownKinds) {
      delete ctx.state.combat.countdownKinds[unitId];
    }
    return result;
  }
  const label = ctx.unit
    ? "name" in ctx.unit
      ? enemyLabel(ctx.unit as Enemy)
      : playerLabel(ctx.unit as Player)
    : ctx.tile
      ? `tile (${ctx.tile.x}, ${ctx.tile.y})`
      : "unknown";
  addPendingAction(
    ctx.state,
    createPendingAction("enemySpecial", "Countdown expired", {
      detail: `${label} — resolve countdown effect`,
    }),
  );
  return [`Countdown expired (${label}) — pending GM`];
}

export function trackCountdownKinds(state: GameState, unit: Player | Enemy, tokens: string[]): void {
  if (!tokens.some((t) => t.startsWith("Countdown:"))) return;
  const kind = inferCountdownKind(unit);
  if (kind) setCountdownKind(state, unit.id, kind);
}

export function tickRoundCountdowns(state: GameState): string[] {
  const messages: string[] = [];
  if (isSandboxMode(state)) return messages;
  const units: Array<Player | Enemy> = [...state.players, ...state.enemies];
  for (const unit of units) {
    if (!unit.effects?.Countdown) continue;
    const next = unit.effects.Countdown - 1;
    if (next <= 0) {
      delete unit.effects.Countdown;
      messages.push(...resolveCountdownExpiry({ state, unit }));
    } else {
      unit.effects.Countdown = next;
    }
    if (unit.effects && Object.keys(unit.effects).length === 0) delete unit.effects;
  }
  for (const tile of state.tiles) {
    if (!tile.tileEffects?.Countdown) continue;
    const next = tile.tileEffects.Countdown - 1;
    if (next <= 0) {
      delete tile.tileEffects.Countdown;
      messages.push(...resolveCountdownExpiry({ state, tile }));
    } else {
      tile.tileEffects.Countdown = next;
    }
    if (tile.tileEffects && Object.keys(tile.tileEffects).length === 0) delete tile.tileEffects;
  }
  return messages;
}
