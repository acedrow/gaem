import { ref } from "vue";

export type RightPanelTab = "console" | "info";

export type ConsoleEntry = {
  id: number;
  at: number;
  message: string;
};

const entries = ref<ConsoleEntry[]>([]);
export const activeTab = ref<RightPanelTab>("info");
let nextId = 0;

export function logConsole(message: string) {
  entries.value.push({ id: nextId++, at: Date.now(), message });
}

export function useGameConsole() {
  function clearConsole() {
    entries.value = [];
  }

  return {
    entries,
    activeTab,
    logConsole,
    clearConsole,
  };
}
