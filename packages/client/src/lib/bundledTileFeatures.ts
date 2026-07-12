export type BundledTileFeature = {
  name: string;
  key: string;
  url: string;
  /** Subfolder under features/, if this PNG is a randomized group member. */
  groupId?: string;
};

/** Gallery row: a single PNG, or a folder of variants painted at random. */
export type TileFeatureGalleryEntry = {
  kind: "single" | "group";
  name: string;
  /** Brush key — concrete PNG key, or `tiles/features/{groupId}` for groups. */
  key: string;
  url: string;
  members?: BundledTileFeature[];
};

const FEATURES_PREFIX = "tiles/features/";

const featureModules = import.meta.glob(
  "../../../assets/tiles/features/**/*.png",
  { eager: true, query: "?url", import: "default" },
) as Record<string, string>;

function fileBaseName(path: string): string {
  const file = path.split("/").pop() ?? path;
  return file.replace(/\.png$/i, "");
}

/** Parse `.../assets/tiles/features/{file}.png` or `.../features/{groupId}/{file}.png`. */
function featureFromModulePath(path: string): BundledTileFeature | null {
  const marker = "/assets/tiles/features/";
  const idx = path.replace(/\\/g, "/").lastIndexOf(marker);
  if (idx < 0) return null;
  const rel = path.slice(idx + marker.length);
  const parts = rel.split("/");
  if (parts.length === 1 && parts[0]?.toLowerCase().endsWith(".png")) {
    const name = fileBaseName(parts[0]!);
    return {
      name,
      key: `${FEATURES_PREFIX}${name}.png`,
      url: `/tiles/features/${name}.png`,
    };
  }
  if (parts.length === 2 && parts[1]?.toLowerCase().endsWith(".png")) {
    const groupId = parts[0]!;
    const name = fileBaseName(parts[1]!);
    return {
      name,
      groupId,
      key: `${FEATURES_PREFIX}${groupId}/${name}.png`,
      url: `/tiles/features/${groupId}/${name}.png`,
    };
  }
  return null;
}

export const BUNDLED_TILE_FEATURES: BundledTileFeature[] = Object.keys(featureModules)
  .map(featureFromModulePath)
  .filter((f): f is BundledTileFeature => f !== null)
  .sort((a, b) => a.key.localeCompare(b.key));

const featureByKey = new Map(BUNDLED_TILE_FEATURES.map((f) => [f.key, f]));

const groupsByKey = new Map<string, BundledTileFeature[]>();
for (const feature of BUNDLED_TILE_FEATURES) {
  if (!feature.groupId) continue;
  const groupKey = `${FEATURES_PREFIX}${feature.groupId}`;
  const list = groupsByKey.get(groupKey) ?? [];
  list.push(feature);
  groupsByKey.set(groupKey, list);
}
for (const list of groupsByKey.values()) {
  list.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

export function featureGalleryEntries(): TileFeatureGalleryEntry[] {
  const entries: TileFeatureGalleryEntry[] = [];
  const seenGroups = new Set<string>();

  for (const feature of BUNDLED_TILE_FEATURES) {
    if (feature.groupId) {
      const groupKey = `${FEATURES_PREFIX}${feature.groupId}`;
      if (seenGroups.has(groupKey)) continue;
      seenGroups.add(groupKey);
      const members = groupsByKey.get(groupKey) ?? [feature];
      const preview = members[0]!;
      entries.push({
        kind: "group",
        name: feature.groupId,
        key: groupKey,
        url: preview.url,
        members,
      });
      continue;
    }
    entries.push({
      kind: "single",
      name: feature.name,
      key: feature.key,
      url: feature.url,
    });
  }

  return entries.sort((a, b) => a.name.localeCompare(b.name));
}

export function isFeatureGroupKey(key: string): boolean {
  return groupsByKey.has(key);
}

export function pickRandomFeatureFromGroup(groupKey: string): string | null {
  const members = groupsByKey.get(groupKey);
  if (!members?.length) return null;
  const pick = members[Math.floor(Math.random() * members.length)]!;
  return pick.key;
}

/** Resolve brush key to a concrete PNG key for paint (groups → random member). */
export function resolveFeatureKeyForPaint(key: string | null): string | null {
  if (!key) return null;
  if (isFeatureGroupKey(key)) return pickRandomFeatureFromGroup(key);
  return key;
}

export function isBundledTileFeatureKey(key: string): boolean {
  if (featureByKey.has(key) || groupsByKey.has(key)) return true;
  return key.startsWith(FEATURES_PREFIX);
}

export function bundledTileFeatureUrl(key: string): string {
  if (isFeatureGroupKey(key)) {
    const preview = groupsByKey.get(key)?.[0];
    if (preview) return preview.url;
  }
  return `/${key}`;
}
