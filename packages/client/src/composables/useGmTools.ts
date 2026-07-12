import { coordKey, tileAt, type MapTile, type TerrainType, type TileImageRotation, type TilePaintPreset } from "@gaem/shared";
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
  bundledTileFeatureUrl,
  featureGalleryEntries,
  isBundledTileFeatureKey,
  isFeatureGroupKey,
  resolveFeatureKeyForPaint,
} from "../lib/bundledTileFeatures.js";
import { useApi } from "./useApi.js";
import { useBoardActionMode } from "./useBoardActionMode.js";
import { useEnemySpawnSelection } from "./useEnemySpawnSelection.js";
import { activeTab } from "./useGameConsole.js";
import { useGameState } from "./useGameState.js";
import { activeMainTab } from "./useMainSectionTab.js";

export type GmTool = "select" | "damageEffect" | "forceMove" | "paintbrush";
export type GmSelectTargetKind = "tiles" | "enemies" | "players";

export type GmBulkSelection =
  | { kind: "tiles"; coords: { x: number; y: number }[] }
  | { kind: "players"; ids: string[] }
  | { kind: "enemies"; ids: string[] };

export const GM_EFFECT_NONE = "";
export const GM_TILE_EFFECT_NONE = "";

const activeTool = ref<GmTool | null>(null);
const selectTargetKind = ref<GmSelectTargetKind>("enemies");
const bulkSelection = ref<GmBulkSelection | null>(null);
const damageAmount = ref(0);
const effectId = ref(GM_EFFECT_NONE);
const effectStacks = ref(1);
const paintbrushElevation = ref(0);
const paintbrushTerrain = ref<TerrainType>("standard");
const paintbrushEffectId = ref(GM_TILE_EFFECT_NONE);
const paintbrushEffectStacks = ref(1);
const paintbrushTileName = ref("");
const paintbrushBaseColor = ref<string | null>(null);
const paintbrushAppearanceKey = ref<string | null>(null);
const paintbrushAppearancePreviewUrl = ref<string | null>(null);
const paintbrushAppearanceSetId = ref(BUNDLED_TILE_SETS[0]?.id ?? "basic");
const paintbrushFeatureKey = ref<string | null>(null);
const paintbrushFeaturePreviewUrl = ref<string | null>(null);
const paintbrushEnableElevation = ref(true);
const paintbrushEnableTerrain = ref(true);
const paintbrushEnableEffect = ref(true);
const paintbrushEnableName = ref(true);
const paintbrushEnableColor = ref(true);
const paintbrushEnableAppearance = ref(true);
const paintbrushEnableFeature = ref(true);
const paintbrushImageRotation = ref<TileImageRotation>(0);
const paintbrushImageFlip = ref(false);
const paintbrushEnableRotation = ref(true);
const paintbrushEnableFlip = ref(true);
const paintbrushPresets = ref<Record<string, TilePaintPreset>>({});
const paintbrushPresetLoadId = ref("");
const paintbrushPresetError = ref("");
const paintbrushAppearanceUploading = ref(false);
const paintbrushFeatureUploading = ref(false);
const paintbrushEyedropperActive = ref(false);

type PendingTilePlacement = {
  brushAppearance: string | null | undefined;
  brushFeature: string | null | undefined;
  appearanceKey: string | null | undefined;
  featureKey: string | null | undefined;
};

const pendingTilePlacements = new Map<string, PendingTilePlacement>();

function clearPendingTilePlacements() {
  pendingTilePlacements.clear();
}

export function clearActiveTool() {
  activeTool.value = null;
}

