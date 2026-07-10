import { describe, expect, it } from "vitest";

import {
  applyFactionCampaignAction,
  ensureFactionStates,
  validateFactionCampaignAction,
} from "./faction-campaign.js";
import { makeGameState } from "./test/fixtures.js";

describe("faction campaign defeated", () => {
  it("defaults defeated to false", () => {
    const state = makeGameState();
    const factions = ensureFactionStates(state);
    expect(factions.syncrasis.defeated).toBe(false);
    expect(factions.autophyes.defeated).toBe(false);
    expect(factions.paracletus.defeated).toBe(false);
  });

  it("preserves defeated true through ensureFactionStates", () => {
    const state = makeGameState();
    ensureFactionStates(state);
    state.factionStates!.autophyes.defeated = true;
    state.factionStates!.autophyes.crown = 3;
    state.factionStates!.autophyes.force = 2;
    const next = ensureFactionStates(state);
    expect(next.autophyes.defeated).toBe(true);
    expect(next.autophyes.crown).toBe(0);
    expect(next.autophyes.force).toBe(0);
    expect(next.autophyes.subterfuge).toBe(0);
    expect(next.autophyes.territory).toBe(0);
    expect(next.autophyes.assets).toBe(0);
  });

  it("toggles defeated via setDefeated and zeroes stats", () => {
    const state = makeGameState();
    ensureFactionStates(state);
    const before = state.factionStates!.paracletus;
    expect(before.crown).toBeGreaterThan(0);

    expect(
      validateFactionCampaignAction(state, {
        kind: "setDefeated",
        factionId: "paracletus",
        defeated: true,
      }),
    ).toBeNull();

    expect(
      applyFactionCampaignAction(state, {
        kind: "setDefeated",
        factionId: "paracletus",
        defeated: true,
      }),
    ).toBe("PARACLETUS marked defeated");
    expect(state.factionStates!.paracletus).toMatchObject({
      defeated: true,
      crown: 0,
      force: 0,
      subterfuge: 0,
      territory: 0,
      assets: 0,
    });

    expect(
      validateFactionCampaignAction(state, {
        kind: "adjustCrown",
        factionId: "paracletus",
        delta: 1,
      }),
    ).toBe("Faction is defeated");

    expect(
      applyFactionCampaignAction(state, {
        kind: "setDefeated",
        factionId: "paracletus",
        defeated: false,
      }),
    ).toBe("PARACLETUS no longer defeated");
    expect(state.factionStates!.paracletus.defeated).toBe(false);
  });
});
