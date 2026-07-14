import { describe, expect, it } from "vitest";
import {
  agnosiaBoxTiles,
  getAgnosiaHp,
  maybeTriggerAgnosia,
} from "./agnosia.js";
import { applyDamageToEnemy } from "./attack.js";
import { createDefaultCombatState } from "./types.js";
import { tileAt } from "../map.js";
import { addTestEnemy, addTestPlayer, makeGameState } from "../test/fixtures.js";

describe("agnosia", () => {
  it("resolves agnosiaHp from listing", () => {
    expect(getAgnosiaHp({ name: "Gorgenaut" })).toBe(20);
    expect(getAgnosiaHp({ name: "RETIARIUS" })).toBe(20);
    expect(getAgnosiaHp({ name: "Stain Creep" })).toBeNull();
  });

  it("computes 5x5 box for scale 2 with offset 1", () => {
    const tiles = agnosiaBoxTiles(3, 3, 2, 5, 10, 10);
    expect(tiles).toHaveLength(25);
    expect(tiles.some((t) => t.x === 2 && t.y === 2)).toBe(true);
    expect(tiles.some((t) => t.x === 6 && t.y === 6)).toBe(true);
    expect(tiles.some((t) => t.x === 1 && t.y === 1)).toBe(false);
  });

  it("triggers once when HP crosses threshold including overkill", () => {
    const state = makeGameState({ combat: createDefaultCombatState(1) });
    const enemy = addTestEnemy(state, "g", 3, 3, { name: "Gorgenaut", scale: 2, hp: 25 });
    applyDamageToEnemy(enemy, 30, state);
    expect(enemy.hp).toBe(0);
    expect(enemy.agnosiaTriggered).toBe(true);
    expect(tileAt(state.tiles, 2, 2)?.tileEffects?.Stained).toBe(1);
    expect(tileAt(state.tiles, 6, 6)?.tileEffects?.Stained).toBe(1);

    applyDamageToEnemy(enemy, 1, state);
    expect(state.combat!.pendingActions.filter((p) => p.label.includes("Agnosia"))).toHaveLength(0);
  });

  it("does not double-trigger", () => {
    const state = makeGameState({ combat: createDefaultCombatState(1) });
    const enemy = addTestEnemy(state, "g", 3, 3, { name: "Gorgenaut", scale: 2, hp: 25 });
    enemy.agnosiaTriggered = true;
    expect(maybeTriggerAgnosia(state, enemy, 25)).toEqual([]);
    expect(tileAt(state.tiles, 2, 2)?.tileEffects?.Stained).toBeUndefined();
  });

  it("queues pending for enemies without a handler", () => {
    const state = makeGameState({ combat: createDefaultCombatState(1) });
    const enemy = addTestEnemy(state, "o", 2, 2, { name: "OROBAS", scale: 3, hp: 55 });
    applyDamageToEnemy(enemy, 10, state);
    expect(enemy.hp).toBe(45);
    expect(enemy.agnosiaTriggered).toBe(true);
    expect(state.combat!.pendingActions.some((p) => p.kind === "enemySpecial")).toBe(true);
  });

  it("gorgenaut agnosia pulls players in the box", () => {
    const state = makeGameState({ combat: createDefaultCombatState(1) });
    const enemy = addTestEnemy(state, "g", 3, 3, { name: "Gorgenaut", scale: 2, hp: 21 });
    const player = addTestPlayer(state, "p1", { x: 2, y: 2, hp: 20, class: "HARPE" });
    applyDamageToEnemy(enemy, 5, state);
    expect(enemy.agnosiaTriggered).toBe(true);
    expect(player.x).toBe(3);
    expect(player.y).toBe(2);
  });
});
