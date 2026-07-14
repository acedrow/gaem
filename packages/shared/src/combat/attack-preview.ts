import type { PatternDirection } from "../pattern-data.js";
import { PATTERN_DIRECTIONS } from "../pattern-data.js";
import type { GameState } from "../types.js";
import { buildBoardOccupancy } from "../game.js";
import { coordKey } from "../map.js";
import { getEnemyListingByName } from "../enemy-data.js";
import {
  computeOmnistrikeRangeSpan,
  collectBombPatternTiles,
  collectAttackTiles,
  enemyDirectAttackTargetPlayerIds,
  evaluateOmnistrikePlacement,
  getWeaponAttackSpec,
  parseEnemyAttackString,
  rangeAttackTileKeys,
  resolveBombAttackSpec,
  resolveCombatAttackSpec,
  unionPatternTiles,
} from "./attack.js";
import {
  collectEquipmentPatternTiles,
  getEquipmentAttackSpec,
  isHylicAnnihilationCorridor,
} from "./equipment.js";
import {
  evaluateAnchoredPatternPlacement,
  isHealAttackSpec,
  isRangeTargetAttack,
  isRangedPatternAttack,
  patternOriginFromAnchor,
  rangeTargetDistance,
  rangedPatternPlacementKeys,
  usesAnchoredPatternPlacement,
} from "../weapon-patterns.js";
import type { AttackPreviewState, WeaponAttackSpec } from "./types.js";

export type AttackPreviewHighlights = {
  primary: string[];
  secondary: string[];
  invalid: string[];
  selected: string[];
  heal: boolean;
};

const EMPTY: AttackPreviewHighlights = {
  primary: [],
  secondary: [],
  invalid: [],
  selected: [],
  heal: false,
};

function tileKeys(tiles: { x: number; y: number }[]): string[] {
  return tiles.map((t) => coordKey(t.x, t.y));
}

function keysFromSet(keys: Set<string>): string[] {
  return [...keys];
}

function directionAttackKeys(
  state: GameState,
  origin: { x: number; y: number },
  spec: WeaponAttackSpec,
  aimed: boolean,
  currentDirection: PatternDirection,
): { primary: string[]; secondary: string[] } {
  const primary: string[] = [];
  const secondary: string[] = [];
  for (const dir of PATTERN_DIRECTIONS) {
    const keys = tileKeys(collectAttackTiles(state, origin, spec, dir));
    if (aimed && dir === currentDirection) primary.push(...keys);
    else secondary.push(...keys);
  }
  return { primary, secondary };
}

function computePlayerAttackHighlights(
  state: GameState,
  playerId: string,
  preview: AttackPreviewState,
  spec: WeaponAttackSpec,
  origin: { x: number; y: number },
): AttackPreviewHighlights {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return EMPTY;

  const direction = preview.direction ?? "n";
  const aimed = preview.aimed ?? false;
  const anchor =
    preview.anchorX != null && preview.anchorY != null
      ? { x: preview.anchorX, y: preview.anchorY }
      : preview.hoverX != null && preview.hoverY != null
        ? { x: preview.hoverX, y: preview.hoverY }
        : null;
  const heal = isHealAttackSpec(spec);

  if (isRangeTargetAttack(spec)) {
    const secondary = keysFromSet(rangeAttackTileKeys(state, origin, rangeTargetDistance(spec)));
    const selected: string[] = [];
    for (const id of preview.targetEnemyIds ?? []) {
      const enemy = state.enemies.find((e) => e.id === id);
      if (enemy) selected.push(coordKey(enemy.x, enemy.y));
    }
    for (const c of preview.targetObstacleCoords ?? []) {
      selected.push(coordKey(c.x, c.y));
    }
    return { primary: [], secondary, invalid: [], selected, heal };
  }

  if (usesAnchoredPatternPlacement(spec)) {
    if (!anchor) return { ...EMPTY, heal };
    const placement = evaluateAnchoredPatternPlacement(player, anchor, spec, direction, state);
    if (aimed && placement.valid) {
      return {
        primary: tileKeys(placement.patternTiles),
        secondary: [],
        invalid: [],
        selected: [],
        heal,
      };
    }
    if (aimed) return { ...EMPTY, heal };
    const invalid = placement.tooFar
      ? tileKeys(placement.patternTiles)
      : keysFromSet(placement.tooCloseKeys);
    return {
      primary: [],
      secondary: placement.valid ? tileKeys(placement.patternTiles) : [],
      invalid,
      selected: [],
      heal,
    };
  }

  if (isRangedPatternAttack(spec)) {
    if (spec.rangeSpan) {
      const secondary = keysFromSet(rangedPatternPlacementKeys(state, origin, spec.rangeSpan));
      if (!aimed || !anchor) return { primary: [], secondary, invalid: [], selected: [], heal };
      const attackOrigin = patternOriginFromAnchor(anchor, spec.anchorTile, direction);
      const primary = tileKeys(collectAttackTiles(state, attackOrigin, spec, direction));
      return { primary, secondary, invalid: [], selected: [], heal };
    }
    const secondary = keysFromSet(rangeAttackTileKeys(state, origin, spec.range!));
    if (!aimed) return { primary: [], secondary, invalid: [], selected: [], heal };
    const { primary, secondary: otherDirs } = directionAttackKeys(
      state,
      origin,
      spec,
      true,
      direction,
    );
    return { primary, secondary: [...secondary, ...otherDirs], invalid: [], selected: [], heal };
  }

  if (!aimed) {
    const { secondary } = directionAttackKeys(state, origin, spec, false, direction);
    return { primary: [], secondary, invalid: [], selected: [], heal };
  }

  const { primary, secondary } = directionAttackKeys(state, origin, spec, true, direction);
  return { primary, secondary, invalid: [], selected: [], heal };
}

