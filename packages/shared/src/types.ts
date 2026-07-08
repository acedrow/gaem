import type {
  ActionBudget,
  ActionTier,
  AssistedOutcome,
  AttackPreviewState,
  CombatState,
  EffectStacks,
  GmEnemyAction,
  PlayerAction,
} from "./combat/types.js";

export type { ActionBudget, AssistedOutcome, CombatState, EffectStacks, GmEnemyAction, PlayerAction };
export type {
  AttackPreviewState,
  PendingAction,
  PendingReaction,
  WeaponAttackSpec,
  StructuredArmorAction,
} from "./combat/types.js";

export const TERRAIN_TYPES = [
  "standard",
  "uneasy",
  "impassable",
  "cover",
  "obstacle",
  "advantageous",
  "void",
] as const;

export type TerrainType = (typeof TERRAIN_TYPES)[number];

export type MapTile = {
  x: number;
  y: number;
  terrain: TerrainType[];
  elevation: number;
  walkable?: boolean;
  tileEffects?: EffectStacks;
};

export type Enemy = {
  id: string;
  x: number;
  y: number;
  name?: string;
  hp?: number;
  scale?: number;
  speed?: number;
  movementRemaining?: number;
  effects?: EffectStacks;
  exhausted?: boolean;
  agnosiaTriggered?: boolean;
  kind?: "enemy" | "tower";
  ownerPlayerId?: string;
};

export type TerrainObject = {
  id: string;
  x: number;
  y: number;
  name?: string;
  kind?: "seed";
  ownerPlayerId?: string;
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
  armor?: string;
  weapon?: string;
  yadathanTower?: string;
  equipment?: string;
  gear?: string;
  gearArmor?: string;
  weapon2?: string;
  speed?: number;
  hp?: number;
  equipmentUses?: number;
  reversalCharges?: number;
  actionBudget?: ActionBudget;
  hasteActionTier?: ActionTier;
  turnStartX?: number;
  turnStartY?: number;
  effects?: EffectStacks;
  counters?: Record<string, number>;
};

export const ROUND_PHASES = [
  "deployment",
  "startRoundEffects",
  "playersChoice",
  "playerTurn",
  "gmTurn",
  "countdownTags",
] as const;

export type RoundPhase = (typeof ROUND_PHASES)[number];

export type TurnHolder =
  | { role: "gm"; gmPhase?: "startRoundEffects" | "countdownTags" }
  | { role: "player"; playerId: string };

export type PhaseAction =
  | "doEffects"
  | "takeTurn"
  | "endPlayerTurn"
  | "endGmTurn"
  | "countdownTags"
  | "endRound"
  | "resetRound"
  | "gmEndRound"
  | "gmEndTurn"
  | "endDeployment"
  | "resetCombat"
  | "endCombat"
  | "removeAllEnemies"
  | "rewindPhase"
  | "resetPhase";

export type RoundTurnLog = {
  round: number;
  turns: TurnHolder[];
};

export type DamageEvent = {
  x: number;
  y: number;
  amount: number;
};

export type PartyResourceKey = "hellsteel" | "soulfire" | "brimstone";

export type PartyResources = Record<PartyResourceKey, number>;

export type BaseCampaignAction =
  | { kind: "construct"; upgradeId: string }
  | { kind: "demolish"; upgradeId: string }
  | { kind: "adjustResource"; resource: PartyResourceKey; delta: number };

export type GameState = {
  mapId: string;
  mapName: string;
  width: number;
  height: number;
  tiles: MapTile[];
  players: Player[];
  enemies: Enemy[];
  terrainObjects?: TerrainObject[];
  round: number;
  roundPhase: RoundPhase;
  turn: TurnHolder | null;
  actedPlayerIds: string[];
  turnLog: RoundTurnLog[];
  sandboxMode?: boolean;
  combat?: CombatState;
  damageEvents?: DamageEvent[];
  silentHpEnemyIds?: string[];
  partyResources?: PartyResources;
  constructedBaseUpgrades?: string[];
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
  gmPermissions?: boolean;
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
  equipment?: string;
  gear?: string;
  gearArmor?: string;
  weapon2?: string;
  tags?: string[];
  yadathanTower?: string;
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
      token?: string;
    }
  | { type: "move"; x: number; y: number }
  | { type: "movePath"; path: { x: number; y: number }[]; flying?: boolean | boolean[] }
  | { type: "resetMovement" }
  | { type: "moveEnemy"; enemyId: string; x: number; y: number; soloSwarmMember?: boolean }
  | { type: "addEnemy"; x: number; y: number; name?: string }
  | { type: "removeEnemy"; enemyId: string; entireSwarm?: boolean }
  | { type: "setPlayerHp"; playerId: string; hp: number }
  | { type: "setEnemyHp"; enemyId: string; hp: number }
  | {
      type: "syncPlayerSheet";
      characterSheetId: string;
      class: string;
      armor?: string;
      weapon?: string;
      equipment?: string;
      gear?: string;
      gearArmor?: string;
      weapon2?: string;
      yadathanTower?: string;
    }
  | { type: "playerAction"; action: PlayerAction }
  | { type: "setAttackPreview"; preview: AttackPreviewState | null }
  | { type: "gmEnemyAction"; action: GmEnemyAction }
  | { type: "applyAssistedOutcome"; outcome: AssistedOutcome }
  | { type: "triggerReversal"; extraAllyIds?: string[] }
  | { type: "declineReversal" }
  | {
      type: "gmApplyDamage";
      target: { kind: "player" | "enemy"; id: string };
      amount: number;
    }
  | {
      type: "applyEffect";
      target: { kind: "player" | "enemy"; id: string };
      effects: string[];
    }
  | {
      type: "clearEffects";
      target: { kind: "player" | "enemy"; id: string };
    }
  | {
      type: "applyTileEffect";
      x: number;
      y: number;
      effects: string[];
    }
  | { type: "clearTileEffects"; x: number; y: number }
  | { type: "setTileTerrain"; x: number; y: number; terrain: TerrainType }
  | { type: "removeAttractor"; x: number; y: number }
  | { type: "phaseAction"; action: PhaseAction }
  | { type: "setSandboxMode"; sandboxMode: boolean }
  | { type: "baseCampaignAction"; action: BaseCampaignAction }
  | { type: "spawnPlayerToken"; characterSheetId: string }
  | { type: "removePlayerToken"; playerId: string };
