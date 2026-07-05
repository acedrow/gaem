import type { CharacterSheet } from "@gaem/shared";
import { computed, ref } from "vue";

import { readPersistedUi } from "./uiPersist.js";
import { useApi } from "./useApi.js";
import { activeTab } from "./useGameConsole.js";
import { useGameState } from "./useGameState.js";
import { useInfoDataSelection } from "./useInfoDataSelection.js";

export type GearField = "class" | "armor" | "weapon" | "equipment" | "gear" | "weapon2";

export type GearPick = {
  sheetId: string;
  field: GearField;
  currentValue: string;
  yadathanTower?: string;
};

const persisted = readPersistedUi();
const selectedSheetId = ref<string | null>(persisted.selectedSheetId);
const sheetsExpanded = ref(persisted.sheetsExpanded);
const sheetsVersion = ref(0);
const gearPick = ref<GearPick | null>(null);

export function useCharacterSheetSelection() {
  const { apiFetch } = useApi();
  const { gameState, send } = useGameState();
  const { clearDataCategory } = useInfoDataSelection();

  const gearPickCategory = computed((): "armor" | "classes" | "weapons" | "equipment" | "gear" | null => {
    const field = gearPick.value?.field;
    if (!field) return null;
    if (field === "class") return "classes";
    if (field === "weapon" || field === "weapon2") return "weapons";
    return field;
  });

  function selectSheet(id: string | null) {
    gearPick.value = null;
    if (id) clearDataCategory();
    selectedSheetId.value = id;
    if (id) {
      activeTab.value = "info";
    }
  }

  function notifySheetsChanged() {
    sheetsVersion.value++;
  }

  function cancelGearPick() {
    gearPick.value = null;
  }

  function startGearPick(
    sheetId: string,
    field: GearField,
    currentValue: string,
    yadathanTower?: string,
  ) {
    clearDataCategory();
    gearPick.value = { sheetId, field, currentValue, yadathanTower };
    activeTab.value = "info";
  }

  async function equipGear(
    name: string,
    extra?: { yadathanTower?: string },
  ): Promise<string | null> {
    const pick = gearPick.value;
    if (!pick) return null;
    try {
      const body: Record<string, string> = {};
      if (pick.field === "armor" && extra?.yadathanTower && name === pick.currentValue) {
        body.yadathanTower = extra.yadathanTower;
      } else {
        body[pick.field] = name;
        if (pick.field === "armor" && extra?.yadathanTower) {
          body.yadathanTower = extra.yadathanTower;
        }
      }
      const res = await apiFetch(`/api/character-sheets/${pick.sheetId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        return data?.error ?? "Failed to save";
      }
      const data = (await res.json()) as { sheet: CharacterSheet };
      const boardPlayer = gameState.value?.players.find(
        (p) => p.characterSheetId === pick.sheetId,
      );
      if (boardPlayer) {
        send({
          type: "syncPlayerSheet",
          characterSheetId: pick.sheetId,
          class: data.sheet.class,
          armor: data.sheet.armor,
          weapon: data.sheet.weapon,
          equipment: data.sheet.equipment,
          gear: data.sheet.gear,
          weapon2: data.sheet.weapon2,
          yadathanTower: data.sheet.yadathanTower,
        });
      }
      notifySheetsChanged();
      gearPick.value = null;
      return null;
    } catch {
      return "Unable to save";
    }
  }

  return {
    selectedSheetId,
    sheetsExpanded,
    sheetsVersion,
    gearPick,
    gearPickCategory,
    selectSheet,
    notifySheetsChanged,
    cancelGearPick,
    startGearPick,
    equipGear,
  };
}