function computeOmnistrikeHighlights(
  state: GameState,
  playerId: string,
  preview: AttackPreviewState,
): AttackPreviewHighlights {
  const player = state.players.find((p) => p.id === playerId);
  const indices = preview.omnistrikeBombIndices;
  const step = preview.omnistrikeStep;
  if (!player?.weapon || !indices || !step) return EMPTY;
  const [indexA, indexB] = indices;
  const bombA = resolveBombAttackSpec(player.weapon, indexA);
  const bombB = resolveBombAttackSpec(player.weapon, indexB);
  if (!bombA || !bombB) return EMPTY;
  const combinedSpan = computeOmnistrikeRangeSpan(bombA, bombB);
  if (!combinedSpan) return EMPTY;

  const direction = preview.direction ?? "n";
  const anchors = preview.omnistrikeAnchors ?? [null, null];

  if (step === "confirm") {
    const anchorA = anchors[0];
    const anchorB = anchors[1];
    if (!anchorA || !anchorB) return EMPTY;
    const tilesA = collectBombPatternTiles(state, anchorA, bombA, direction);
    const tilesB = collectBombPatternTiles(state, anchorB, bombB, direction);
    return {
      primary: tileKeys(unionPatternTiles(tilesA, tilesB)),
      secondary: [],
      invalid: [],
      selected: [],
      heal: false,
    };
  }

  const firstAnchor = anchors[0];
  const lockedFirst = firstAnchor
    ? tileKeys(collectBombPatternTiles(state, firstAnchor, bombA, direction))
    : [];

  const hover =
    preview.hoverX != null && preview.hoverY != null
      ? { x: preview.hoverX, y: preview.hoverY }
      : null;
  if (!hover) {
    return { primary: [], secondary: lockedFirst, invalid: [], selected: [], heal: false };
  }

  const placement =
    step === "placeFirst"
      ? evaluateOmnistrikePlacement(player, hover, bombA, direction, state, combinedSpan)
      : firstAnchor
        ? evaluateOmnistrikePlacement(
            player,
            hover,
            bombB,
            direction,
            state,
            combinedSpan,
            collectBombPatternTiles(state, firstAnchor, bombA, direction),
          )
        : null;
  if (!placement) return { primary: [], secondary: lockedFirst, invalid: [], selected: [], heal: false };

  const secondary = [...tileKeys(placement.patternTiles), ...lockedFirst.filter((k) => !tileKeys(placement.patternTiles).includes(k))];
  const invalid =
    placement.tooFar || (step === "placeSecond" && !placement.adjacentToOther)
      ? tileKeys(placement.patternTiles)
      : keysFromSet(placement.tooCloseKeys);

  return { primary: [], secondary, invalid, selected: [], heal: false };
}

