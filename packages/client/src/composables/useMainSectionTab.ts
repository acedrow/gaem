import { ref } from "vue";

import { readPersistedUi } from "./uiPersist.js";

export type MainSectionTab = "taccom" | "baseUpgrades";

export const activeMainTab = ref<MainSectionTab>(readPersistedUi().activeMainTab);
