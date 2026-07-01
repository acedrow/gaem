import type { ConsoleLogEntry } from "@gaem/shared";
import { ref } from "vue";

export type RightPanelTab = "console" | "info";

const entries = ref<ConsoleLogEntry[]>([]);
export const activeTab = ref<RightPanelTab>("info");

export function setConsoleEntries(next: ConsoleLogEntry[]) {
  entries.value = next;
}

export function appendConsoleEntry(entry: ConsoleLogEntry) {
  if (entries.value.some((e) => e.id === entry.id)) return;
  entries.value.push(entry);
}

export function useGameConsole() {
  return {
    entries,
    activeTab,
    setConsoleEntries,
    appendConsoleEntry,
  };
}
