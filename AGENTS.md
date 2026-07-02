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
npm run dev            # local stack (client :5173, server :3001)
npm run dev:cf         # wrangler dev with built client
npm run deploy:cf      # production deploy
```

After changing `@gaem/shared`, rebuild (or run `dev`, which watches shared).

Do **not** commit, push, or open PRs unless the user explicitly asks.

## Architecture

- **WebSocket** `/ws` — clients receive `GameState`; server applies `validateMove` / `applyMove` / phase actions from shared package.
- **REST** — player profiles, character sheets, portraits, dice rolls. Auth via `X-Gaem-Role` and `X-Gaem-Player-Key` (see `useSession` / `useApi`).
- **Maps** — `packages/maps/*.json`, synced to KV for cf-worker deploy.
- **Static game data** — JSON under `packages/shared/src/data/` (enemies, player gear, patterns). Code imports from `src/data/` only; do not edit the duplicate `packages/shared/data/` tree.

`HELLPIERCERS v1.02.pdf` (gitignored) is the Hellpiercers rulebook — the design reference when clarifying rules or transcribing data into code.

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

**Agent workflow when transcribing rules:**

1. Run `npm run rulebook:setup` if `scripts/rulebook/.venv` is missing.
2. Search or pull the relevant page(s) from the PDF — don't guess stats from memory.
3. Add data to `packages/shared/src/data/` (not the duplicate `packages/shared/data/` tree).
4. Match existing JSON field names and tag casing in sibling entries.

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

- [ ] `npm run build` passes
- [ ] Shared game logic updated if behavior changed
- [ ] Server and cf-worker stay in sync for WS/REST changes
- [ ] No secrets committed (`.env`, `.dev.vars`)
- [ ] UI uses design tokens / shared components where applicable
