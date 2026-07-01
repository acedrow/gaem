import type { Enemy, Player } from "./types.js";

export type ConsoleActor = {
  name: string;
  role: "gm" | "player";
};

export const CONSOLE_MAX_ENTRIES = 200;

export type ConsoleLogEntry = {
  id: string;
  at: number;
  actor: ConsoleActor;
  message: string;
};

export function trimConsoleEntries(entries: ConsoleLogEntry[]): ConsoleLogEntry[] {
  if (entries.length <= CONSOLE_MAX_ENTRIES) return entries;
  return entries.slice(-CONSOLE_MAX_ENTRIES);
}

export function playerLabel(player: Player): string {
  return player.nickname ?? player.id;
}

export function enemyLabel(enemy: Enemy): string {
  return enemy.name ?? "Enemy";
}

export function characterTargetLabel(
  player: Player | undefined,
  sheetName?: string | null,
): string {
  if (sheetName) return sheetName;
  if (player) return playerLabel(player);
  return "Player";
}