watch(activeMainTab, (tab) => {
  if (tab !== "taccom") clearActiveTool();
});

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

  const bundledTileFeatures = computed(() => featureGalleryEntries());

  function syncPaintbrushAppearanceSetFromKey(key: string | null | undefined) {
    if (!key) return;
    const setId = setIdFromAppearanceKey(key);
    if (setId) paintbrushAppearanceSetId.value = setId;
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
    }
  });

  watch([paintbrushAppearanceKey, paintbrushFeatureKey], clearPendingTilePlacements);

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
    return {
      elevation: tile.elevation,
      terrain: tile.terrain[0] ?? "standard",
      tileEffectId: effectId,
      tileEffectStacks: effectStacks,
      tileName: tile.name ?? "",
      ...(tile.baseColor ? { baseColor: tile.baseColor } : {}),
      ...(tile.appearanceKey ? { appearanceKey: tile.appearanceKey } : {}),
      ...(tile.featureKey ? { featureKey: tile.featureKey } : {}),
      ...(tile.imageRotation ? { imageRotation: tile.imageRotation } : {}),
      ...(tile.imageFlip ? { imageFlip: true } : {}),
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

  function applyDamageEffectToToken(target: { kind: "player" | "enemy"; id: string }) {
    const damage = damageAmount.value;
    if (damage > 0) {
      send({ type: "gmApplyDamage", target, amount: damage });
    }
    if (effectId.value && effectStacks.value !== 0) {
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

  function resetPaintbrushSettings() {
    paintbrushElevation.value = 0;
    paintbrushTerrain.value = "standard";
    paintbrushEffectId.value = GM_TILE_EFFECT_NONE;
    paintbrushEffectStacks.value = 1;
    paintbrushTileName.value = "";
    paintbrushBaseColor.value = null;
    paintbrushAppearanceKey.value = null;
    clearPaintbrushAppearancePreview();
    paintbrushFeatureKey.value = null;
    clearPaintbrushFeaturePreview();
    paintbrushImageRotation.value = 0;
    paintbrushImageFlip.value = false;
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
      ...(paintbrushBaseColor.value ? { baseColor: paintbrushBaseColor.value } : {}),
      ...(paintbrushAppearanceKey.value ? { appearanceKey: paintbrushAppearanceKey.value } : {}),
      ...(paintbrushFeatureKey.value ? { featureKey: paintbrushFeatureKey.value } : {}),
      ...(paintbrushImageRotation.value ? { imageRotation: paintbrushImageRotation.value } : {}),
      ...(paintbrushImageFlip.value ? { imageFlip: true } : {}),
    };
  }

  function applyPresetToBrush(preset: TilePaintPreset) {
    paintbrushElevation.value = preset.elevation;
    paintbrushTerrain.value = preset.terrain;
    paintbrushEffectId.value = preset.tileEffectId;
    paintbrushEffectStacks.value = preset.tileEffectStacks;
    paintbrushTileName.value = preset.tileName;
    paintbrushBaseColor.value = preset.baseColor ?? null;
    paintbrushAppearanceKey.value = preset.appearanceKey ?? null;
    syncPaintbrushAppearanceSetFromKey(preset.appearanceKey);
    if (preset.appearanceKey) setPaintbrushAppearancePreview(preset.appearanceKey);
    else clearPaintbrushAppearancePreview();
    paintbrushFeatureKey.value = preset.featureKey ?? null;
    if (preset.featureKey) setPaintbrushFeaturePreview(preset.featureKey);
    else clearPaintbrushFeaturePreview();
    paintbrushImageRotation.value = preset.imageRotation ?? 0;
    paintbrushImageFlip.value = preset.imageFlip ?? false;
  }

  function selectBundledPaintbrushAppearance(key: string) {
    paintbrushAppearanceKey.value = key;
    syncPaintbrushAppearanceSetFromKey(key);
    setPaintbrushAppearancePreview(key);
  }

  function selectBundledPaintbrushFeature(key: string) {
    paintbrushFeatureKey.value = key;
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
    paintbrushEnableName.value = enabled;
    paintbrushEnableColor.value = enabled;
    paintbrushEnableAppearance.value = enabled;
    paintbrushEnableFeature.value = enabled;
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
    paintbrushImageRotation.value = ((paintbrushImageRotation.value + 90) % 360) as TileImageRotation;
  }

  function togglePaintbrushImageFlip() {
    paintbrushImageFlip.value = !paintbrushImageFlip.value;
  }

  function ensurePendingTilePlacement(x: number, y: number): PendingTilePlacement {
    const key = coordKey(x, y);
    const brushAppearance = paintbrushEnableAppearance.value
      ? paintbrushAppearanceKey.value
      : undefined;
    const brushFeature = paintbrushEnableFeature.value
      ? paintbrushFeatureKey.value
      : undefined;
    const existing = pendingTilePlacements.get(key);
    if (
      existing &&
      existing.brushAppearance === brushAppearance &&
      existing.brushFeature === brushFeature
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
    };
  }

  function applyPaintbrushToTile(x: number, y: number) {
    const sel = bulkSelection.value;
    const coords =
      sel?.kind === "tiles" && sel.coords.some((c) => c.x === x && c.y === y)
        ? sel.coords
        : [{ x, y }];
    const shared: {
      elevation?: number;
      terrain?: TerrainType;
      tileEffects?: string[];
      tileName?: string;
      baseColor?: string | null;
      imageRotation?: TileImageRotation | null;
      imageFlip?: boolean | null;
    } = {};
    if (paintbrushEnableElevation.value) shared.elevation = paintbrushElevation.value;
    if (paintbrushEnableTerrain.value) shared.terrain = paintbrushTerrain.value;
    if (paintbrushEnableEffect.value) {
      shared.tileEffects =
        paintbrushEffectId.value && paintbrushEffectStacks.value !== 0
          ? [`${paintbrushEffectId.value}:${paintbrushEffectStacks.value}`]
          : [];
    }
    if (paintbrushEnableName.value) shared.tileName = paintbrushTileName.value;
    if (paintbrushEnableColor.value) shared.baseColor = paintbrushBaseColor.value;
    if (paintbrushEnableRotation.value) {
      shared.imageRotation = paintbrushImageRotation.value || null;
    }
    if (paintbrushEnableFlip.value) {
      shared.imageFlip = paintbrushImageFlip.value || null;
    }

    const brushAppearance = paintbrushEnableAppearance.value
      ? paintbrushAppearanceKey.value
      : undefined;
    const brushFeature = paintbrushEnableFeature.value
      ? paintbrushFeatureKey.value
      : undefined;

    if (
      shared.elevation === undefined &&
      shared.terrain === undefined &&
      shared.tileEffects === undefined &&
      shared.tileName === undefined &&
      shared.baseColor === undefined &&
      shared.imageRotation === undefined &&
      shared.imageFlip === undefined &&
      brushAppearance === undefined &&
      brushFeature === undefined
    ) {
      return;
    }

    const needsPerTileResolve =
      (brushAppearance !== undefined &&
        brushAppearance !== null &&
        isAppearanceGroupKey(brushAppearance)) ||
      (brushFeature !== undefined && brushFeature !== null && isFeatureGroupKey(brushFeature));

    // Per-tile resolve (groups + any cell with a pending hover pick) so preview matches paint.
    if (needsPerTileResolve || coords.length === 1) {
      for (const coord of coords) {
        const placement = takePendingTilePlacement(coord.x, coord.y);
        send({
          type: "gmPaintTile",
          coords: [coord],
          ...shared,
          ...(placement.appearanceKey !== undefined
            ? { appearanceKey: placement.appearanceKey }
            : {}),
          ...(placement.featureKey !== undefined ? { featureKey: placement.featureKey } : {}),
        });
      }
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
    paintbrushBaseColor,
    paintbrushAppearanceKey,
    paintbrushAppearancePreviewUrl,
    paintbrushAppearanceSetId,
    paintbrushFeatureKey,
    paintbrushFeaturePreviewUrl,
    paintbrushImageRotation,
    paintbrushImageFlip,
    paintbrushEnableElevation,
    paintbrushEnableTerrain,
    paintbrushEnableEffect,
    paintbrushEnableName,
    paintbrushEnableColor,
    paintbrushEnableAppearance,
    paintbrushEnableFeature,
    paintbrushEnableRotation,
    paintbrushEnableFlip,
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
    bundledTileFeatures,
    refreshPaintbrushPresets,
  };
}
