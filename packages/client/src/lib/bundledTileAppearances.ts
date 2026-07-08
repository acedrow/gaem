export type BundledTileAppearance = {
  name: string;
  key: string;
  url: string;
};

const appearanceModules = import.meta.glob(
  "../../../assets/tiles/appearance/*.png",
  { eager: true, query: "?url", import: "default" },
) as Record<string, string>;

function fileBaseName(path: string): string {
  const file = path.split("/").pop() ?? path;
  return file.replace(/\.png$/i, "");
}

export const BUNDLED_TILE_APPEARANCES: BundledTileAppearance[] = Object.keys(appearanceModules)
  .map((path) => {
    const name = fileBaseName(path);
    return {
      name,
      key: `tiles/appearance/${name}.png`,
      url: `/tiles/appearance/${name}.png`,
    };
  })
  .sort((a, b) => a.name.localeCompare(b.name));

export function isBundledTileAppearanceKey(key: string): boolean {
  return key.startsWith("tiles/appearance/");
}

export function bundledTileAppearanceUrl(key: string): string {
  return `/${key}`;
}
