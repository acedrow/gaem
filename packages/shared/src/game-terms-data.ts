import gameTermsJson from "./data/rules/game-terms.json" with { type: "json" };

export type GameTerm = {
  id: string;
  summary: string;
  description: string;
};

export const GAME_TERMS = gameTermsJson as GameTerm[];

const gameTermById = new Map(GAME_TERMS.map((term) => [term.id.toLowerCase(), term]));

export function getGameTermByName(name: string): GameTerm | undefined {
  return gameTermById.get(name.toLowerCase());
}
