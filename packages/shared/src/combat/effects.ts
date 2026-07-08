import { getEffectStacking } from "../effects-data.js";
import type { EffectStacks, GameState, MapTile, Player, Enemy } from "../types.js";
import { buildBoardOccupancy, clampHp, getEnemyMaxHp, getPlayerMaxHp, isSandboxMode } from "../game.js";
import { coordKey, tileAt } from "../map.js";
import { clampAssistedAscensionAegis, hasAssistedAscensionGear } from "./aegis.js";
import { tickFallingStartOfTurn } from "./elevation.js";

export { tickRoundCountdowns } from "./countdown.js";

export function parseEffectToken(token: string): { id: string; stacks: number } | null {
  const match = token.trim().match(/^([A-Za-z][A-Za-z ]*):(-?\d+)$/);
  if (!match) return null;
  return { id: match[1]!.trim(), stacks: Number(match[2]) };
}

export function applyEffectStacks(
  target: { effects?: EffectStacks; counters?: Record<string, number> },
  tokens: string[],
): void {
  if (!target.effects) target.effects = {};
  for (const token of tokens) {
    const parsed = parseEffectToken(token);
    if (!parsed || parsed.stacks === 0) continue;
    if (
      parsed.id === "Blazing" &&
      parsed.stacks > 0 &&
      (target.counters?.warhookBlazingImmuneTurns ?? 0) > 0
    ) {
      continue;
    }
    const current = target.effects[parsed.id] ?? 0;
    const next =
      parsed.stacks > 0 && getEffectStacking(parsed.id) === "max"
        ? Math.max(current, parsed.stacks)
        : current + parsed.stacks;
    if (next <= 0) delete target.effects[parsed.id];
    else target.effects[parsed.id] = next;
  }
  if (Object.keys(target.effects).length === 0) delete target.effects;
  if (!("name" in target)) clampAssistedAscensionAegis(target as Player);
}

export function clearEffectStacks(target: { effects?: EffectStacks }): void {
  delete target.effects;
}

export function removeEffectStacks(target: { effects?: EffectStacks }, tokens: string[]): void {
  if (!target.effects) return;
  for (const token of tokens) {
    const parsed = parseEffectToken(token);
    if (!parsed) continue;
    const next = (target.effects[parsed.id] ?? 0) - parsed.stacks;
    if (next <= 0) delete target.effects[parsed.id];
    else target.effects[parsed.id] = next;
  }
  if (!("name" in target)) clampAssistedAscensionAegis(target as Player);
}

function dealDirectTickDamage(unit: Player | Enemy, amount: number, maxHp: number): void {
  if (amount <= 0 || unit.hp === undefined) return;
  const cap = maxHp > 0 ? maxHp : unit.hp;
  unit.hp = clampHp(unit.hp - amount, cap);
}

function adjacentUnitsWithBlazing(state: GameState, unit: Player | Enemy): boolean {
  const occ = buildBoardOccupancy(state);
  for (const [dx, dy] of [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
  ]) {
    const key = coordKey(unit.x + dx!, unit.y + dy!);
    const other = occ.playerByKey.get(key) ?? occ.enemyByKey.get(key);
    if (other && other !== unit && (other.effects?.Blazing ?? 0) > 0) return true;
  }
  return false;
}

export function tickUnitStartOfTurn(
  state: GameState,
  unit: Player | Enemy,
  kind: "player" | "enemy",
): string[] {
  const messages: string[] = [];
  if (isSandboxMode(state)) return messages;

  messages.push(...tickFallingStartOfTurn(state, unit, kind));

  const blazing = unit.effects?.Blazing ?? 0;
  if (blazing > 0) {
    const maxHp = kind === "player" ? getPlayerMaxHp(unit as Player) : getEnemyMaxHp(unit as Enemy);
    dealDirectTickDamage(unit, blazing, maxHp);
    messages.push(`Blazing ${blazing} damage at start of turn`);

    const occ = buildBoardOccupancy(state);
    for (const [dx, dy] of [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ]) {
      const nx = unit.x + dx!;
      const ny = unit.y + dy!;
      const key = coordKey(nx, ny);
      const other = occ.playerByKey.get(key) ?? occ.enemyByKey.get(key);
      if (!other || other === unit || (other.effects?.Blazing ?? 0) > 0) continue;
      applyEffectStacks(other, ["Blazing:1"]);
      const otherMax =
        "class" in other ? getPlayerMaxHp(other as Player) : getEnemyMaxHp(other as Enemy);
      dealDirectTickDamage(other, 1, otherMax);
      messages.push(`Blazing spread to adjacent unit`);
    }
  }

  if (kind === "player") {
    const player = unit as Player;
    const mapTile = tileAt(state.tiles, player.x, player.y);
    if ((mapTile?.tileEffects?.Fortified ?? 0) > 0) {
      delete mapTile!.tileEffects!.Fortified;
      if (Object.keys(mapTile!.tileEffects!).length === 0) delete mapTile!.tileEffects;
      player.reversalCharges = (player.reversalCharges ?? 0) + 2;
      messages.push("Fortified → +2 Reversal Charges");
    }
  }

  return messages;
}

