import { describe, expect, it } from "vitest";

import { makeGameState, addTestPlayer, addTestEnemy } from "./test/fixtures.js";
import {
  applyChrysAorActive,
  applyKushielPushRecoil,
  applyWeaponActiveStructured,
  resolveAttackUseBreaker,
} from "./combat/loadout-combat.js";
import { applyGearPassivesOnLoadout, ASSISTED_ASCENSION_GEAR } from "./combat/gear.js";

describe("loadout-combat", () => {
  it("resolveAttackUseBreaker detects Breaker passive", () => {
    const state = makeGameState();
    const player = addTestPlayer(state, "p1", { weapon: "She Speaks The Language Of Kings" });
    expect(resolveAttackUseBreaker(player, player.weapon)).toBe(true);
  });

  it("Heaven Burning Unfolding increments level", () => {
    const state = makeGameState();
    const player = addTestPlayer(state, "p1", { weapon: "Heaven Burning Sword" });
    const msg = applyWeaponActiveStructured(state, player, { action: "weaponActive" });
    expect(msg).toMatch(/Level 2/);
    expect(player.counters?.heavenBurningLevel).toBe(2);
  });

  it("CHRYSAOR active applies Brand", () => {
    const state = makeGameState();
    addTestEnemy(state, "e1", 3, 2, { name: "Test", hp: 5 });
    const player = addTestPlayer(state, "p1", { class: "CHRYSAOR", x: 2, y: 2 });
    const msg = applyChrysAorActive(state, player, {
      action: "classActive",
      targetEnemyIds: ["e1"],
    });
    expect(msg).toMatch(/Brand/);
    expect(state.enemies[0]!.effects?.Brand).toBe(2);
  });

  it("KUSHIEL push_recoil moves target", () => {
    const state = makeGameState();
    const player = addTestPlayer(state, "p1", { x: 2, y: 2, armor: "KUSHIEL" });
    addTestEnemy(state, "e1", 3, 2, { name: "Test", hp: 5 });
    const msg = applyKushielPushRecoil(state, player, "e1", undefined, 1);
    expect(msg).toMatch(/Push:1/);
    expect(state.enemies[0]!.x).toBe(4);
  });
});

describe("gear passives", () => {
  it("Assisted Ascension grants Aegis floor", () => {
    const state = makeGameState();
    const player = addTestPlayer(state, "p1", { gearArmor: ASSISTED_ASCENSION_GEAR });
    applyGearPassivesOnLoadout(player);
    expect(player.effects?.Aegis).toBe(1);
  });
});
