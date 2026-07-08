import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Guards the `dev:cf` hot-reload setup. It relies on several files agreeing:
// the client is served by the Vite dev server (HMR) and API/WS are proxied to
// the wrangler Worker, so the wrangler build must NOT rebuild the client in dev.
// History shows build tooling drifts silently; these read the real files so a
// regression that kills HMR fails CI instead of only being noticed by hand.

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const read = (p: string) => readFileSync(resolve(repoRoot, p), "utf8");

describe("dev:cf hot-reload wiring", () => {
  it("cf-wrangler-build.sh does not rebuild the client under `wrangler dev`", () => {
    const src = read("scripts/cf-wrangler-build.sh");
    const devBranch = src.slice(
      src.indexOf('= "dev" ]; then'),
      src.indexOf("else"),
    );
    expect(devBranch).not.toContain("@gaem/client");
    // deploy path (else branch) still builds the client
    expect(src.slice(src.indexOf("else"))).toContain("build -w @gaem/client");
  });

  it("wrangler watch_dir does not watch client/src (Vite owns the client)", () => {
    const toml = read("packages/cf-worker/wrangler.toml");
    const watchLine = toml
      .split("\n")
      .find((l) => l.trimStart().startsWith("watch_dir"));
    expect(watchLine).toBeDefined();
    expect(watchLine).not.toContain("client/src");
  });

  it("dev:cf runs the Vite dev server with VITE_CF_DEV alongside wrangler dev", () => {
    const devCf = (
      JSON.parse(read("package.json")) as { scripts: Record<string, string> }
    ).scripts["dev:cf"]!;
    expect(devCf).toContain("VITE_CF_DEV=1");
    expect(devCf).toContain("npm run dev -w @gaem/client");
    expect(devCf).toContain("npm run dev -w @gaem/cf-worker");
  });

  it("vite proxies /api and /ws to the worker when VITE_CF_DEV is set", () => {
    const config = read("packages/client/vite.config.ts");
    expect(config).toContain("VITE_CF_DEV");
    expect(config).toMatch(/"\/api"/);
    expect(config).toMatch(/"\/ws"[\s\S]*ws:\s*true/);
  });

  it("client backend URLs honor VITE_CF_DEV for same-origin proxying", () => {
    expect(read("packages/client/src/composables/useApi.ts")).toContain(
      "VITE_CF_DEV",
    );
    expect(read("packages/client/src/composables/useGameSocket.ts")).toContain(
      "VITE_CF_DEV",
    );
  });
});
