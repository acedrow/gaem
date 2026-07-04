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
  prev: {
    name: string;
    class: string;
    armor: string;
    weapon: string;
    equipment?: string;
    gear?: string;
    weapon2?: string;
    tags?: string[];
  },
  next: {
    name: string;
    class: string;
    armor: string;
    weapon: string;
    equipment?: string;
    gear?: string;
    weapon2?: string;
    tags?: string[];
  },
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
  if (prev.equipment !== next.equipment) {
    log(actor, `set ${label} equipment to ${next.equipment || "none"}`);
  }
  if (prev.gear !== next.gear) {
    log(actor, `set ${label} gear to ${next.gear || "none"}`);
  }
  if (prev.weapon2 !== next.weapon2) {
    log(actor, `set ${label} weapon 2 to ${next.weapon2 || "none"}`);
  }
  if (JSON.stringify(prev.tags ?? []) !== JSON.stringify(next.tags ?? [])) {
    log(actor, `set ${label} tags to ${next.tags?.length ? next.tags.join(", ") : "none"}`);
  }
  if (prev.class !== next.class && !sheetOnBoard) {
    log(actor, `set ${label} class to ${next.class}`);
  }
}
