import { describe, expect, it } from "vitest";
import {
  buildSwarmGroups,
  getEffectiveEnemyHp,
  getSwarmMaxHp,
  reconcileSwarmHp,
} from "./swarm.js";
import { addEnemy } from "../game.js";
import { addTestEnemy, makeGameState } from "../test/fixtures.js";

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
});
