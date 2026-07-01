import type { ConsoleActor } from "./console.js";

export function actorForAuth(
  role: "gm" | "player",
  profileName?: string | null,
): ConsoleActor {
  if (role === "gm") return { name: "GM", role: "gm" };
  return { name: profileName ?? "Player", role: "player" };
}

export function logSheetFieldChanges(
  log: (actor: ConsoleActor, message: string) => void,
  actor: ConsoleActor,
  label: string,
  prev: { name: string; class: string; armor: string; weapon: string },
  next: { name: string; class: string; armor: string; weapon: string },
  sheetOnBoard: boolean,
): void {
  if (prev.name !== next.name) {
    log(actor, `set ${label} name to ${next.name}`);
  }
  if (prev.armor !== next.armor) {
    log(actor, `set ${label} armor to ${next.armor}`);
  }
  if (prev.weapon !== next.weapon) {
    log(actor, `set ${label} weapon to ${next.weapon}`);
  }
  if (prev.class !== next.class && !sheetOnBoard) {
    log(actor, `set ${label} class to ${next.class}`);
  }
}
