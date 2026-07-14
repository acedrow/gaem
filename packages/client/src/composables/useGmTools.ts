import {
  DEFAULT_OBSTACLE_HP,
  coordKey,
  getObstacleHp,
  tileAt,
  TILE_IMAGE_ROTATIONS,
  type MapTile,
  type TerrainType,
  type TileColorTint,
  type TileImageRotation,
  type TilePaintPreset,
} from "@gaem/shared";
import { computed, ref, watch } from "vue";

import {
  BUNDLED_TILE_SETS,
  bundledTileAppearanceUrl,
  galleryEntriesForSet,
  isAppearanceGroupKey,
  isBundledTileAppearanceKey,
  resolveAppearanceKeyForPaint,
  setIdFromAppearanceKey,
} from "../lib/bundledTileAppearances.js";
import {
  BUNDLED_TILE_FEATURE_SETS,
  bundledTileFeatureUrl,
  galleryEntriesForFeatureSet,
  isBundledTileFeatureKey,
  isFeatureGroupKey,
  resolveFeatureKeyForPaint,
  setIdFromFeatureKey,
} from "../lib/bundledTileFeatures.js";
import { useApi } from "./useApi.js";
import { useBoardActionMode } from "./useBoardActionMode.js";
import { useEnemySpawnSelection } from "./useEnemySpawnSelection.js";
import { activeTab } from "./useGameConsole.js";
import { useGameState } from "./useGameState.js";
import { activeMainTab } from "./useMainSectionTab.js";
import { readPersistedUi, type PersistedGmTools } from "./uiPersist.js";

export type GmTool = "select" | "damageEffect" | "forceMove" | "paintbrush";
export type GmSelectTargetKind = "tiles" | "enemies" | "players";

export type GmBulkSelection =
  | { kind: "tiles"; coords: { x: number; y: number }[] }
  | { kind: "players"; ids: string[] }
  | { kind: "enemies"; ids: string[] };

export const GM_EFFECT_NONE = "";
export const GM_TILE_EFFECT_NONE = "";

const persistedGm = readPersistedUi().gmTools;

const activeTool = ref<GmTool | null>(persistedGm.activeTool);
const selectTargetKind = ref<GmSelectTargetKind>(persistedGm.selectTargetKind);
const bulkSelection = ref<GmBulkSelection | null>(null);
const damageAmount = ref(persistedGm.damageAmount);
const effectId = ref(persistedGm.effectId);
const effectStacks = ref(persistedGm.effectStacks);
const paintbrushElevation = ref(persistedGm.paintbrushElevation);
const paintbrushTerrain = ref<TerrainType>(persistedGm.paintbrushTerrain);
const paintbrushEffectId = ref(persistedGm.paintbrushEffectId);
const paintbrushEffectStacks = ref(persistedGm.paintbrushEffectStacks);
const paintbrushTileName = ref(persistedGm.paintbrushTileName);
const paintbrushObstacleHp = ref(persistedGm.paintbrushObstacleHp);
const paintbrushBaseColor = ref<string | null>(persistedGm.paintbrushBaseColor);
const paintbrushAppearanceTint = ref<TileColorTint | null>(persistedGm.paintbrushAppearanceTint);
const paintbrushFeatureTint = ref<TileColorTint | null>(persistedGm.paintbrushFeatureTint);
const paintbrushAppearanceKey = ref<string | null | undefined>(persistedGm.paintbrushAppearanceKey);
const paintbrushAppearancePreviewUrl = ref<string | null>(null);
const paintbrushAppearanceSetId = ref(persistedGm.paintbrushAppearanceSetId);
const paintbrushFeatureKey = ref<string | null | undefined>(persistedGm.paintbrushFeatureKey);
const paintbrushFeaturePreviewUrl = ref<string | null>(null);
const paintbrushFeatureSetId = ref(persistedGm.paintbrushFeatureSetId);
const paintbrushEnableElevation = ref(persistedGm.paintbrushEnableElevation);
const paintbrushEnableTerrain = ref(persistedGm.paintbrushEnableTerrain);
const paintbrushEnableEffect = ref(persistedGm.paintbrushEnableEffect);
const paintbrushEnableObstacleHp = ref(persistedGm.paintbrushEnableObstacleHp);
const paintbrushEnableName = ref(persistedGm.paintbrushEnableName);
const paintbrushEnableColor = ref(persistedGm.paintbrushEnableColor);
const paintbrushEnableAppearance = ref(persistedGm.paintbrushEnableAppearance);
const paintbrushEnableFeature = ref(persistedGm.paintbrushEnableFeature);
const paintbrushEnableAppearanceTint = ref(persistedGm.paintbrushEnableAppearanceTint);
const paintbrushEnableFeatureTint = ref(persistedGm.paintbrushEnableFeatureTint);
const paintbrushImageRotation = ref<TileImageRotation>(persistedGm.paintbrushImageRotation);
const paintbrushImageFlip = ref(persistedGm.paintbrushImageFlip);
const paintbrushEnableRotation = ref(persistedGm.paintbrushEnableRotation);
const paintbrushEnableFlip = ref(persistedGm.paintbrushEnableFlip);
const paintbrushAutoRotate = ref(persistedGm.paintbrushAutoRotate);
const paintbrushPresets = ref<Record<string, TilePaintPreset>>({});
const paintbrushPresetLoadId = ref("");
const paintbrushPresetError = ref("");
const paintbrushAppearanceUploading = ref(false);
const paintbrushFeatureUploading = ref(false);
const paintbrushEyedropperActive = ref(false);
const paintbrushSuppressPreviewKey = ref<string | null>(null);

