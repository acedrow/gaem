import reconMovesJson from "./data/rules/recon-moves.json" with { type: "json" };

export type ReconMove = {
  name: string;
  summary: string;
};

export const RECON_MOVES = reconMovesJson as ReconMove[];
