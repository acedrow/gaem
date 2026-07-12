export type BundledTileAppearance = {
  name: string;
  key: string;
  url: string;
  setId: string;
};

export type BundledTileSet = {
  id: string;
  label: string;
  appearances: BundledTileAppearance[];
};

const SET_LABELS: Record<string, string> = {
  basic: "Basic",
  paracletus: "Paracletus",
};

const appearanceModules = import.meta.glob(
  "../../../assets/tiles/{basic,paracletus}/*.png",
  { eager: true, query: "?url", import: "default" },
) as Record<string, string>;

function fileBaseName(path: string): string {
  const file = path.split("/").pop() ?? path;
  return file.replace(/\.png$/i, "");
}

function setIdFromPath(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 2] ?? "basic";
}

function setLabel(id: string): string {
  return SET_LABELS[id] ?? id.charAt(0).toUpperCase() + id.slice(1);
}

export const BUNDLED_TILE_APPEARANCES: BundledTileAppearance[] = Object.keys(appearanceModules)
  .map((path) => {
    const name = fileBaseName(path);
    const setId = setIdFromPath(path);
    return {
      name,
      setId,
      key: `tiles/${setId}/${name}.png`,
      url: `/tiles/${setId}/${name}.png`,
    };
  })
  .sort((a, b) => a.name.localeCompare(b.name));

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

const LEGACY_APPEARANCE_PREFIX = "tiles/appearance/";

export function isBundledTileAppearanceKey(key: string): boolean {
  if (key.startsWith(LEGACY_APPEARANCE_PREFIX)) return true;
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
  return `/${key}`;
}