type PendingTilePlacement = {
  brushAppearance: string | null | undefined;
  brushFeature: string | null | undefined;
  appearanceKey: string | null | undefined;
  featureKey: string | null | undefined;
  imageRotation: TileImageRotation | undefined;
};

const pendingTilePlacements = new Map<string, PendingTilePlacement>();

function clearPendingTilePlacements() {
  pendingTilePlacements.clear();
}

function clearPaintbrushSuppressPreview() {
  paintbrushSuppressPreviewKey.value = null;
}

export function snapshotGmTools(): PersistedGmTools {
  return {
    activeTool: activeTool.value,
    selectTargetKind: selectTargetKind.value,
    damageAmount: damageAmount.value,
    effectId: effectId.value,
    effectStacks: effectStacks.value,
    paintbrushElevation: paintbrushElevation.value,
    paintbrushTerrain: paintbrushTerrain.value,
    paintbrushEffectId: paintbrushEffectId.value,
    paintbrushEffectStacks: paintbrushEffectStacks.value,
    paintbrushTileName: paintbrushTileName.value,
    paintbrushObstacleHp: paintbrushObstacleHp.value,
    paintbrushBaseColor: paintbrushBaseColor.value,
    paintbrushAppearanceTint: paintbrushAppearanceTint.value,
    paintbrushFeatureTint: paintbrushFeatureTint.value,
    paintbrushAppearanceKey: paintbrushAppearanceKey.value,
    paintbrushAppearanceSetId: paintbrushAppearanceSetId.value,
    paintbrushFeatureKey: paintbrushFeatureKey.value,
    paintbrushFeatureSetId: paintbrushFeatureSetId.value,
    paintbrushImageRotation: paintbrushImageRotation.value,
    paintbrushImageFlip: paintbrushImageFlip.value,
    paintbrushAutoRotate: paintbrushAutoRotate.value,
    paintbrushEnableElevation: paintbrushEnableElevation.value,
    paintbrushEnableTerrain: paintbrushEnableTerrain.value,
    paintbrushEnableEffect: paintbrushEnableEffect.value,
    paintbrushEnableObstacleHp: paintbrushEnableObstacleHp.value,
    paintbrushEnableName: paintbrushEnableName.value,
    paintbrushEnableColor: paintbrushEnableColor.value,
    paintbrushEnableAppearance: paintbrushEnableAppearance.value,
    paintbrushEnableFeature: paintbrushEnableFeature.value,
    paintbrushEnableAppearanceTint: paintbrushEnableAppearanceTint.value,
    paintbrushEnableFeatureTint: paintbrushEnableFeatureTint.value,
    paintbrushEnableRotation: paintbrushEnableRotation.value,
    paintbrushEnableFlip: paintbrushEnableFlip.value,
  };
}

export const gmToolsWatchSources = [
  activeTool,
  selectTargetKind,
  damageAmount,
  effectId,
  effectStacks,
  paintbrushElevation,
  paintbrushTerrain,
  paintbrushEffectId,
  paintbrushEffectStacks,
  paintbrushTileName,
  paintbrushObstacleHp,
  paintbrushBaseColor,
  paintbrushAppearanceTint,
  paintbrushFeatureTint,
  paintbrushAppearanceKey,
  paintbrushAppearanceSetId,
  paintbrushFeatureKey,
  paintbrushFeatureSetId,
  paintbrushImageRotation,
  paintbrushImageFlip,
  paintbrushAutoRotate,
  paintbrushEnableElevation,
  paintbrushEnableTerrain,
  paintbrushEnableEffect,
  paintbrushEnableObstacleHp,
  paintbrushEnableName,
  paintbrushEnableColor,
  paintbrushEnableAppearance,
  paintbrushEnableFeature,
  paintbrushEnableAppearanceTint,
  paintbrushEnableFeatureTint,
  paintbrushEnableRotation,
  paintbrushEnableFlip,
];

export function clearActiveTool() {
  activeTool.value = null;
}

watch(activeMainTab, (tab) => {
  if (tab !== "taccom") clearActiveTool();
});

let syncPaintbrushPreviewsFromKeys: (() => void) | null = null;

