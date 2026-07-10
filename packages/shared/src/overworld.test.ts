import { describe, expect, it } from "vitest";

import {
  applyOverworldCampaignAction,
  defaultOverworldParty,
  isOverworldDeployDestination,
  isOverworldTravelDestination,
  listOverworldDeployDestinations,
  listOverworldTravelDestinations,
  overworldTravelReachQuarters,
  validateOverworldCampaignAction,
} from "./overworld.js";
import { makeGameState } from "./test/fixtures.js";
import { OVERWORLD_QUARTER_HEIGHT, OVERWORLD_QUARTER_WIDTH, OVERWORLD_TRAVEL_FUEL_COST } from "./types.js";

function partyOnMap(overrides: Partial<ReturnType<typeof defaultOverworldParty>> = {}) {
  return { ...defaultOverworldParty(), atDis: false, ...overrides };
}

describe("overworldTravelReachQuarters", () => {
  it("maps Map Speed 1 to 5 quarter-cells (2.5 inches)", () => {
    expect(overworldTravelReachQuarters(1)).toBe(5);
  });

  it("maps Map Speed 1.5 to 8 quarter-cells (3.75 inches, ceiled)", () => {
    expect(overworldTravelReachQuarters(1.5)).toBe(8);
  });

  it("maps Map Speed 2 to 10 quarter-cells (5 inches)", () => {
    expect(overworldTravelReachQuarters(2)).toBe(10);
  });

  it("ceils fractional inch budgets", () => {
    expect(overworldTravelReachQuarters(0.1)).toBe(1);
  });
});

describe("isOverworldTravelDestination", () => {
  const from = { qx: 16, qy: 10 };

  it("allows orthogonal and diagonal cells within reach", () => {
    expect(isOverworldTravelDestination(from, { qx: 21, qy: 10 }, 1)).toBe(true);
    expect(isOverworldTravelDestination(from, { qx: 16, qy: 5 }, 1)).toBe(true);
    expect(isOverworldTravelDestination(from, { qx: 19, qy: 14 }, 1)).toBe(true);
  });

  it("rejects the current cell and out-of-reach cells", () => {
    expect(isOverworldTravelDestination(from, from, 1)).toBe(false);
    expect(isOverworldTravelDestination(from, { qx: 22, qy: 10 }, 1)).toBe(false);
  });

  it("rejects out-of-bounds destinations", () => {
    expect(isOverworldTravelDestination(from, { qx: -1, qy: 10 }, 1)).toBe(false);
    expect(isOverworldTravelDestination(from, { qx: 16.5, qy: 10 }, 1)).toBe(false);
  });
});

describe("listOverworldTravelDestinations", () => {
  it("excludes origin and stays within reach", () => {
    const party = { qx: 16, qy: 10, mapSpeed: 1 };
    const dests = listOverworldTravelDestinations(party);
    expect(dests.some((d) => d.qx === 16 && d.qy === 10)).toBe(false);
    expect(dests.every((d) => isOverworldTravelDestination(party, d, party.mapSpeed))).toBe(true);
    expect(dests.length).toBeGreaterThan(0);
  });
});

describe("overworldCampaignAction travel", () => {
  it("rejects travel while in DIS", () => {
    const state = makeGameState({
      overworldParty: { ...defaultOverworldParty(), fuel: 5, mapSpeed: 1 },
    });
    expect(
      validateOverworldCampaignAction(state, { kind: "travel", qx: 0, qy: 0 }),
    ).toBe("Party is in DIS");
  });

  it("rejects travel without enough fuel", () => {
    const state = makeGameState({
      overworldParty: partyOnMap({ fuel: 1, mapSpeed: 1 }),
    });
    const party = state.overworldParty!;
    const dest = listOverworldTravelDestinations(party)[0]!;
    expect(validateOverworldCampaignAction(state, { kind: "travel", qx: dest.qx, qy: dest.qy })).toBe(
      "Not enough fuel",
    );
  });

  it("spends fuel and moves the party token", () => {
    const state = makeGameState({
      overworldParty: partyOnMap({ fuel: 5, mapSpeed: 1 }),
    });
    const party = state.overworldParty!;
    const dest = listOverworldTravelDestinations(party)[0]!;
    expect(validateOverworldCampaignAction(state, { kind: "travel", qx: dest.qx, qy: dest.qy })).toBeNull();
    const message = applyOverworldCampaignAction(state, { kind: "travel", qx: dest.qx, qy: dest.qy });
    expect(message).toContain("Traveled");
    expect(state.overworldParty!.fuel).toBe(5 - OVERWORLD_TRAVEL_FUEL_COST);
    expect(state.overworldParty!.qx).toBe(dest.qx);
    expect(state.overworldParty!.qy).toBe(dest.qy);
  });

  it("rejects invalid destinations even with fuel", () => {
    const state = makeGameState({
      overworldParty: partyOnMap({ fuel: 5, mapSpeed: 1 }),
    });
    const party = state.overworldParty!;
    expect(
      validateOverworldCampaignAction(state, {
        kind: "travel",
        qx: party.qx + 20,
        qy: party.qy,
      }),
    ).toBe("Invalid travel destination");
  });
});

