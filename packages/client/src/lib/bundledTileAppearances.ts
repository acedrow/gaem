export type BundledTileAppearance = {
  name: string;
  key: string;
  url: string;
  setId: string;
  /** Subfolder under the set, if this PNG is a randomized group member. */
  groupId?: string;
};

export type BundledTileSet = {
  id: string;
  label: string;
  appearances: BundledTileAppearance[];
};

/** Gallery row: a single PNG, or a folder of variants painted at random. */
export type TileAppearanceGalleryEntry = {
  kind: "single" | "group";
  name: string;
  /** Brush key — concrete PNG key, or `tiles/{setId}/{groupId}` for groups. */
  key: string;
  url: string;
  setId: string;
  members?: BundledTileAppearance[];
};

const SET_LABELS: Record<string, string> = {
  basic: "Basic",
  paracletus: "Paracletus",
  "paracletus-e-fields": "Paracletus E-Fields",
  "paracletus-stain-springs": "Paracletus Stain Springs",
  "paracletus-v-nimbus": "Paracletus V-Nimbus",
};

const appearanceModules = import.meta.glob(
  "../../../assets/tiles/{basic,paracletus,paracletus-e-fields,paracletus-stain-springs,paracletus-v-nimbus}/**/*.png",
  { eager: true, query: "?url", import: "default" },
) as Record<string, string>;

function fileBaseName(path: string): string {
  const file = path.split("/").pop() ?? path;
  return file.replace(/\.png$/i, "");
}

function setLabel(id: string): string {
  return SET_LABELS[id] ?? id.charAt(0).toUpperCase() + id.slice(1);
}

/** Parse `.../assets/tiles/{setId}/{file}.png` or `.../tiles/{setId}/{groupId}/{file}.png`. */
function appearanceFromModulePath(path: string): BundledTileAppearance | null {
  const marker = "/assets/tiles/";
  const idx = path.replace(/\\/g, "/").lastIndexOf(marker);
  if (idx < 0) return null;
  const rel = path.slice(idx + marker.length);
  const parts = rel.split("/");
  if (parts.length === 2 && parts[1]?.toLowerCase().endsWith(".png")) {
    const setId = parts[0]!;
    const name = fileBaseName(parts[1]!);
    return {
      name,
      setId,
      key: `tiles/${setId}/${name}.png`,
      url: `/tiles/${setId}/${name}.png`,
    };
  }
  if (parts.length === 3 && parts[2]?.toLowerCase().endsWith(".png")) {
    const setId = parts[0]!;
    const groupId = parts[1]!;
    const name = fileBaseName(parts[2]!);
    return {
      name,
      setId,
      groupId,
      key: `tiles/${setId}/${groupId}/${name}.png`,
      url: `/tiles/${setId}/${groupId}/${name}.png`,
    };
  }
  return null;
}

export const BUNDLED_TILE_APPEARANCES: BundledTileAppearance[] = Object.keys(appearanceModules)
  .map(appearanceFromModulePath)
  .filter((a): a is BundledTileAppearance => a !== null)
  .sort((a, b) => a.key.localeCompare(b.key));

export const BUNDLED_TILE_SETS: BundledTileSet[] = (() => {
  const bySet = new Map<string, BundledTileAppearance[]>();
  for (const appearance of BUNDLED_TILE_APPEARANCES) {
    const list = bySet.get(appearance.setId) ?? [];
    list.push(appearance);
    bySet.set(appearance.setId, list);
  }
  return [...bySet.entries()]
    .map(([id, appearances]) => ({
      id,
      label: setLabel(id),
      appearances,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
})();

const appearanceByKey = new Map(BUNDLED_TILE_APPEARANCES.map((a) => [a.key, a]));

const groupsByKey = new Map<string, BundledTileAppearance[]>();
for (const appearance of BUNDLED_TILE_APPEARANCES) {
  if (!appearance.groupId) continue;
  const groupKey = `tiles/${appearance.setId}/${appearance.groupId}`;
  const list = groupsByKey.get(groupKey) ?? [];
  list.push(appearance);
  groupsByKey.set(groupKey, list);
}
for (const list of groupsByKey.values()) {
  list.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

export function galleryEntriesForSet(setId: string): TileAppearanceGalleryEntry[] {
  const appearances =
    BUNDLED_TILE_SETS.find((set) => set.id === setId)?.appearances ?? [];
  const entries: TileAppearanceGalleryEntry[] = [];
  const seenGroups = new Set<string>();

  for (const appearance of appearances) {
    if (appearance.groupId) {
      const groupKey = `tiles/${appearance.setId}/${appearance.groupId}`;
      if (seenGroups.has(groupKey)) continue;
      seenGroups.add(groupKey);
      const members = groupsByKey.get(groupKey) ?? [appearance];
      const preview = members[0]!;
      entries.push({
        kind: "group",
        name: appearance.groupId,
        key: groupKey,
        url: preview.url,
        setId: appearance.setId,
        members,
      });
      continue;
    }
    entries.push({
      kind: "single",
      name: appearance.name,
      key: appearance.key,
      url: appearance.url,
      setId: appearance.setId,
    });
  }

  return entries.sort((a, b) => a.name.localeCompare(b.name));
}

const LEGACY_APPEARANCE_PREFIX = "tiles/appearance/";

export function isAppearanceGroupKey(key: string): boolean {
  return groupsByKey.has(key);
}

export function appearanceGroupMembers(key: string): BundledTileAppearance[] {
  return groupsByKey.get(key) ?? [];
}

export function pickRandomAppearanceFromGroup(groupKey: string): string | null {
  const members = groupsByKey.get(groupKey);
  if (!members?.length) return null;
  const pick = members[Math.floor(Math.random() * members.length)]!;
  return pick.key;
}

/** Resolve brush key to a concrete PNG key for paint (groups → random member). */
export function resolveAppearanceKeyForPaint(key: string | null): string | null {
  if (!key) return null;
  if (isAppearanceGroupKey(key)) return pickRandomAppearanceFromGroup(key);
  return key;
}

export function isBundledTileAppearanceKey(key: string): boolean {
  if (key.startsWith(LEGACY_APPEARANCE_PREFIX)) return true;
  if (appearanceByKey.has(key) || groupsByKey.has(key)) return true;
  return BUNDLED_TILE_SETS.some((set) => key.startsWith(`tiles/${set.id}/`));
}

export function setIdFromAppearanceKey(key: string): string | null {
  if (key.startsWith(LEGACY_APPEARANCE_PREFIX)) return "basic";
  const match = /^tiles\/([^/]+)\//.exec(key);
  if (!match) return null;
  const setId = match[1]!;
  return BUNDLED_TILE_SETS.some((set) => set.id === setId) ? setId : null;
}

export function bundledTileAppearanceUrl(key: string): string {
  if (key.startsWith(LEGACY_APPEARANCE_PREFIX)) {
    const name = key.slice(LEGACY_APPEARANCE_PREFIX.length);
    return `/tiles/basic/${name}`;
  }
  if (isAppearanceGroupKey(key)) {
    const preview = groupsByKey.get(key)?.[0];
    if (preview) return preview.url;
  }
  return `/${key}`;
}
