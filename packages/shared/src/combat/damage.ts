export function rollDice(count: number, sides: number, rng = Math.random): number[] {
  const rolls: number[] = [];
  for (let i = 0; i < count; i++) {
    rolls.push(Math.floor(rng() * sides) + 1);
  }
  return rolls;
}

export function parseAndRollDamage(spec: string, rng = Math.random): { total: number; detail: string } {
  const trimmed = spec.trim();
  const match = trimmed.match(/^(\d+)(?:\+(\d+)D(\d+))?$/i);
  if (!match) {
    const fixed = Number(trimmed);
    if (Number.isFinite(fixed)) {
      return { total: fixed, detail: String(fixed) };
    }
    return { total: 0, detail: spec };
  }
  const base = Number(match[1]);
  if (!match[2]) {
    return { total: base, detail: String(base) };
  }
  const count = Number(match[2]);
  const sides = Number(match[3]);
  const rolls = rollDice(count, sides, rng);
  const rollSum = rolls.reduce((a, b) => a + b, 0);
  const total = base + rollSum;
  const detail = `${base}+${rolls.map((r) => `[${r}]`).join("")}=${total}`;
  return { total, detail };
}

export function maxWeaponDamage(spec: string): number {
  const trimmed = spec.trim();
  const match = trimmed.match(/^(\d+)(?:\+(\d+)D(\d+))?$/i);
  if (!match) {
    const fixed = Number(trimmed);
    return Number.isFinite(fixed) ? fixed : 0;
  }
  const base = Number(match[1]);
  if (!match[2]) return base;
  const count = Number(match[2]);
  const sides = Number(match[3]);
  return base + count * sides;
}