export function applyPersistedGmTools(gm: PersistedGmTools) {
  activeTool.value = gm.activeTool;
  selectTargetKind.value = gm.selectTargetKind;
  damageAmount.value = gm.damageAmount;
  effectId.value = gm.effectId;
  effectStacks.value = gm.effectStacks;
  paintbrushElevation.value = gm.paintbrushElevation;
  paintbrushTerrain.value = gm.paintbrushTerrain;
  paintbrushEffectId.value = gm.paintbrushEffectId;
  paintbrushEffectStacks.value = gm.paintbrushEffectStacks;
  paintbrushTileName.value = gm.paintbrushTileName;
  paintbrushObstacleHp.value = gm.paintbrushObstacleHp;
  paintbrushBaseColor.value = gm.paintbrushBaseColor;
  paintbrushAppearanceTint.value = gm.paintbrushAppearanceTint;
  paintbrushFeatureTint.value = gm.paintbrushFeatureTint;
  paintbrushAppearanceKey.value = gm.paintbrushAppearanceKey;
  paintbrushAppearanceSetId.value = gm.paintbrushAppearanceSetId;
  paintbrushFeatureKey.value = gm.paintbrushFeatureKey;
  paintbrushFeatureSetId.value = gm.paintbrushFeatureSetId;
  paintbrushImageRotation.value = gm.paintbrushImageRotation;
  paintbrushImageFlip.value = gm.paintbrushImageFlip;
  paintbrushAutoRotate.value = gm.paintbrushAutoRotate;
  paintbrushEnableElevation.value = gm.paintbrushEnableElevation;
  paintbrushEnableTerrain.value = gm.paintbrushEnableTerrain;
  paintbrushEnableEffect.value = gm.paintbrushEnableEffect;
  paintbrushEnableObstacleHp.value = gm.paintbrushEnableObstacleHp;
  paintbrushEnableName.value = gm.paintbrushEnableName;
  paintbrushEnableColor.value = gm.paintbrushEnableColor;
  paintbrushEnableAppearance.value = gm.paintbrushEnableAppearance;
  paintbrushEnableFeature.value = gm.paintbrushEnableFeature;
  paintbrushEnableAppearanceTint.value = gm.paintbrushEnableAppearanceTint;
  paintbrushEnableFeatureTint.value = gm.paintbrushEnableFeatureTint;
  paintbrushEnableRotation.value = gm.paintbrushEnableRotation;
  paintbrushEnableFlip.value = gm.paintbrushEnableFlip;
  syncPaintbrushPreviewsFromKeys?.();
}