function computeGmEnemyAttackHighlights(
  state: GameState,
  preview: AttackPreviewState,
): AttackPreviewHighlights {
  const enemyId = preview.enemyId;
  const attackIndex = preview.attackIndex;
  if (enemyId == null || attackIndex == null) return EMPTY;
  const enemy = state.enemies.find((e) => e.id === enemyId);
  if (!enemy?.name) return EMPTY;
  const parsed = parseEnemyAttackString(
    getEnemyListingByName(enemy.name)?.attacks?.[attackIndex] ?? "",
  );
  const direction = preview.direction ?? "n";
  const aimed = preview.aimed ?? false;
  const occ = buildBoardOccupancy(state);

  if (parsed.patternId && parsed.size != null && parsed.damage != null) {
    const spec = {
      patternId: parsed.patternId,
      size: parsed.size,
      range: parsed.range,
      width: parsed.width ?? 1,
      damage: String(parsed.damage),
    };
    const origin = { x: enemy.x, y: enemy.y };
    if (aimed) {
      const primary = tileKeys(collectAttackTiles(state, origin, spec, direction));
      const secondary: string[] = [];
      for (const dir of PATTERN_DIRECTIONS) {
        if (dir === direction) continue;
        for (const key of tileKeys(collectAttackTiles(state, origin, spec, dir))) {
          if (!primary.includes(key)) secondary.push(key);
        }
      }
      return { primary, secondary, invalid: [], selected: [], heal: false };
    }
    const secondary = new Set<string>();
    for (const dir of PATTERN_DIRECTIONS) {
      for (const key of tileKeys(collectAttackTiles(state, origin, spec, dir))) {
        secondary.add(key);
      }
    }
    return { primary: [], secondary: [...secondary], invalid: [], selected: [], heal: false };
  }

  const selected: string[] = [];
  for (const playerId of enemyDirectAttackTargetPlayerIds(state, enemyId, parsed, occ)) {
    const player = state.players.find((p) => p.id === playerId);
    if (player) selected.push(coordKey(player.x, player.y));
  }
  return { primary: [], secondary: selected, invalid: [], selected, heal: false };
}

export function computeAttackPreviewHighlights(
  state: GameState,
  preview: AttackPreviewState,
): AttackPreviewHighlights {
  switch (preview.mode) {
    case "attack": {
      const playerId = preview.playerId;
      if (!playerId) return EMPTY;
      const player = state.players.find((p) => p.id === playerId);
      if (!player?.weapon) return EMPTY;
      const spec = resolveCombatAttackSpec(player, player.weapon);
      if (!spec) return EMPTY;
      return computePlayerAttackHighlights(state, playerId, preview, spec, { x: player.x, y: player.y });
    }
    case "varunastraBorrow": {
      const playerId = preview.playerId;
      const allyId = preview.borrowAllyId;
      if (!playerId || !allyId) return EMPTY;
      const player = state.players.find((p) => p.id === playerId);
      const ally = state.players.find((p) => p.id === allyId);
      if (!player || !ally?.weapon) return EMPTY;
      const spec = getWeaponAttackSpec(ally.weapon);
      if (!spec) return EMPTY;
      return computePlayerAttackHighlights(state, playerId, preview, spec, { x: player.x, y: player.y });
    }
    case "equipmentCorridor": {
      const playerId = preview.playerId;
      if (!playerId) return EMPTY;
      const player = state.players.find((p) => p.id === playerId);
      if (!player?.equipment || !isHylicAnnihilationCorridor(player.equipment)) return EMPTY;
      const spec = getEquipmentAttackSpec(player.equipment);
      if (!spec) return EMPTY;
      const direction = preview.direction ?? "n";
      const aimed = preview.aimed ?? false;
      const anchor =
        preview.anchorX != null && preview.anchorY != null
          ? { x: preview.anchorX, y: preview.anchorY }
          : preview.hoverX != null && preview.hoverY != null
            ? { x: preview.hoverX, y: preview.hoverY }
            : null;
      if (!anchor) return EMPTY;
      const patternTiles = collectEquipmentPatternTiles(state, anchor, player.equipment, direction);
      const valid = patternTiles.length >= (spec.tiles?.length ?? 0);
      if (aimed && valid) {
        return { primary: tileKeys(patternTiles), secondary: [], invalid: [], selected: [], heal: false };
      }
      if (aimed) return EMPTY;
      return {
        primary: [],
        secondary: valid ? tileKeys(patternTiles) : [],
        invalid: valid ? [] : tileKeys(patternTiles),
        selected: [],
        heal: false,
      };
    }
    case "equipmentForceProjection": {
      const playerId = preview.playerId;
      if (!playerId || preview.forceProjectionX == null || preview.forceProjectionY == null) return EMPTY;
      const player = state.players.find((p) => p.id === playerId);
      if (!player?.weapon) return EMPTY;
      const spec = resolveCombatAttackSpec(player, player.weapon);
      if (!spec) return EMPTY;
      return computePlayerAttackHighlights(state, playerId, preview, spec, {
        x: preview.forceProjectionX,
        y: preview.forceProjectionY,
      });
    }
    case "omnistrike": {
      const playerId = preview.playerId;
      if (!playerId) return EMPTY;
      return computeOmnistrikeHighlights(state, playerId, preview);
    }
    case "gmEnemyAttack":
      return computeGmEnemyAttackHighlights(state, preview);
    default:
      return EMPTY;
  }
}

export function clearAttackPreview(state: GameState, actorId?: string) {
  if (!state.combat?.attackPreview) return;
  const preview = state.combat.attackPreview;
  if (!actorId) {
    state.combat.attackPreview = null;
    return;
  }
  if (preview.mode === "gmEnemyAttack" || preview.playerId === actorId) {
    state.combat.attackPreview = null;
  }
}
