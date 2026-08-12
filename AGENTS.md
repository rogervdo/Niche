# AGENTS.md

## Architecture

- **Vanilla TypeScript SPA** — no React, Vue, or other framework. UI is imperative DOM manipulation rendered via `innerHTML` strings from `src/main.ts`.
- **Optional Express 5 backend** (`backend/`) for Discover Daily cron + MongoDB cache. Frontend works standalone with Spotify PKCE auth.
- **Two `package.json`** files — root and `backend/`. Run `npm install` in both.

## Commands

```bash
npm run dev:web          # frontend only (port 5173)
npm run dev:api          # backend only (port 3001, from backend/)
npm run dev              # both (concurrently), checks ports first
npm run db:up            # start MongoDB via Docker (required for backend)
npm run test             # all jest tests (both backend + web)
npx jest -- --testPathPattern='src/spotify/images'  # single test file
npm run build            # tsc (typecheck only, noEmit) then vite build
npm run build:api        # backend TypeScript compile (backend/)
```

- **Port 5173 is `strictPort: true`** — cannot change it without also updating Spotify redirect URI. The `predev` script checks it.
- **`npm run build`** runs `tsc` purely as a typecheck (noEmit IS on in `tsconfig.json`) — Vite does the actual bundling.
- There is **no linter, formatter, or CI**.

## TypeScript config

- **Root `tsconfig.json`** is for Vite/frontend: `moduleResolution: "bundler"`, `noEmit: true`, `verbatimModuleSyntax: true`, `erasableSyntaxOnly: true` (TS 6.x).
- **`tsconfig.test.json`** extends root but switches to CommonJS module + Jest types. Frontend tests are excluded from the main tsconfig (`"exclude": ["src/**/*.test.ts"]`).
- **Backend `tsconfig.json`** uses `NodeNext` module resolution — all local imports must use `.js` extensions (e.g. `import { config } from './config.js'`).
- **Backend TS version is ~5.8.3**, not 6.x like the frontend.

## Strict compiler flags (both frontend and backend)

- `noUnusedLocals: true`
- `noUnusedParameters: true`
- `noFallthroughCasesInSwitch: true`
- `verbatimModuleSyntax: true` (frontend) — use `import type` for type-only imports, never bare `import` for types.

## Testing

- **Jest with `projects` array** — two projects: `backend` (ts-jest, node env) and `web` (ts-jest, node env — NOT jsdom). No DOM APIs available in tests.
- Test files: `**/*.test.ts`. Single test run: `npx jest -- --testPathPattern='src/spotify/images'`
- Backend tests use `backend/tsconfig.test.json` (CommonJS, isolatedModules).

## Vite dev server

- Proxies `/api` → `http://127.0.0.1:3001` and `/spotify-embed` → `https://open.spotify.com/embed/`.
- Host is hardcoded to `127.0.0.1` (not `localhost`).

## Spotify auth

- PKCE flow in browser (`src/spotify/auth.ts`). Tokens stored in `sessionStorage`, not `localStorage`. Scope version key bumps force re-auth.
- Backend uses client secret flow for server-side token exchange and stores refresh tokens in MongoDB.

## Key directories

| Path | Purpose |
|------|---------|
| `src/main.ts` | Single app entrypoint — all routing, state, rendering |
| `src/spotify/` | Spotify API client, auth, types, caching |
| `src/playlist/` | Library dashboard, detail view, duplicate detection |
| `src/discover/` | Niche Daily genre-based discovery engine |
| `src/ui/` | Shared UI utilities (icons) |
| `src/api/` | Frontend HTTP client for the backend cache API |
| `backend/src/routes/` | Express route handlers |
| `backend/src/services/` | Spotify service, discover engine, user jobs |
| `backend/src/jobs/` | Daily cron job |
| `backend/src/db/models/` | Mongoose user schema |
| `dist/` | Built frontend output |

## Environment

- `.env` (root): `VITE_SPOTIFY_CLIENT_ID`, `VITE_REDIRECT_URI`, `VITE_API_BASE_URL` (leave empty in dev — Vite proxies `/api`).
- `backend/.env`: `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `DATABASE_URL`, `PORT`, `CRON_SCHEDULE`, `ENCRYPTION_KEY`, `FRONTEND_ORIGIN`, `GEMINI_API_KEY`.
- `.env` is gitignored. Copy from `.env.example` / `backend/.env.example`.
