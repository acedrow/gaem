# 

browser based hellpiercers-implementation

## Packages

| Package | Role |
|---------|------|
| `@gaem/shared` | Types, map/game logic, and static player data (classes, weapons, armor) |
| `@gaem/client` | Vue 3 SPA — game board, character sheets, session flow |
| `@gaem/server` | Local dev backend — Express REST API + WebSocket game room |
| `@gaem/cf-worker` | Production backend — Cloudflare Worker serving the built client and APIs |

## Architecture

```
┌─────────────┐     REST + WebSocket      ┌──────────────────────────────┐
│   client    │ ◄────────────────────────►│  server (local)              │
│  (Vue/Vite) │                           │  in-memory state             │
└─────────────┘                           └──────────────────────────────┘
       │                                  ┌──────────────────────────────┐
       └─────────────────────────────────►│  cf-worker (production)      │
                                          │  Worker → static assets      │
                                          │  Durable Object → game room  │
                                          │  KV → profiles & maps        │
                                          │  R2 → character portraits    │
                                          └──────────────────────────────┘
                          both use @gaem/shared for game rules & types
```

**Game sync** — Clients connect over WebSocket at `/ws`. The server broadcasts `GameState` (map tiles, player positions) after joins and moves. Shared validation (`validateMove`, `applyMove`, etc.) lives in `@gaem/shared`.

**APIs** — Player profiles (`/api/player-profiles`) and character sheets (`/api/character-sheets`, with portrait upload) are role-gated via `X-Gaem-Role` and `X-Gaem-Player-Key` headers.

**Maps** — JSON map definitions live in `packages/maps/`. The cf-worker syncs them to KV before deploy.

## Development

Requires Node 22 (`nvm use`).

```bash
npm install
npm run dev          # shared watch + local server (3001) + client (Vite)
npm run dev:cf       # build client, sync maps, run wrangler dev
npm run deploy:cf    # build and deploy to Cloudflare (main branch via CI)
```

In dev, the client talks to `http://localhost:3001`. In production, the Worker serves the SPA and handles all API/WS routes on the same origin.