const END_OF_TURN_EFFECTS = new Set([
  "Bleed",
  "Slow",
  "Pin",
  "Aegis",
  "Shock",
  "Bound",
  "Healing",
]);

export function tickUnitEndOfTurn(state: GameState, unit: Player | Enemy): string[] {
  const messages: string[] = [];
  if (isSandboxMode(state) || !unit.effects) return messages;

  const poison = unit.effects.Poison ?? 0;
  if (poison > 0) {
    const maxHp =
      "class" in unit ? getPlayerMaxHp(unit as Player) : getEnemyMaxHp(unit as Enemy);
    dealDirectTickDamage(unit, poison, maxHp);
    messages.push(`Poison ${poison} damage`);
    const nextPoison = poison - 1;
    if (nextPoison <= 0) delete unit.effects.Poison;
    else unit.effects.Poison = nextPoison;
  }

  const blazing = unit.effects.Blazing ?? 0;
  if (blazing > 0 && !adjacentUnitsWithBlazing(state, unit)) {
    const next = blazing - 1;
    if (next <= 0) delete unit.effects.Blazing;
    else unit.effects.Blazing = next;
    messages.push(`Blazing ${blazing} → ${next > 0 ? next : "removed"}`);
  }

  for (const id of Object.keys(unit.effects)) {
    if (!END_OF_TURN_EFFECTS.has(id)) continue;
    const before = unit.effects[id] ?? 0;
    if (id === "Aegis" && !("name" in unit) && hasAssistedAscensionGear(unit as Player) && before <= 1) {
      continue;
    }
    if (id === "Healing") {
      if (before > 0 && unit.hp !== undefined) {
        const maxHp =
          "class" in unit ? getPlayerMaxHp(unit as Player) : getEnemyMaxHp(unit as Enemy);
        unit.hp = clampHp(unit.hp + before, maxHp);
        messages.push(`Healing restored ${before} HP`);
      }
    }
    const next = before - 1;
    if (next <= 0) {
      delete unit.effects[id];
      if (before > 0) messages.push(`${id} ${before} → removed`);
    } else {
      unit.effects[id] = next;
      if (before !== next) messages.push(`${id} ${before} → ${next}`);
    }
    if (id === "Aegis" && !("name" in unit)) clampAssistedAscensionAegis(unit as Player);
  }
  if (Object.keys(unit.effects).length === 0) delete unit.effects;
  return messages;
}

export function applyBleedBonus(damage: number, effects?: EffectStacks): number {
  const bleed = effects?.Bleed ?? 0;
  return damage + bleed;
}

export function movementCostMultiplier(effects?: EffectStacks): number {
  return (effects?.Slow ?? 0) > 0 ? 2 : 1;
}

export function setTileEffect(tile: MapTile, token: string): void {
  applyTileEffectStacks(tile, [token]);
}

export function applyTileEffectStacks(tile: MapTile, tokens: string[]): void {
  for (const token of tokens) {
    const parsed = parseEffectToken(token);
    if (!parsed || parsed.stacks === 0) continue;
    if (!tile.tileEffects) tile.tileEffects = {};
    const current = tile.tileEffects[parsed.id] ?? 0;
    const next =
      parsed.stacks > 0 && getEffectStacking(parsed.id) === "max"
        ? Math.max(current, parsed.stacks)
        : current + parsed.stacks;
    if (next <= 0) delete tile.tileEffects[parsed.id];
    else tile.tileEffects[parsed.id] = next;
  }
  if (tile.tileEffects && Object.keys(tile.tileEffects).length === 0) delete tile.tileEffects;
}

export function clearTileEffects(tile: MapTile): void {
  delete tile.tileEffects;
}

export function replaceTileEffects(tile: MapTile, tokens: string[]): void {
  if (tokens.length === 0) {
    delete tile.tileEffects;
    return;
  }
  tile.tileEffects = {};
  applyTileEffectStacks(tile, tokens);
}

export function hasTileEffects(tile: MapTile | undefined): boolean {
  if (!tile?.tileEffects) return false;
  return Object.values(tile.tileEffects).some((stacks) => stacks > 0);
}
