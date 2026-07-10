import { describe, expect, it } from "vitest";

import {
  applyOverworldCampaignAction,
  defaultOverworldParty,
  isOverworldTravelDestination,
  listOverworldTravelDestinations,
  overworldTravelReachQuarters,
  validateOverworldCampaignAction,
} from "./overworld.js";
import { makeGameState } from "./test/fixtures.js";
import { OVERWORLD_TRAVEL_FUEL_COST } from "./types.js";

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
  it("rejects travel without enough fuel", () => {
    const state = makeGameState({
      overworldParty: { ...defaultOverworldParty(), fuel: 1, mapSpeed: 1 },
    });
    const party = state.overworldParty!;
    const dest = listOverworldTravelDestinations(party)[0]!;
    expect(validateOverworldCampaignAction(state, { kind: "travel", qx: dest.qx, qy: dest.qy })).toBe(
      "Not enough fuel",
    );
  });

  it("spends fuel and moves the party token", () => {
    const state = makeGameState({
      overworldParty: { ...defaultOverworldParty(), fuel: 5, mapSpeed: 1 },
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
      overworldParty: { ...defaultOverworldParty(), fuel: 5, mapSpeed: 1 },
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
      overworldParty: { ...defaultOverworldParty(), fuel: 0, revelations: 0, mapSpeed: 0 },
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
