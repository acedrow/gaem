# AGENTS.md

Guidance for AI coding agents working in this repository.

## Project

Browser-based implementation of **Hellpiercers** — a tactical grid game with GM and player roles, character sheets, and real-time board sync.

Monorepo (npm workspaces). Node 22 (`nvm use`).

| Package | Purpose |
|---------|---------|
| `@gaem/shared` | Types, map parsing, game rules, static data (classes, enemies, patterns) |
| `@gaem/client` | Vue 3 SPA — board, panels, session flow |
| `@gaem/server` | Local dev — Express REST + in-memory WebSocket game room |
| `@gaem/cf-worker` | Production — Cloudflare Worker, Durable Object game room, KV, R2 |

**Rule of thumb:** game logic and validation belong in `@gaem/shared`. Both `server` and `cf-worker` must call the same shared functions so local dev matches production.

## Commands

```bash
npm install
npm run build          # shared → server → client
npm run test           # shared + client vitest suites
npm run dev            # local stack (client :5173, server :3001)
npm run dev:cf         # wrangler dev with built client
npm run deploy:cf      # production deploy
```

After changing `@gaem/shared`, rebuild (or run `dev`, which watches shared).

Do **not** commit, push, or open PRs unless the user explicitly asks.

## Verification (required for all code changes)

Before considering any implementation task done, **run these commands and fix failures**:

```bash
npm run build
npm run test
```

- **`npm run build`** — mandatory. Shared type errors block client and server; client imports `@gaem/shared` from `dist/`.
- **`npm run test`** — mandatory when tests exist for the code you touched. If you add or change shared game logic, add or update tests in `packages/shared` when the behavior is worth guarding (see Code style). Run the full root `npm run test` at minimum; re-run focused suites while iterating if helpful.

Do not skip verification because a change "looks small" or "only touches the client." Export omissions, missing shared rebuilds, and broken imports often surface only at build time.

After fixing a build or test failure, re-run both commands to confirm nothing else regressed.

## Architecture

- **WebSocket** `/ws` — clients receive `GameState`; server applies `validateMove` / `applyMove` / phase actions from shared package.
- **REST** — player profiles, character sheets, portraits, dice rolls. Auth via `X-Gaem-Role` and `X-Gaem-Player-Key` (see `useSession` / `useApi`).
- **Maps** — `packages/maps/*.json`, synced to KV for cf-worker deploy.
- **Static game data** — JSON under `packages/shared/src/data/` (enemies, player gear, patterns). Code imports from `src/data/` only.

## Rules

When clarifying Hellpiercers mechanics or transcribing data into code, consult in order:

