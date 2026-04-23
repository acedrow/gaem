export type TileKind = "empty" | "wall";

export type Player = {
  id: string;
  x: number;
  y: number;
  nickname?: string;
};

export type GameState = {
  width: number;
  height: number;
  tiles: TileKind[][];
  players: Player[];
};

/** Server → client */
export type ServerMessage =
  | { type: "state"; state: GameState; yourPlayerId: string | null }
  | { type: "error"; message: string };

/** Client → server */
export type ClientMessage =
  | { type: "join"; nickname?: string }
  | { type: "move"; x: number; y: number };
