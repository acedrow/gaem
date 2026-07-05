import { describe, expect, it } from "vitest";
import {
  applySwarmMemberMove,
  buildSwarmGroups,
  getEffectiveEnemyHp,
  getSwarmMaxHp,
  getSwarmMemberHp,
  reconcileSwarmHp,
  swarmChipEligibleTargets,
  validateSwarmMemberMove,
  markSwarmChipResolved,
  requireSwarmChipResolved,
} from "./swarm.js";
import {
  applyBreakerAttackToSwarm,
  previewSwarmEnemyAttack,
  SETHIAN_DAMAGE_CAP,
} from "./attack.js";
import { addEnemy, getEnemyMaxHp } from "../game.js";
import { createDefaultCombatState } from "../combat/types.js";
import { addTestEnemy, addTestPlayer, makeGameState } from "../test/fixtures.js";

const SWARM_NAME = "Scorned Eyes";

describe("swarm", () => {
  it("buildSwarmGroups groups adjacent same-name swarm enemies", () => {
    const state = makeGameState();
    addTestEnemy(state, "a", 2, 2, { name: SWARM_NAME });
    addTestEnemy(state, "b", 3, 2, { name: SWARM_NAME });
    addTestEnemy(state, "c", 5, 5, { name: SWARM_NAME });

    const groups = buildSwarmGroups(state);
    expect(groups.size).toBe(1);
    expect([...groups.values()][0]!.sort()).toEqual(["a", "b"]);
  });

  it("getSwarmMaxHp and getEffectiveEnemyHp", () => {
    expect(getSwarmMaxHp(1)).toBe(10);
    expect(getSwarmMaxHp(3)).toBe(30);
    expect(getSwarmMemberHp(78, 8)).toBe(9);

    const state = makeGameState();
    addTestEnemy(state, "a", 2, 2, { name: SWARM_NAME, hp: 20 });
    addTestEnemy(state, "b", 3, 2, { name: SWARM_NAME, hp: 20 });
    const member = state.enemies[0]!;
    expect(getEffectiveEnemyHp(member, state)).toBe(20);
  });

  it("reconcileSwarmHp pools HP when enemies merge", () => {
    const state = makeGameState();
    addEnemy(state, { id: "a", x: 2, y: 2, name: SWARM_NAME, hp: 1 });
    addEnemy(state, { id: "b", x: 3, y: 2, name: SWARM_NAME, hp: 1 });

    const groups = buildSwarmGroups(state);
    expect(groups.size).toBe(1);
    const hp = state.enemies[0]!.hp;
    expect(hp).toBeGreaterThan(0);
    expect(state.enemies[0]!.hp).toBe(state.enemies[1]!.hp);
  });

  it("reconcileSwarmHp splits HP when swarm separates", () => {
    const state = makeGameState();
    addEnemy(state, { id: "a", x: 2, y: 2, name: SWARM_NAME, hp: 1 });
    addEnemy(state, { id: "b", x: 3, y: 2, name: SWARM_NAME, hp: 1 });
    const prevGroups = buildSwarmGroups(state);
    const pooledHp = state.enemies[0]!.hp!;

    state.enemies.find((e) => e.id === "b")!.x = 5;
    reconcileSwarmHp(state, prevGroups);

    expect(buildSwarmGroups(state).size).toBe(0);
    const soloA = state.enemies.find((e) => e.id === "a")!;
    const soloB = state.enemies.find((e) => e.id === "b")!;
    expect(soloA.hp).toBeLessThanOrEqual(10);
    expect(soloB.hp).toBeLessThanOrEqual(10);
    expect((soloA.hp ?? 0) + (soloB.hp ?? 0)).toBeGreaterThanOrEqual(pooledHp - 1);
  });

  it("swarmChipEligibleTargets finds adjacent units", () => {
    const state = makeGameState();
    addTestEnemy(state, "a", 2, 2, { name: SWARM_NAME });
    addTestEnemy(state, "b", 3, 2, { name: SWARM_NAME });
    addTestPlayer(state, "p1", 2, 3);
    reconcileSwarmHp(state);

    const targets = swarmChipEligibleTargets(state, "a");
    expect(targets.some((t) => t.kind === "player" && t.id === "p1")).toBe(true);
  });

  it("requireSwarmChipResolved skips swarms with no adjacent chip targets", () => {
    const state = makeGameState();
    addTestEnemy(state, "a", 2, 2, { name: SWARM_NAME });
    addTestEnemy(state, "b", 3, 2, { name: SWARM_NAME });
    reconcileSwarmHp(state);
    state.roundPhase = "gmTurn";
    state.turn = { role: "gm" };
    state.combat = createDefaultCombatState(0);

    expect(swarmChipEligibleTargets(state, "a")).toEqual([]);
    expect(requireSwarmChipResolved(state, "a")).toBeNull();
  });

  it("applyBreakerAttackToSwarm breaks squares when damage is sufficient", () => {
    const state = makeGameState();
    addEnemy(state, { id: "a", x: 2, y: 2, name: SWARM_NAME, hp: 1 });
    addEnemy(state, { id: "b", x: 3, y: 2, name: SWARM_NAME, hp: 1 });
    reconcileSwarmHp(state);

    const { brokenIds } = applyBreakerAttackToSwarm(state, [{ x: 2, y: 2 }], 10);
    expect(brokenIds).toContain("a");
    expect(state.enemies.find((e) => e.id === "a")?.hp).toBe(0);
    expect(state.enemies.find((e) => e.id === "b")).toBeDefined();
  });

  it("previewSwarmEnemyAttack counts adjacent strikes", () => {
    const state = makeGameState();
    addTestEnemy(state, "a", 2, 2, { name: SWARM_NAME });
    addTestEnemy(state, "b", 3, 2, { name: SWARM_NAME });
    addTestEnemy(state, "c", 2, 3, { name: SWARM_NAME });
    addTestPlayer(state, "p1", 3, 3);
    reconcileSwarmHp(state);

    const preview = previewSwarmEnemyAttack(
      state,
      "a",
      { raw: "", damage: 2, range: 1 },
      "p1",
      {},
    );
    expect(preview.strikeCount).toBe(2);
    expect(preview.totalDamage).toBe(7);
  });

  it("SETHIAN_DAMAGE_CAP is 132", () => {
    expect(SETHIAN_DAMAGE_CAP).toBe(132);
  });

  it("validateSwarmMemberMove allows rearrange and break-away moves", () => {
    const state = makeGameState();
    addTestEnemy(state, "a", 2, 2, { name: SWARM_NAME });
    addTestEnemy(state, "b", 3, 2, { name: SWARM_NAME });
    addTestEnemy(state, "c", 4, 2, { name: SWARM_NAME });
    reconcileSwarmHp(state);
    state.roundPhase = "gmTurn";
    state.turn = { role: "gm" };
    state.combat = createDefaultCombatState(0);
    markSwarmChipResolved(state, "a");

    expect(validateSwarmMemberMove(state, "a", 2, 1)).toBeNull();
    applySwarmMemberMove(state, "a", 2, 1);
    const soloA = state.enemies.find((e) => e.id === "a")!;
    expect(soloA.hp).toBe(getEnemyMaxHp(soloA));
    expect(state.enemies.find((e) => e.id === "b")!.hp).toBe(20);
    const groups = buildSwarmGroups(state);
    expect(groups.size).toBe(1);
    expect([...groups.values()][0]!.sort()).toEqual(["b", "c"]);
  });
});