1. **`HELLPIERCERS v1.02.pdf`** (gitignored, repo root) — primary rulebook text.
2. **`scripts/rulebook/errata.md`** — official errata (local copy of [hellpiercers.com/#errata](https://hellpiercers.com/#errata)). Overrides or amends book text where they conflict.
3. **`scripts/rulebook/developer-clarifications.md`** — Sandy Pug developer answers from the itch.io forum. Use for edge cases not covered by the errata; does not duplicate errata entries.

Don't guess stats or mechanics from memory — check these sources first.

## Rulebook PDF workflow

One-time setup (creates `scripts/rulebook/.venv` with `pypdf`):

```bash
npm run rulebook:setup
```

The PDF must live at the repo root: `HELLPIERCERS v1.02.pdf`. It is gitignored; each developer keeps their own copy.

Extract text with:

```bash
# Page count
npm run rulebook -- --pages

# Single page (book page number, 1-indexed)
npm run rulebook -- --page 200

# Page range
npm run rulebook -- --from-page 196 --to-page 200

# Search all pages
npm run rulebook -- --search "Stain Flower"
npm run rulebook -- --search "fortification" --context 200
```

Many weapon/enemy **attack patterns are embedded images**, not extractable as text. Decode them with the same script (requires Pillow — re-run `npm run rulebook:setup` after pulling if image commands fail):

```bash
# List embedded images on a page (name, dimensions, filter type)
npm run rulebook -- --page 22 --list-images

# Extract pattern diagrams to PNG (default: scripts/rulebook/out/page-N/, gitignored)
# By default skips full-page backgrounds; keeps images ≤600px wide/tall
npm run rulebook -- --page 22 --extract-images
npm run rulebook -- --from-page 21 --to-page 22 --extract-images

# Include full-page scan/background images
npm run rulebook -- --page 22 --extract-images --all-images

# Custom output directory
npm run rulebook -- --page 22 --extract-images --out /tmp/patterns
```

Open the PNGs to read tile layouts. Orange squares are attack tiles; green (when present) is the origin/player tile. Transcribe relative coordinates into `tiles` arrays in `packages/shared/src/data/` (see sibling weapon entries for `anchorTile`, `healTiles`, `boundsTiles`).

**Do not** write raw `obj.get_data()` bytes to disk — FlateDecode images need decoding via Pillow (`RGB` for `width×height×3` bytes; JPEG `/DCTDecode` via `Image.open`). The script handles this.

**Agent workflow when transcribing rules:**

1. Check `scripts/rulebook/errata.md` and `scripts/rulebook/developer-clarifications.md` for overrides or edge cases.
2. Run `npm run rulebook:setup` if `scripts/rulebook/.venv` is missing.
3. Search or pull the relevant page(s) from the PDF. For attack patterns, also run `--list-images` / `--extract-images` on those pages.
4. Add data to `packages/shared/src/data/`.
5. Match existing JSON field names and tag casing in sibling entries.

Direct invocation (same as `npm run rulebook -- …`):

```bash
scripts/rulebook/.venv/bin/python scripts/rulebook/extract.py --page 200
```

## Where to change things

| Task | Location |
|------|----------|
| Move validation, phases, HP, occupancy | `packages/shared/src/game.ts` |
| Map tiles, walkability, spawn | `packages/shared/src/map.ts` |
| Enemy/class/weapon definitions | `packages/shared/src/data/` + `*-data.ts` loaders |
| Board rendering, input | `packages/client/src/components/GameBoard.vue`, `BoardCell.vue` |
| UI panels | `packages/client/src/components/` |
| Cross-panel state | `packages/client/src/composables/` |
| Local API/WS handlers | `packages/server/src/index.ts` |
| Production API/WS | `packages/cf-worker/src/` (mirror server behavior) |

When adding a client message or game action, update `types.ts`, shared validators/appliers, **and** both server implementations.

## Client conventions

- Vue 3 `<script setup lang="ts">`, Composition API.
- Relative imports use `.js` extension (e.g. `from "./useGameState.js"`).
- Prefer existing composables (`useGameState`, `useSession`, `useApi`, `useBoardSelection`, …) over new global state.
- Reuse shared UI before adding one-off markup: `PanelShell`, `HpBar`, `NumberStepper`, `ModalDialog`, `PlayerItemDetail`, `BoardCell`.
- CSS design tokens and utilities live in `packages/client/src/style.css` (`var(--color-*)`, `.panel`, `.list-card`, `.stepper`, etc.). Avoid hardcoding `#30363d`-style palette in new scoped styles.
- `GameBoard` is performance-sensitive: precompute cell state, avoid per-cell scans in templates, use `BoardCell` + `v-memo`.
- **Tile tooltips** — show effect name (and stack count only when stacks matter). Never append `summary` or `description` text in board tile tooltips. Presence-only tile effects (e.g. Stained, Annihilation Corridor) use a display name with no stack value. Prefer `TILE_EFFECT_IMAGE_URLS` overlays for board markers when an icon asset exists.

## Code style

- **Minimize scope** — smallest correct diff; don't refactor unrelated code.
- **Minimize comments** — only for non-obvious business logic; use `//` not block comments.
- **Minimize helpers** — inline one-off logic; extract only when genuinely reused (DRY).
- Match surrounding naming, types, and patterns; don't over-abstract.
- No tests unless requested or they cover real behavior worth guarding.

## GM vs player

Many panels branch on `useSession().isGm`. Players see reduced enemy/sheet detail. Don't leak GM-only stats (HP bars, attacks, spawn tools) to player UI unless intended.

## Common pitfalls

- **`tileAt` / occupancy** — use `buildBoardOccupancy` and cached tile index patterns; don't scan all enemies per cell.
- **Server parity** — a fix in `packages/server` often needs the same change in `packages/cf-worker/src/game-room.ts`.
- **Shared build** — client imports `@gaem/shared` from `dist/`; type errors in shared block the whole build.
- **Character sheets** — persisted in KV (prod) / memory (local); portraits in R2 (prod).


## Checklist before finishing

- [ ] `npm run build` passes (run it; do not assume)
- [ ] `npm run test` passes (run it; fix or add tests for changed behavior)
- [ ] Shared game logic updated if behavior changed
- [ ] Server and cf-worker stay in sync for WS/REST changes
- [ ] No secrets committed (`.env`, `.dev.vars`)
- [ ] UI uses design tokens / shared components where applicable
