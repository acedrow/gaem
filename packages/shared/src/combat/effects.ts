import { getEffectStacking } from "../effects-data.js";
import type { EffectStacks, GameState, MapTile, Player, Enemy } from "../types.js";
import { isSandboxMode } from "../game.js";

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
}

const END_OF_TURN_EFFECTS = new Set([
  "Bleed",
  "Slow",
  "Blazing",
  "Pin",
  "Aegis",
  "Shock",
  "Bound",
  "Healing",
]);

export function tickUnitEndOfTurn(state: GameState, unit: Player | Enemy): string[] {
  const messages: string[] = [];
  if (isSandboxMode(state) || !unit.effects) return messages;
  for (const id of Object.keys(unit.effects)) {
    if (!END_OF_TURN_EFFECTS.has(id)) continue;
    const before = unit.effects[id] ?? 0;
    if (id === "Healing") {
      if (before > 0 && unit.hp !== undefined) {
        unit.hp += before;
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
  }
  if (Object.keys(unit.effects).length === 0) delete unit.effects;
  return messages;
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
      messages.push("Countdown triggered");
    } else {
      unit.effects.Countdown = next;
    }
    if (unit.effects && Object.keys(unit.effects).length === 0) delete unit.effects;
  }
  for (const tile of state.tiles) {
    if (!tile.tileEffects?.Countdown) continue;
    const next = tile.tileEffects.Countdown - 1;
    if (next <= 0) delete tile.tileEffects.Countdown;
    else tile.tileEffects.Countdown = next;
    if (tile.tileEffects && Object.keys(tile.tileEffects).length === 0) delete tile.tileEffects;
  }
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
  const parsed = parseEffectToken(token);
  if (!parsed) return;
  if (!tile.tileEffects) tile.tileEffects = {};
  tile.tileEffects[parsed.id] = (tile.tileEffects[parsed.id] ?? 0) + parsed.stacks;
}
