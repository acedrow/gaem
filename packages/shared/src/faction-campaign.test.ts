import { describe, expect, it } from "vitest";

import { getEnemyListingByName } from "./enemy-data.js";
import {
  applyFactionCampaignAction,
  ensureFactionStates,
  ensureGmIchor,
  isEnemyCrownGated,
  isEnemyUpgradeLocked,
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
      unlockedUpgrades: [],
      unlockedUniqueLocations: [],
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

  it("clears unlocks when faction is defeated", () => {
    const state = makeGameState();
    ensureFactionStates(state);
    ensureGmIchor(state);
    state.gmIchor = 5;
    applyFactionCampaignAction(state, {
      kind: "unlockUpgrade",
      factionId: "paracletus",
      upgradeName: "Living Tide",
    });
    applyFactionCampaignAction(state, {
      kind: "unlockUniqueLocation",
      factionId: "paracletus",
      locationName: "The Teethlands",
    });
    applyFactionCampaignAction(state, {
      kind: "setDefeated",
      factionId: "paracletus",
      defeated: true,
    });
    expect(state.factionStates!.paracletus.unlockedUpgrades).toEqual([]);
    expect(state.factionStates!.paracletus.unlockedUniqueLocations).toEqual([]);
  });
});

describe("faction campaign ichor and unlocks", () => {
  it("adjusts gm ichor", () => {
    const state = makeGameState();
    expect(ensureGmIchor(state)).toBe(0);
    expect(validateFactionCampaignAction(state, { kind: "adjustIchor", delta: 3 })).toBeNull();
    expect(applyFactionCampaignAction(state, { kind: "adjustIchor", delta: 3 })).toBe(
      "Ichor +3 → 3",
    );
    expect(state.gmIchor).toBe(3);
    expect(validateFactionCampaignAction(state, { kind: "adjustIchor", delta: -4 })).toBe(
      "Ichor cannot go below 0",
    );
  });

  it("unlocks upgrades by spending ichor and refunds on lock", () => {
    const state = makeGameState();
    ensureFactionStates(state);
    ensureGmIchor(state);
    state.gmIchor = 2;

    expect(
      validateFactionCampaignAction(state, {
        kind: "unlockUpgrade",
        factionId: "paracletus",
        upgradeName: "Extrarterran Evolution",
      }),
    ).toBe("Insufficient ichor");

    state.gmIchor = 5;
    expect(
      validateFactionCampaignAction(state, {
        kind: "unlockUpgrade",
        factionId: "paracletus",
        upgradeName: "Extrarterran Evolution",
      }),
    ).toBeNull();
    applyFactionCampaignAction(state, {
      kind: "unlockUpgrade",
      factionId: "paracletus",
      upgradeName: "Extrarterran Evolution",
    });
    expect(state.gmIchor).toBe(2);
    expect(state.factionStates!.paracletus.unlockedUpgrades).toEqual([
      "Extrarterran Evolution",
    ]);

    applyFactionCampaignAction(state, {
      kind: "lockUpgrade",
      factionId: "paracletus",
      upgradeName: "Extrarterran Evolution",
    });
    expect(state.gmIchor).toBe(5);
    expect(state.factionStates!.paracletus.unlockedUpgrades).toEqual([]);
  });

  it("unlocks unique locations without spending ichor", () => {
    const state = makeGameState();
    ensureFactionStates(state);
    ensureGmIchor(state);
    state.gmIchor = 4;

    expect(
      validateFactionCampaignAction(state, {
        kind: "unlockUniqueLocation",
        factionId: "paracletus",
        locationName: "Brightwater Runs",
      }),
    ).toBeNull();
    applyFactionCampaignAction(state, {
      kind: "unlockUniqueLocation",
      factionId: "paracletus",
      locationName: "Brightwater Runs",
    });
    expect(state.gmIchor).toBe(4);
    expect(state.factionStates!.paracletus.unlockedUniqueLocations).toEqual([
      "Brightwater Runs",
    ]);
  });

  it("gates enemy upgrade and crown helpers", () => {
    const potagon = getEnemyListingByName("POTAGON")!;
    const bombardier = getEnemyListingByName("CHALAZAOR")!;
    const orobas = getEnemyListingByName("OROBAS")!;
    const faction = {
      ...ensureFactionStates(makeGameState()).paracletus,
      crown: 5,
      unlockedUpgrades: [] as string[],
    };

    expect(isEnemyUpgradeLocked(potagon, faction)).toBe(true);
    expect(isEnemyUpgradeLocked(bombardier, faction)).toBe(true);
    expect(isEnemyCrownGated(bombardier, 5)).toBe(true);
    expect(isEnemyCrownGated(bombardier, 3)).toBe(false);
    expect(isEnemyCrownGated(orobas, 4)).toBe(false);

    faction.unlockedUpgrades = ["Extrarterran Evolution"];
    expect(isEnemyUpgradeLocked(potagon, faction)).toBe(false);
    expect(isEnemyUpgradeLocked(bombardier, faction)).toBe(false);
  });
});
