import type { EffectStacks, GameState, MapTile, Player, Enemy } from "../types.js";

export function parseEffectToken(token: string): { id: string; stacks: number } | null {
  const match = token.trim().match(/^([A-Za-z][A-Za-z ]*):(\d+)$/);
  if (!match) return null;
  return { id: match[1]!.trim(), stacks: Number(match[2]) };
}

export function applyEffectStacks(target: { effects?: EffectStacks }, tokens: string[]): void {
  if (!target.effects) target.effects = {};
  for (const token of tokens) {
    const parsed = parseEffectToken(token);
    if (!parsed) continue;
    target.effects[parsed.id] = (target.effects[parsed.id] ?? 0) + parsed.stacks;
  }
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

export function tickUnitEndOfTurn(unit: Player | Enemy): string[] {
  const messages: string[] = [];
  if (!unit.effects) return messages;
  for (const id of Object.keys(unit.effects)) {
    if (!END_OF_TURN_EFFECTS.has(id)) continue;
    if (id === "Healing") {
      const stacks = unit.effects[id] ?? 0;
      if (stacks > 0 && unit.hp !== undefined) {
        unit.hp += stacks;
        messages.push(`Healing:${stacks}`);
      }
    }
    const next = (unit.effects[id] ?? 0) - 1;
    if (next <= 0) delete unit.effects[id];
    else unit.effects[id] = next;
  }
  if (Object.keys(unit.effects).length === 0) delete unit.effects;
  return messages;
}

export function tickRoundCountdowns(state: GameState): string[] {
  const messages: string[] = [];
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
