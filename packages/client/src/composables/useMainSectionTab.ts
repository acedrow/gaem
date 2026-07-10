import { ref } from "vue";

import { readPersistedUi } from "./uiPersist.js";

export type MainSectionTab = "taccom" | "overworld" | "baseUpgrades";

export const activeMainTab = ref<MainSectionTab>(readPersistedUi().activeMainTab);