export function useGmTools() {
  const { clearMode } = useBoardActionMode();
  const { clearSpawnEnemySelection } = useEnemySpawnSelection();
  const { send, gameState } = useGameState();
  const {
    fetchTilePresets,
    saveTilePreset,
    deleteTilePreset,
    uploadTileAppearance,
    fetchTileAppearanceUrl,
  } = useApi();

  const bulkSelectionCount = computed(() => {
    const sel = bulkSelection.value;
    if (!sel) return 0;
    if (sel.kind === "tiles") return sel.coords.length;
    return sel.ids.length;
  });

  const paintbrushPresetNames = computed(() =>
    Object.keys(paintbrushPresets.value).sort((a, b) => a.localeCompare(b)),
  );

  const bundledTileAppearancesForSet = computed(() =>
    galleryEntriesForSet(paintbrushAppearanceSetId.value),
  );

  const bundledTileFeaturesForSet = computed(() =>
    galleryEntriesForFeatureSet(paintbrushFeatureSetId.value),
  );

  function syncPaintbrushAppearanceSetFromKey(key: string | null | undefined) {
    if (!key) return;
    const setId = setIdFromAppearanceKey(key);
    if (setId) paintbrushAppearanceSetId.value = setId;
  }

  function syncPaintbrushFeatureSetFromKey(key: string | null | undefined) {
    if (!key) return;
    const setId = setIdFromFeatureKey(key);
    if (setId) paintbrushFeatureSetId.value = setId;
  }

  async function refreshPaintbrushPresets() {
    const mapId = gameState.value?.mapId;
    if (!mapId) {
      paintbrushPresets.value = {};
      return;
    }
    paintbrushPresets.value = await fetchTilePresets(mapId);
  }

  watch(activeTool, (tool) => {
    if (tool === "paintbrush") void refreshPaintbrushPresets();
    if (tool !== "paintbrush") {
      paintbrushEyedropperActive.value = false;
      clearPendingTilePlacements();
      clearPaintbrushSuppressPreview();
    }
  });

  watch(
    [paintbrushAppearanceKey, paintbrushFeatureKey, paintbrushAutoRotate, paintbrushEnableRotation],
    clearPendingTilePlacements,
  );

  watch([paintbrushEnableRotation, paintbrushAutoRotate], () => {
    paintbrushImageRotation.value = 0;
  });

  function setPaintbrushEyedropperActive(active: boolean) {
    if (activeTool.value !== "paintbrush") {
      paintbrushEyedropperActive.value = false;
      return;
    }
    paintbrushEyedropperActive.value = active;
  }

  function tileToPaintPreset(tile: MapTile): TilePaintPreset {
    const effects = Object.entries(tile.tileEffects ?? {})
      .filter(([, stacks]) => stacks !== 0)
      .sort(([a], [b]) => a.localeCompare(b));
    const [effectId, effectStacks] = effects[0] ?? [GM_TILE_EFFECT_NONE, 1];
    const terrain = tile.terrain[0] ?? "standard";
    return {
      elevation: tile.elevation,
      terrain,
      tileEffectId: effectId,
      tileEffectStacks: effectStacks,
      tileName: tile.name ?? "",
      ...(terrain === "obstacle" ? { obstacleHp: getObstacleHp(tile) } : {}),
      ...(tile.baseColor ? { baseColor: tile.baseColor } : {}),
      ...(tile.appearanceKey ? { appearanceKey: tile.appearanceKey } : {}),
      ...(tile.featureKey ? { featureKey: tile.featureKey } : {}),
      ...(tile.appearanceTint ? { appearanceTint: { ...tile.appearanceTint } } : {}),
      ...(tile.featureTint ? { featureTint: { ...tile.featureTint } } : {}),
      ...(tile.appearanceRotation ? { appearanceRotation: tile.appearanceRotation } : {}),
      ...(tile.appearanceFlip ? { appearanceFlip: true } : {}),
      ...(tile.featureRotation ? { featureRotation: tile.featureRotation } : {}),
      ...(tile.featureFlip ? { featureFlip: true } : {}),
    };
  }

  function samplePaintbrushFromTile(x: number, y: number) {
    const s = gameState.value;
    if (!s) return;
    const tile = tileAt(s.tiles, x, y);
    if (!tile) return;
    applyPresetToBrush(tileToPaintPreset(tile));
  }

  function setActiveTool(tool: GmTool) {
    if (activeTool.value === tool) {
      clearActiveTool();
      return;
    }
    clearMode();
    clearSpawnEnemySelection();
    if (tool === "damageEffect") {
      effectId.value = GM_EFFECT_NONE;
    }
    activeTool.value = tool;
    activeTab.value = "info";
  }

  function setBulkSelection(selection: GmBulkSelection | null) {
    bulkSelection.value = selection;
  }

  function clearBulkSelection() {
    bulkSelection.value = null;
  }

  function isTileBulkSelected(x: number, y: number): boolean {
    const sel = bulkSelection.value;
    if (sel?.kind !== "tiles") return false;
    return sel.coords.some((c) => c.x === x && c.y === y);
  }

  function isPlayerBulkSelected(playerId: string): boolean {
    const sel = bulkSelection.value;
    if (sel?.kind !== "players") return false;
    return sel.ids.includes(playerId);
  }

  function isEnemyBulkSelected(enemyId: string): boolean {
    const sel = bulkSelection.value;
    if (sel?.kind !== "enemies") return false;
    return sel.ids.includes(enemyId);
  }

  function isCellInBulkSelection(x: number, y: number, occ?: {
    playerByKey: Map<string, { id: string }>;
    enemyByKey: Map<string, { id: string }>;
  }): boolean {
    const sel = bulkSelection.value;
    if (!sel) return false;
    if (sel.kind === "tiles") return isTileBulkSelected(x, y);
    if (!occ) return false;
    const key = coordKey(x, y);
    if (sel.kind === "players") {
      const player = occ.playerByKey.get(key);
      return !!player && sel.ids.includes(player.id);
    }
    const enemy = occ.enemyByKey.get(key);
    return !!enemy && sel.ids.includes(enemy.id);
  }

  function applyDamageEffectToToken(
    target:
      | { kind: "player" | "enemy"; id: string }
      | { kind: "obstacle"; x: number; y: number },
  ) {
    const damage = damageAmount.value;
    if (damage > 0) {
      send({ type: "gmApplyDamage", target, amount: damage });
    }
    if (target.kind !== "obstacle" && effectId.value && effectStacks.value !== 0) {
      send({
        type: "applyEffect",
        target,
        effects: [`${effectId.value}:${effectStacks.value}`],
      });
    }
  }

  function clearPaintbrushAppearancePreview() {
    const url = paintbrushAppearancePreviewUrl.value;
    if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
    paintbrushAppearancePreviewUrl.value = null;
  }

  function setPaintbrushAppearancePreview(key: string) {
    clearPaintbrushAppearancePreview();
    if (isBundledTileAppearanceKey(key)) {
      paintbrushAppearancePreviewUrl.value = bundledTileAppearanceUrl(key);
      return;
    }
    void fetchTileAppearanceUrl(key).then((url) => {
      if (url) paintbrushAppearancePreviewUrl.value = url;
    });
  }

  function clearPaintbrushFeaturePreview() {
    const url = paintbrushFeaturePreviewUrl.value;
    if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
    paintbrushFeaturePreviewUrl.value = null;
  }

  function setPaintbrushFeaturePreview(key: string) {
    clearPaintbrushFeaturePreview();
    if (isBundledTileFeatureKey(key)) {
      paintbrushFeaturePreviewUrl.value = bundledTileFeatureUrl(key);
      return;
    }
    void fetchTileAppearanceUrl(key).then((url) => {
      if (url) paintbrushFeaturePreviewUrl.value = url;
    });
  }

  syncPaintbrushPreviewsFromKeys = () => {
    const appearance = paintbrushAppearanceKey.value;
    if (typeof appearance === "string") setPaintbrushAppearancePreview(appearance);
    else clearPaintbrushAppearancePreview();
    const feature = paintbrushFeatureKey.value;
    if (typeof feature === "string") setPaintbrushFeaturePreview(feature);
    else clearPaintbrushFeaturePreview();
  };
  syncPaintbrushPreviewsFromKeys();

  function resetPaintbrushSettings() {
    paintbrushElevation.value = 0;
    paintbrushTerrain.value = "standard";
    paintbrushEffectId.value = GM_TILE_EFFECT_NONE;
    paintbrushEffectStacks.value = 1;
    paintbrushTileName.value = "";
    paintbrushObstacleHp.value = DEFAULT_OBSTACLE_HP;
    paintbrushBaseColor.value = null;
    paintbrushAppearanceTint.value = null;
    paintbrushFeatureTint.value = null;
    paintbrushAppearanceKey.value = undefined;
    clearPaintbrushAppearancePreview();
    paintbrushFeatureKey.value = undefined;
    clearPaintbrushFeaturePreview();
    paintbrushImageRotation.value = 0;
    paintbrushImageFlip.value = false;
    paintbrushEnableAppearanceTint.value = false;
    paintbrushEnableFeatureTint.value = false;
    paintbrushEnableRotation.value = false;
    paintbrushEnableFlip.value = false;
    paintbrushAutoRotate.value = false;
    paintbrushPresetLoadId.value = "";
    paintbrushPresetError.value = "";
  }

  function buildPresetFromBrush(): TilePaintPreset {
    return {
      elevation: paintbrushElevation.value,
      terrain: paintbrushTerrain.value,
      tileEffectId: paintbrushEffectId.value,
      tileEffectStacks: paintbrushEffectStacks.value,
      tileName: paintbrushTileName.value.trim(),
      ...(paintbrushTerrain.value === "obstacle"
        ? { obstacleHp: paintbrushObstacleHp.value }
        : {}),
      ...(paintbrushBaseColor.value ? { baseColor: paintbrushBaseColor.value } : {}),
      ...(paintbrushAppearanceKey.value ? { appearanceKey: paintbrushAppearanceKey.value } : {}),
      ...(paintbrushFeatureKey.value ? { featureKey: paintbrushFeatureKey.value } : {}),
      ...(paintbrushAppearanceTint.value
        ? { appearanceTint: { ...paintbrushAppearanceTint.value } }
        : {}),
      ...(paintbrushFeatureTint.value ? { featureTint: { ...paintbrushFeatureTint.value } } : {}),
      ...(paintbrushAppearanceKey.value && paintbrushImageRotation.value
        ? { appearanceRotation: paintbrushImageRotation.value }
        : {}),
      ...(paintbrushAppearanceKey.value && paintbrushImageFlip.value
        ? { appearanceFlip: true }
        : {}),
      ...(paintbrushFeatureKey.value && paintbrushImageRotation.value
        ? { featureRotation: paintbrushImageRotation.value }
        : {}),
      ...(paintbrushFeatureKey.value && paintbrushImageFlip.value ? { featureFlip: true } : {}),
    };
  }

  function applyPresetToBrush(preset: TilePaintPreset) {
    paintbrushElevation.value = preset.elevation;
    paintbrushTerrain.value = preset.terrain;
    paintbrushEffectId.value = preset.tileEffectId;
    paintbrushEffectStacks.value = preset.tileEffectStacks;
    paintbrushTileName.value = preset.tileName;
    paintbrushObstacleHp.value =
      preset.terrain === "obstacle"
        ? (preset.obstacleHp ?? DEFAULT_OBSTACLE_HP)
        : DEFAULT_OBSTACLE_HP;
    paintbrushBaseColor.value = preset.baseColor ?? null;
    paintbrushAppearanceTint.value = preset.appearanceTint
      ? { ...preset.appearanceTint }
      : null;
    paintbrushFeatureTint.value = preset.featureTint ? { ...preset.featureTint } : null;
    paintbrushAppearanceKey.value = preset.appearanceKey ?? null;
    syncPaintbrushAppearanceSetFromKey(preset.appearanceKey);
    if (preset.appearanceKey) setPaintbrushAppearancePreview(preset.appearanceKey);
    else clearPaintbrushAppearancePreview();
    paintbrushFeatureKey.value = preset.featureKey ?? null;
    syncPaintbrushFeatureSetFromKey(preset.featureKey);
    if (preset.featureKey) setPaintbrushFeaturePreview(preset.featureKey);
    else clearPaintbrushFeaturePreview();
    paintbrushImageRotation.value =
      preset.appearanceRotation ?? preset.featureRotation ?? 0;
    paintbrushImageFlip.value = !!(preset.appearanceFlip || preset.featureFlip);
  }

  function selectBundledPaintbrushAppearance(key: string) {
    paintbrushAppearanceKey.value = key;
    syncPaintbrushAppearanceSetFromKey(key);
    setPaintbrushAppearancePreview(key);
  }

  function selectBundledPaintbrushFeature(key: string) {
    paintbrushFeatureKey.value = key;
    syncPaintbrushFeatureSetFromKey(key);
    setPaintbrushFeaturePreview(key);
  }

  function loadSelectedPreset() {
    const name = paintbrushPresetLoadId.value;
    if (!name) return;
    const preset = paintbrushPresets.value[name];
    if (preset) applyPresetToBrush(preset);
  }

  async function saveCurrentPreset() {
    paintbrushPresetError.value = "";
    const name = paintbrushTileName.value.trim();
    if (!name) {
      paintbrushPresetError.value = "Enter a tile name to save a preset";
      return;
    }
    const mapId = gameState.value?.mapId;
    if (!mapId) return;
    const result = await saveTilePreset(mapId, name, buildPresetFromBrush());
    if (!result.ok) {
      paintbrushPresetError.value = result.error;
      return;
    }
    paintbrushPresets.value = result.presets;
    paintbrushPresetLoadId.value = name;
  }

  async function deleteSelectedPreset() {
    paintbrushPresetError.value = "";
    const name = paintbrushPresetLoadId.value;
    if (!name) return;
    const mapId = gameState.value?.mapId;
    if (!mapId) return;
    paintbrushPresets.value = await deleteTilePreset(mapId, name);
    paintbrushPresetLoadId.value = "";
  }

  async function uploadPaintbrushAppearance(file: File) {
    if (file.type !== "image/png") {
      paintbrushPresetError.value = "Appearance must be a PNG file";
      return;
    }
    paintbrushAppearanceUploading.value = true;
    paintbrushPresetError.value = "";
    try {
      const key = await uploadTileAppearance(file);
      if (!key) {
        paintbrushPresetError.value = "Failed to upload appearance";
        return;
      }
      paintbrushAppearanceKey.value = key;
      clearPaintbrushAppearancePreview();
      paintbrushAppearancePreviewUrl.value = URL.createObjectURL(file);
    } finally {
      paintbrushAppearanceUploading.value = false;
    }
  }

  async function uploadPaintbrushFeature(file: File) {
    if (file.type !== "image/png") {
      paintbrushPresetError.value = "Feature must be a PNG file";
      return;
    }
    paintbrushFeatureUploading.value = true;
    paintbrushPresetError.value = "";
    try {
      const key = await uploadTileAppearance(file);
      if (!key) {
        paintbrushPresetError.value = "Failed to upload feature";
        return;
      }
      paintbrushFeatureKey.value = key;
      clearPaintbrushFeaturePreview();
      paintbrushFeaturePreviewUrl.value = URL.createObjectURL(file);
    } finally {
      paintbrushFeatureUploading.value = false;
    }
  }

  function clearPaintbrushAppearance() {
    paintbrushAppearanceKey.value = null;
    clearPaintbrushAppearancePreview();
  }

  function clearPaintbrushFeature() {
    paintbrushFeatureKey.value = null;
    clearPaintbrushFeaturePreview();
  }

  function setAllPaintbrushOptionsEnabled(enabled: boolean) {
    paintbrushEnableElevation.value = enabled;
    paintbrushEnableTerrain.value = enabled;
    paintbrushEnableEffect.value = enabled;
    paintbrushEnableObstacleHp.value = enabled;
    paintbrushEnableName.value = enabled;
    paintbrushEnableColor.value = enabled;
    paintbrushEnableAppearance.value = enabled;
    paintbrushEnableFeature.value = enabled;
    paintbrushEnableAppearanceTint.value = enabled;
    paintbrushEnableFeatureTint.value = enabled;
    paintbrushEnableRotation.value = enabled;
    paintbrushEnableFlip.value = enabled;
  }

  function enableAllPaintbrushOptions() {
    setAllPaintbrushOptionsEnabled(true);
  }

  function disableAllPaintbrushOptions() {
    setAllPaintbrushOptionsEnabled(false);
  }

  function cyclePaintbrushImageRotation() {
    if (!paintbrushEnableRotation.value) {
      paintbrushEnableRotation.value = true;
      paintbrushImageRotation.value = 0;
      return;
    }
    paintbrushImageRotation.value = ((paintbrushImageRotation.value + 90) % 360) as TileImageRotation;
  }

  function togglePaintbrushImageFlip() {
    if (!paintbrushEnableFlip.value) paintbrushEnableFlip.value = true;
    paintbrushImageFlip.value = !paintbrushImageFlip.value;
  }

  function ensurePendingTilePlacement(x: number, y: number): PendingTilePlacement {
    const key = coordKey(x, y);
    const brushAppearance = paintbrushEnableAppearance.value
      ? paintbrushAppearanceKey.value
      : undefined;
    // Enabled + no selection clears existing features (null), unlike appearance which
    // leaves the tile unchanged when unset (undefined).
    const brushFeature = paintbrushEnableFeature.value
      ? (paintbrushFeatureKey.value ?? null)
      : undefined;
    const autoRotate = paintbrushEnableRotation.value && paintbrushAutoRotate.value;
    const existing = pendingTilePlacements.get(key);
    if (
      existing &&
      existing.brushAppearance === brushAppearance &&
      existing.brushFeature === brushFeature &&
      (existing.imageRotation !== undefined) === autoRotate
    ) {
      return existing;
    }
    const placement: PendingTilePlacement = {
      brushAppearance,
      brushFeature,
      appearanceKey:
        brushAppearance !== undefined
          ? resolveAppearanceKeyForPaint(brushAppearance)
          : undefined,
      featureKey:
        brushFeature !== undefined ? resolveFeatureKeyForPaint(brushFeature) : undefined,
      imageRotation: autoRotate
        ? TILE_IMAGE_ROTATIONS[Math.floor(Math.random() * TILE_IMAGE_ROTATIONS.length)]
        : undefined,
    };
    pendingTilePlacements.set(key, placement);
    return placement;
  }

  function takePendingTilePlacement(x: number, y: number): PendingTilePlacement {
    const placement = ensurePendingTilePlacement(x, y);
    pendingTilePlacements.delete(coordKey(x, y));
    return placement;
  }

  /** Resolved placement for hover preview — matches the next paint on this cell. */
  function peekPaintbrushPlacement(x: number, y: number) {
    const placement = ensurePendingTilePlacement(x, y);

    function urlForKey(key: string | null | undefined): string | null {
      if (!key) return null;
      if (isBundledTileFeatureKey(key)) return bundledTileFeatureUrl(key);
      if (isBundledTileAppearanceKey(key)) return bundledTileAppearanceUrl(key);
      if (key.startsWith("tiles/")) return `/${key}`;
      if (key === paintbrushAppearanceKey.value) return paintbrushAppearancePreviewUrl.value;
      if (key === paintbrushFeatureKey.value) return paintbrushFeaturePreviewUrl.value;
      return null;
    }

    return {
      appearanceKey: placement.appearanceKey,
      featureKey: placement.featureKey,
      appearanceUrl:
        placement.appearanceKey !== undefined ? urlForKey(placement.appearanceKey) : null,
      featureUrl: placement.featureKey !== undefined ? urlForKey(placement.featureKey) : null,
      imageRotation: placement.imageRotation,
    };
  }

  function applyPaintbrushToTile(x: number, y: number) {
    const sel = bulkSelection.value;
    const coords =
      sel?.kind === "tiles" && sel.coords.some((c) => c.x === x && c.y === y)
        ? sel.coords
        : [{ x, y }];
    const autoRotate = paintbrushEnableRotation.value && paintbrushAutoRotate.value;
    const paintAppearance = paintbrushEnableAppearance.value;
    const paintFeature = paintbrushEnableFeature.value;
    const rotateOn = paintbrushEnableRotation.value;
    const flipOn = paintbrushEnableFlip.value;
    const brushRotation = paintbrushImageRotation.value || null;
    const brushFlip = paintbrushImageFlip.value || null;

    const shared: {
      elevation?: number;
      terrain?: TerrainType;
      tileEffects?: string[];
      tileName?: string;
      obstacleHp?: number;
      baseColor?: string | null;
      appearanceTint?: TileColorTint | null;
      featureTint?: TileColorTint | null;
      appearanceRotation?: TileImageRotation | null;
      appearanceFlip?: boolean | null;
      featureRotation?: TileImageRotation | null;
      featureFlip?: boolean | null;
    } = {};
    if (paintbrushEnableElevation.value) shared.elevation = paintbrushElevation.value;
    if (paintbrushEnableTerrain.value) shared.terrain = paintbrushTerrain.value;
    if (paintbrushEnableObstacleHp.value && paintbrushTerrain.value === "obstacle") {
      shared.obstacleHp = paintbrushObstacleHp.value;
    }
    if (paintbrushEnableEffect.value) {
      shared.tileEffects =
        paintbrushEffectId.value && paintbrushEffectStacks.value !== 0
          ? [`${paintbrushEffectId.value}:${paintbrushEffectStacks.value}`]
          : [];
    }
    if (paintbrushEnableName.value) shared.tileName = paintbrushTileName.value;
    if (paintbrushEnableColor.value) shared.baseColor = paintbrushBaseColor.value;
    if (paintbrushEnableAppearanceTint.value) {
      shared.appearanceTint = paintbrushAppearanceTint.value;
    }
    if (paintbrushEnableFeatureTint.value) {
      shared.featureTint = paintbrushFeatureTint.value;
    }
    if (rotateOn && !autoRotate) {
      if (paintAppearance) shared.appearanceRotation = brushRotation;
      if (paintFeature) shared.featureRotation = brushRotation;
    }
    if (flipOn) {
      if (paintAppearance) shared.appearanceFlip = brushFlip;
      if (paintFeature) shared.featureFlip = brushFlip;
    }

    const brushAppearance = paintAppearance ? paintbrushAppearanceKey.value : undefined;
    // Enabled + no selection clears existing features (null), unlike appearance which
    // leaves the tile unchanged when unset (undefined).
    const brushFeature = paintFeature ? (paintbrushFeatureKey.value ?? null) : undefined;

    if (
      shared.elevation === undefined &&
      shared.terrain === undefined &&
      shared.tileEffects === undefined &&
      shared.tileName === undefined &&
      shared.obstacleHp === undefined &&
      shared.baseColor === undefined &&
      shared.appearanceTint === undefined &&
      shared.featureTint === undefined &&
      shared.appearanceRotation === undefined &&
      shared.appearanceFlip === undefined &&
      shared.featureRotation === undefined &&
      shared.featureFlip === undefined &&
      brushAppearance === undefined &&
      brushFeature === undefined
    ) {
      return;
    }

    const needsPerTileResolve =
      autoRotate ||
      (brushAppearance !== undefined &&
        brushAppearance !== null &&
        isAppearanceGroupKey(brushAppearance)) ||
      (brushFeature !== undefined && brushFeature !== null && isFeatureGroupKey(brushFeature));

    // Per-tile resolve (groups + auto-rotate + any cell with a pending hover pick) so preview matches paint.
    if (needsPerTileResolve || coords.length === 1) {
      for (const coord of coords) {
        const placement = takePendingTilePlacement(coord.x, coord.y);
        const rotation = autoRotate ? (placement.imageRotation ?? null) : undefined;
        send({
          type: "gmPaintTile",
          coords: [coord],
          ...shared,
          ...(placement.appearanceKey !== undefined
            ? { appearanceKey: placement.appearanceKey }
            : {}),
          ...(placement.featureKey !== undefined ? { featureKey: placement.featureKey } : {}),
          ...(autoRotate && paintAppearance ? { appearanceRotation: rotation } : {}),
          ...(autoRotate && paintFeature ? { featureRotation: rotation } : {}),
        });
      }
      paintbrushSuppressPreviewKey.value = coordKey(x, y);
      return;
    }

    send({
      type: "gmPaintTile",
      coords,
      ...shared,
      ...(brushAppearance !== undefined
        ? { appearanceKey: resolveAppearanceKeyForPaint(brushAppearance) }
        : {}),
      ...(brushFeature !== undefined
        ? { featureKey: resolveFeatureKeyForPaint(brushFeature) }
        : {}),
    });
    paintbrushSuppressPreviewKey.value = coordKey(x, y);
  }

  return {
    activeTool,
    selectTargetKind,
    bulkSelection,
    bulkSelectionCount,
    damageAmount,
    effectId,
    effectStacks,
    paintbrushElevation,
    paintbrushTerrain,
    paintbrushEffectId,
    paintbrushEffectStacks,
    paintbrushTileName,
    paintbrushObstacleHp,
    paintbrushBaseColor,
    paintbrushAppearanceTint,
    paintbrushFeatureTint,
    paintbrushAppearanceKey,
    paintbrushAppearancePreviewUrl,
    paintbrushAppearanceSetId,
    paintbrushFeatureKey,
    paintbrushFeaturePreviewUrl,
    paintbrushFeatureSetId,
    paintbrushImageRotation,
    paintbrushImageFlip,
    paintbrushAutoRotate,
    paintbrushEnableElevation,
    paintbrushEnableTerrain,
    paintbrushEnableEffect,
    paintbrushEnableObstacleHp,
    paintbrushEnableName,
    paintbrushEnableColor,
    paintbrushEnableAppearance,
    paintbrushEnableFeature,
    paintbrushEnableAppearanceTint,
    paintbrushEnableFeatureTint,
    paintbrushEnableRotation,
    paintbrushEnableFlip,
    paintbrushSuppressPreviewKey,
    paintbrushPresets,
    paintbrushPresetLoadId,
    paintbrushPresetNames,
    paintbrushPresetError,
    paintbrushAppearanceUploading,
    paintbrushFeatureUploading,
    paintbrushEyedropperActive,
    setActiveTool,
    setBulkSelection,
    clearBulkSelection,
    isTileBulkSelected,
    isPlayerBulkSelected,
    isEnemyBulkSelected,
    isCellInBulkSelection,
    applyDamageEffectToToken,
    resetPaintbrushSettings,
    enableAllPaintbrushOptions,
    disableAllPaintbrushOptions,
    cyclePaintbrushImageRotation,
    togglePaintbrushImageFlip,
    peekPaintbrushPlacement,
    clearPaintbrushSuppressPreview,
    applyPaintbrushToTile,
    samplePaintbrushFromTile,
    setPaintbrushEyedropperActive,
    loadSelectedPreset,
    saveCurrentPreset,
    deleteSelectedPreset,
    uploadPaintbrushAppearance,
    clearPaintbrushAppearance,
    selectBundledPaintbrushAppearance,
    uploadPaintbrushFeature,
    clearPaintbrushFeature,
    selectBundledPaintbrushFeature,
    bundledTileSets: BUNDLED_TILE_SETS,
    bundledTileAppearancesForSet,
    bundledTileFeatureSets: BUNDLED_TILE_FEATURE_SETS,
    bundledTileFeaturesForSet,
    refreshPaintbrushPresets,
  };
}
