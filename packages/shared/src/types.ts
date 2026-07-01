export const TERRAIN_TYPES = [
  "standard",
  "uneasy",
  "impassable",
  "cover",
  "obstacle",
  "void",
] as const;

export type TerrainType = (typeof TERRAIN_TYPES)[number];

export type MapTile = {
  x: number;
  y: number;
  terrain: TerrainType[];
  elevation: number;
};

export type GameMap = {
  id: string;
  width: number;
  height: number;
  tiles: MapTile[];
};

export type Player = {
  id: string;
  x: number;
  y: number;
  nickname?: string;
};

export type GameState = {
  mapId: string;
  width: number;
  height: number;
  tiles: MapTile[];
  players: Player[];
};

/**
 * Persisted in KV. Keep top-level fields stable and append
 * future attributes under `data`.
 */
export type PlayerProfile = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  data: Record<string, unknown>;
};

/** Server → client */
export type ServerMessage =
  | { type: "state"; state: GameState; yourPlayerId: string | null }
  | { type: "error"; message: string };

/** Client → server */
export type ClientMessage =
  | {
      type: "join";
      role?: "player" | "gm";
      nickname?: string;
      playerKey?: string;
    }
  | { type: "move"; x: number; y: number };
