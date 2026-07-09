import { coordKey, tileAt, type MapTile, type TerrainType, type TilePaintPreset } from "@gaem/shared";
import { computed, ref, watch } from "vue";

import {
  BUNDLED_TILE_APPEARANCES,
  bundledTileAppearanceUrl,
  isBundledTileAppearanceKey,
} from "../lib/bundledTileAppearances.js";
import { useApi } from "./useApi.js";
import { useBoardActionMode } from "./useBoardActionMode.js";
import { useEnemySpawnSelection } from "./useEnemySpawnSelection.js";
import { useGameState } from "./useGameState.js";

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
const paintbrushEnableElevation = ref(true);
const paintbrushEnableTerrain = ref(true);
const paintbrushEnableEffect = ref(true);
const paintbrushEnableName = ref(true);
const paintbrushEnableColor = ref(true);
const paintbrushEnableAppearance = ref(true);
const paintbrushPresets = ref<Record<string, TilePaintPreset>>({});
const paintbrushPresetLoadId = ref("");
const paintbrushPresetError = ref("");
const paintbrushAppearanceUploading = ref(false);
const paintbrushEyedropperActive = ref(false);

export function clearActiveTool() {
  activeTool.value = null;
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
    if (tool !== "paintbrush") paintbrushEyedropperActive.value = false;
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
    return {
      elevation: tile.elevation,
      terrain: tile.terrain[0] ?? "standard",
      tileEffectId: effectId,
      tileEffectStacks: effectStacks,
      tileName: tile.name ?? "",
      ...(tile.baseColor ? { baseColor: tile.baseColor } : {}),
      ...(tile.appearanceKey ? { appearanceKey: tile.appearanceKey } : {}),
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

  function resetPaintbrushSettings() {
    paintbrushElevation.value = 0;
    paintbrushTerrain.value = "standard";
    paintbrushEffectId.value = GM_TILE_EFFECT_NONE;
    paintbrushEffectStacks.value = 1;
    paintbrushTileName.value = "";
    paintbrushBaseColor.value = null;
    paintbrushAppearanceKey.value = null;
    clearPaintbrushAppearancePreview();
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
    if (preset.appearanceKey) setPaintbrushAppearancePreview(preset.appearanceKey);
    else clearPaintbrushAppearancePreview();
  }

  function selectBundledPaintbrushAppearance(key: string) {
    paintbrushAppearanceKey.value = key;
    setPaintbrushAppearancePreview(key);
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

  function clearPaintbrushAppearance() {
    paintbrushAppearanceKey.value = null;
    clearPaintbrushAppearancePreview();
  }

  function setAllPaintbrushOptionsEnabled(enabled: boolean) {
    paintbrushEnableElevation.value = enabled;
    paintbrushEnableTerrain.value = enabled;
    paintbrushEnableEffect.value = enabled;
    paintbrushEnableName.value = enabled;
    paintbrushEnableColor.value = enabled;
    paintbrushEnableAppearance.value = enabled;
  }

  function enableAllPaintbrushOptions() {
    setAllPaintbrushOptionsEnabled(true);
  }

  function disableAllPaintbrushOptions() {
    setAllPaintbrushOptionsEnabled(false);
  }

  function applyPaintbrushToTile(x: number, y: number) {
    const sel = bulkSelection.value;
    const coords =
      sel?.kind === "tiles" && sel.coords.some((c) => c.x === x && c.y === y)
        ? sel.coords
        : [{ x, y }];
    const payload: {
      type: "gmPaintTile";
      coords: { x: number; y: number }[];
      elevation?: number;
      terrain?: TerrainType;
      tileEffects?: string[];
      tileName?: string;
      baseColor?: string | null;
      appearanceKey?: string | null;
    } = { type: "gmPaintTile", coords };
    if (paintbrushEnableElevation.value) payload.elevation = paintbrushElevation.value;
    if (paintbrushEnableTerrain.value) payload.terrain = paintbrushTerrain.value;
    if (paintbrushEnableEffect.value) {
      payload.tileEffects =
        paintbrushEffectId.value && paintbrushEffectStacks.value !== 0
          ? [`${paintbrushEffectId.value}:${paintbrushEffectStacks.value}`]
          : [];
    }
    if (paintbrushEnableName.value) payload.tileName = paintbrushTileName.value;
    if (paintbrushEnableColor.value) payload.baseColor = paintbrushBaseColor.value;
    if (paintbrushEnableAppearance.value) payload.appearanceKey = paintbrushAppearanceKey.value;
    if (
      payload.elevation === undefined &&
      payload.terrain === undefined &&
      payload.tileEffects === undefined &&
      payload.tileName === undefined &&
      payload.baseColor === undefined &&
      payload.appearanceKey === undefined
    ) {
      return;
    }
    send(payload);
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
    paintbrushEnableElevation,
    paintbrushEnableTerrain,
    paintbrushEnableEffect,
    paintbrushEnableName,
    paintbrushEnableColor,
    paintbrushEnableAppearance,
    paintbrushPresets,
    paintbrushPresetLoadId,
    paintbrushPresetNames,
    paintbrushPresetError,
    paintbrushAppearanceUploading,
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
    applyPaintbrushToTile,
    samplePaintbrushFromTile,
    setPaintbrushEyedropperActive,
    loadSelectedPreset,
    saveCurrentPreset,
    deleteSelectedPreset,
    uploadPaintbrushAppearance,
    clearPaintbrushAppearance,
    selectBundledPaintbrushAppearance,
    bundledTileAppearances: BUNDLED_TILE_APPEARANCES,
    refreshPaintbrushPresets,
  };
}