describe("overworld deploy destinations", () => {
  it("only allows the southernmost quarter-row", () => {
    expect(isOverworldDeployDestination(0, OVERWORLD_QUARTER_HEIGHT - 1)).toBe(true);
    expect(isOverworldDeployDestination(16, OVERWORLD_QUARTER_HEIGHT - 2)).toBe(false);
    expect(listOverworldDeployDestinations()).toHaveLength(OVERWORLD_QUARTER_WIDTH);
  });
});

describe("overworldCampaignAction returnToDis / deployToHell", () => {
  it("returns to DIS and clears journey currencies", () => {
    const state = makeGameState({
      overworldParty: partyOnMap({ fuel: 4, revelations: 3 }),
    });
    expect(validateOverworldCampaignAction(state, { kind: "returnToDis" })).toBeNull();
    const message = applyOverworldCampaignAction(state, { kind: "returnToDis" });
    expect(message).toContain("Returned to DIS");
    expect(state.overworldParty!.atDis).toBe(true);
    expect(state.overworldParty!.fuel).toBe(0);
    expect(state.overworldParty!.revelations).toBe(0);
  });

  it("rejects return when already in DIS", () => {
    const state = makeGameState({ overworldParty: defaultOverworldParty() });
    expect(validateOverworldCampaignAction(state, { kind: "returnToDis" })).toBe(
      "Party is already in DIS",
    );
  });

  it("deploys from DIS to a southern cell", () => {
    const state = makeGameState({ overworldParty: defaultOverworldParty() });
    const qx = 10;
    const qy = OVERWORLD_QUARTER_HEIGHT - 1;
    expect(validateOverworldCampaignAction(state, { kind: "deployToHell", qx, qy })).toBeNull();
    const message = applyOverworldCampaignAction(state, { kind: "deployToHell", qx, qy });
    expect(message).toContain("Deployed to Hell");
    expect(state.overworldParty!.atDis).toBe(false);
    expect(state.overworldParty!.qx).toBe(qx);
    expect(state.overworldParty!.qy).toBe(qy);
  });

  it("rejects deploy when not in DIS or destination is invalid", () => {
    const state = makeGameState({ overworldParty: partyOnMap() });
    expect(
      validateOverworldCampaignAction(state, {
        kind: "deployToHell",
        qx: 0,
        qy: OVERWORLD_QUARTER_HEIGHT - 1,
      }),
    ).toBe("Party is not in DIS");

    const inDis = makeGameState({ overworldParty: defaultOverworldParty() });
    expect(
      validateOverworldCampaignAction(inDis, { kind: "deployToHell", qx: 0, qy: 0 }),
    ).toBe("Invalid deploy destination");
  });
});

describe("overworldCampaignAction adjustments", () => {
  it("adjusts map speed, fuel, and revelations", () => {
    const state = makeGameState();
    expect(validateOverworldCampaignAction(state, { kind: "adjustMapSpeed", delta: 0.5 })).toBeNull();
    applyOverworldCampaignAction(state, { kind: "adjustMapSpeed", delta: 0.5 });
    expect(state.overworldParty!.mapSpeed).toBe(1.5);

    applyOverworldCampaignAction(state, { kind: "adjustFuel", delta: 3 });
    expect(state.overworldParty!.fuel).toBe(3);

    applyOverworldCampaignAction(state, { kind: "adjustRevelations", delta: 2 });
    expect(state.overworldParty!.revelations).toBe(2);
  });

  it("blocks adjustments below zero", () => {
    const state = makeGameState({
      overworldParty: partyOnMap({ fuel: 0, revelations: 0, mapSpeed: 0 }),
    });
    expect(validateOverworldCampaignAction(state, { kind: "adjustFuel", delta: -1 })).toBe(
      "Insufficient fuel",
    );
    expect(validateOverworldCampaignAction(state, { kind: "adjustRevelations", delta: -1 })).toBe(
      "Insufficient revelations",
    );
    expect(validateOverworldCampaignAction(state, { kind: "adjustMapSpeed", delta: -0.5 })).toBe(
      "Insufficient map speed",
    );
  });
});
