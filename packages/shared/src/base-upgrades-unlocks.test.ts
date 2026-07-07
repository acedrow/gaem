import { describe, expect, it } from "vitest";

import {
  STARTER_UNLOCKS,
  classGrantsDualGear,
  classGrantsSecondWeapon,
  getUnlockedOptions,
  validateCharacterSheetLoadout,
} from "./base-upgrades-unlocks.js";

const TOP_LEVEL_UPGRADES = [
  "pronoia-arms-modification",
  "synthetic-spinther-manufacturing",
  "ancilia-tactical-production",
  "choic-spatial-manipulation",
  "ignorance-devouring-anchor",
  "aponoia-expedited-enlightenment",
] as const;

describe("validateCharacterSheetLoadout", () => {
  it("allows starter loadout with no upgrades", () => {
    expect(
      validateCharacterSheetLoadout(
        { class: "HARPE", armor: "MALAKBEL", weapon: "Ten Thousand Year Reign Shattering Blade" },
        [],
      ),
    ).toBeNull();
  });

  it("rejects locked class without upgrade", () => {
    expect(validateCharacterSheetLoadout({ class: "EPEUS" }, [])).toMatch(/not unlocked/i);
  });

  it("rejects equipment without equipmentSlot", () => {
    expect(
      validateCharacterSheetLoadout({ equipment: "Hylic Annihilation Corridor" }, []),
    ).toMatch(/equipment slot not unlocked/i);
  });

  it("rejects gear without gearSlot", () => {
    expect(
      validateCharacterSheetLoadout({ gear: "Assisted Ascension Module (Armor)" }, []),
    ).toMatch(/gear slot not unlocked/i);
  });

  it("rejects second weapon without upgrade or HARPE", () => {
    expect(
      validateCharacterSheetLoadout(
        { class: "KOPIS", weapon2: "She Speaks The Language Of Kings" },
        [],
      ),
    ).toMatch(/second weapon slot not unlocked/i);
  });

  it("allows HARPE second weapon without upgrade", () => {
    expect(
      validateCharacterSheetLoadout(
        {
          class: "HARPE",
          weapon2: "She Speaks The Language Of Kings",
        },
        [],
      ),
    ).toBeNull();
  });

  it("allows EPEUS dual gear without gearSlot upgrade", () => {
    expect(
      validateCharacterSheetLoadout(
        {
          class: "EPEUS",
          gear: "Assisted Ascension Module (Armor)",
          gearArmor: "Expanded Aggression Rituals (Armor)",
        },
        ["pronoia-arms-modification"],
      ),
    ).toBeNull();
  });

  it("grandfathers existing locked selections when changing other fields", () => {
    const existing = { class: "EPEUS", gear: "Assisted Ascension Module (Armor)" };
    expect(
      validateCharacterSheetLoadout({ class: "EPEUS", armor: "MALAKBEL" }, [], existing),
    ).toBeNull();
  });

  for (const upgradeId of TOP_LEVEL_UPGRADES) {
    it(`unlocks options from ${upgradeId}`, () => {
      const unlocked = getUnlockedOptions([upgradeId]);
      const starterCount =
        STARTER_UNLOCKS.weapons.length +
        STARTER_UNLOCKS.armor.length +
        STARTER_UNLOCKS.classes.length;
      const total =
        unlocked.weapons.length +
        unlocked.armor.length +
        unlocked.classes.length +
        unlocked.equipment.length +
        unlocked.gear.length;
      expect(total).toBeGreaterThan(starterCount);
    });
  }

  it("ancilia unlocks equipment slot and HEPHAESTUS", () => {
    const ids = ["ancilia-tactical-production"];
    expect(
      validateCharacterSheetLoadout(
        {
          class: "HEPHAESTUS",
          equipment: "Hylic Annihilation Corridor",
        },
        ids,
      ),
    ).toBeNull();
  });

  it("pronoia unlocks gear slot and YADATHAN", () => {
    const ids = ["pronoia-arms-modification"];
    expect(
      validateCharacterSheetLoadout(
        {
          class: "EPEUS",
          armor: "YADATHAN",
          gear: "Assisted Ascension Module (Armor)",
        },
        ids,
      ),
    ).toBeNull();
  });

  it("choic unlocks VARUNASTRA and second weapon for non-HARPE", () => {
    const ids = ["choic-spatial-manipulation"];
    expect(
      validateCharacterSheetLoadout(
        {
          class: "VARUNASTRA",
          weapon2: "Heaven Burning Sword",
        },
        ids,
      ),
    ).toBeNull();
  });

  it("aponoia unlocks CHRYSAOR and MURIEL", () => {
    const ids = ["aponoia-expedited-enlightenment"];
    expect(
      validateCharacterSheetLoadout({ class: "CHRYSAOR", armor: "MURIEL" }, ids),
    ).toBeNull();
  });

  it("spinther unlocks Catalytic rifle and Motes with equipment slot", () => {
    const ids = ["synthetic-spinther-manufacturing", "ancilia-tactical-production"];
    expect(
      validateCharacterSheetLoadout(
        {
          weapon: "Catalytic-Actuated Positron Rifle",
          equipment: "Motes of Bountiful Forethought",
        },
        ids,
      ),
    ).toBeNull();
  });
});

describe("class slot grants", () => {
  it("HARPE grants second weapon", () => {
    expect(classGrantsSecondWeapon("HARPE")).toBe(true);
    expect(classGrantsSecondWeapon("KOPIS")).toBe(false);
  });

  it("EPEUS grants dual gear", () => {
    expect(classGrantsDualGear("EPEUS")).toBe(true);
    expect(classGrantsDualGear("HARPE")).toBe(false);
  });
});
