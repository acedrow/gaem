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

export type Enemy = {
  id: string;
  x: number;
  y: number;
  name?: string;
  hp?: number;
};

export type TerrainObject = {
  id: string;
  x: number;
  y: number;
  name?: string;
};

export type GameMap = {
  id: string;
  name?: string;
  width: number;
  height: number;
  tiles: MapTile[];
  enemies?: Enemy[];
};

export type Player = {
  id: string;
  x: number;
  y: number;
  nickname?: string;
  playerKey?: string;
  characterSheetId?: string;
  class?: string;
  hp?: number;
};

export type GameState = {
  mapId: string;
  mapName: string;
  width: number;
  height: number;
  tiles: MapTile[];
  players: Player[];
  enemies: Enemy[];
  terrainObjects?: TerrainObject[];
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

export type GaemRole = "gm" | "player";

export type { ConsoleActor, ConsoleLogEntry } from "./console.js";

export type CharacterSheet = {
  id: string;
  player: string;
  name: string;
  portraitKey: string | null;
  class: string;
  armor: string;
  weapon: string;
  createdAt: string;
  updatedAt: string;
};

/** Server → client */
export type ServerMessage =
  | { type: "state"; state: GameState; yourPlayerId: string | null }
  | { type: "console"; entry: import("./console.js").ConsoleLogEntry }
  | { type: "consoleSync"; entries: import("./console.js").ConsoleLogEntry[] }
  | { type: "error"; message: string };

/** Client → server */
export type ClientMessage =
  | {
      type: "join";
      role?: "player" | "gm";
      nickname?: string;
      playerKey?: string;
      characterSheetId?: string;
    }
  | { type: "move"; x: number; y: number }
  | { type: "moveEnemy"; enemyId: string; x: number; y: number }
  | { type: "addEnemy"; x: number; y: number; name?: string }
  | { type: "removeEnemy"; enemyId: string }
  | { type: "setPlayerHp"; playerId: string; hp: number }
  | { type: "syncPlayerSheet"; characterSheetId: string; class: string };
