# Backend implementation handoff

This document is for the **next agent** implementing a server for Niche. The frontend is a working Vite + TypeScript SPA; the backend does not exist yet.

**Reference implementation:** [discoverify](https://github.com/ethanzohar/discoverify) (`backend/` — Express, MongoDB, cron, Spotify client secret).

---

## 1. Product summary

**Niche** is a Spotify-connected web app that:

| Feature | Status (frontend) | Needs backend? |
|--------|-------------------|----------------|
| OAuth connect | PKCE in browser (`src/spotify/auth.ts`) | **Yes** — store refresh tokens securely |
| Playlist dashboard | Works client-side | Optional (proxy only) |
| Playlist detail / tracks | Works client-side | Optional |
| **Discover Daily** | Manual "Generate" in browser | **Yes** — for scheduled daily updates |
| Discover options (seeds + sliders) | `localStorage` | **Yes** — persist per user in DB |

**Playlist name written to Spotify:** `Niche Daily` (private), 30 tracks.

---

## 2. Current architecture (browser-only)

```
Browser (Vite @ 127.0.0.1:5173)
  ├── PKCE OAuth → sessionStorage (access + refresh token)
  ├── Spotify API calls direct to api.spotify.com (Bearer from sessionStorage)
  ├── discover/engine.ts + fallback.ts → generate playlist on button click
  └── localStorage: niche_discover_options, niche_discover_playlist_id
```

**OAuth scopes** (in `src/spotify/auth.ts`, version `CURRENT_SCOPES_VERSION = '2'`):

```
playlist-read-private
playlist-read-collaborative
user-read-private
user-top-read
user-library-read
playlist-modify-private
playlist-modify-public
```

Login uses `prompt=consent` so scope upgrades take effect. **Refreshing an access token does not add new scopes** — users must reconnect.

**Spotify Recommendations API:** Often **404** for new developer apps (Nov 2024 policy). The app already handles this:

1. Try `GET /v1/recommendations` (discoverify algorithm) — `src/discover/engine.ts`
2. Fallback: related artists + top tracks — `src/discover/fallback.ts`

Backend should **reuse the same logic** (port or share package), not assume recommendations works.

---

## 3. Target architecture (recommended)

```
┌─────────────────┐     /api/*      ┌──────────────────┐
│  Vite frontend  │ ──────────────► │  Express backend │
│  (no secret)    │                 │  + CLIENT_SECRET │
└────────┬────────┘                 └────────┬─────────┘
         │                                   │
         │ Spotify (user token)              │ Spotify (stored refresh_token)
         └──────────────► api.spotify.com ◄─┘
                                   │
                            ┌──────▼──────┐
                            │  MongoDB /  │
                            │  SQLite     │
                            └─────────────┘
                                   ▲
                            ┌──────┴──────┐
                            │  Cron       │
                            │  (daily)    │
                            └─────────────┘
```

### Why a backend

| Problem today | Backend fix |
|---------------|-------------|
| Refresh token in `sessionStorage` — lost on tab close | Persist encrypted in DB |
| No daily auto-update | Cron calls same generate pipeline as discoverify |
| Client secret cannot be used for some flows | Server-side token exchange |
| Options only on one device | `playlistOptions` per user in DB |

---

## 4. Suggested repo layout

```
Niche/
├── src/                    # existing frontend (keep)
├── backend/                # NEW
│   ├── package.json
│   ├── .env.example
│   ├── src/
│   │   ├── index.ts        # Express app entry
│   │   ├── routes/
│   │   │   ├── auth.ts     # refreshToken, accessToken
│   │   │   ├── users.ts    # subscribe, unsubscribe, options
│   │   │   └── discover.ts # generate (optional manual trigger)
│   │   ├── services/
│   │   │   ├── spotify.ts  # token + API (port from discoverify spotifyHelper)
│   │   │   └── discover.ts # port engine.ts + fallback.ts (Node fetch)
│   │   ├── jobs/
│   │   │   └── dailyPlaylist.ts
│   │   ├── db/
│   │   │   ├── client.ts
│   │   │   └── models/user.ts
│   │   └── lib/
│   │       └── crypto.ts   # encrypt refreshToken at rest (optional)
│   └── tsconfig.json
├── HANDOFF.md              # this file
├── package.json            # add workspaces or root scripts
└── vite.config.ts          # proxy /api → backend in dev
```

**Alternative:** monorepo with `packages/shared` exporting `PlaylistOptions` + discover engine used by both Vite and backend (avoids duplicating `engine.ts`).

---

## 5. Database schema (mirror discoverify)

Discoverify `userSchema` ([source](https://github.com/ethanzohar/discoverify/blob/master/backend/models/userSchema.js)):

```js
{
  userId: String,          // Spotify user id (discoverify encrypts at rest)
  refreshToken: String,    // required, unique
  playlistId: String,      // Spotify playlist id for "Niche Daily"
  lastUpdated: Date,
  playlistOptions: {
    seeds: [String],       // e.g. ['ST','ST','MT','MT','MT'] — codes AA|MA|SA|AT|MT|ST
    acousticness: [Number, Number],
    danceability: [Number, Number],
    energy: [Number, Number],
    instrumentalness: [Number, Number],
    popularity: [Number, Number],
    valence: [Number, Number],
  },
}
```

**Niche defaults** are in `src/discover/options.ts` (`DEFAULT_OPTIONS`). Use the same shape.

**Indexes:** `userId` unique, `refreshToken` unique.

**Do not store** access tokens long-term — fetch on demand via refresh (discoverify pattern).

---

## 6. API routes to implement

Map from discoverify `discoverDailyRoutes.js`. Prefix with `/api` (or `/api/discover-daily` like discoverify).

### Auth (critical)

| Method | Path | Body | Response | Notes |
|--------|------|------|----------|-------|
| `POST` | `/api/auth/token` | `{ code, redirectUri }` | `{ access_token, refresh_token }` | Exchange auth code with **client_secret** (discoverify `getRefreshToken`) |
| `POST` | `/api/auth/refresh` | `{ refreshToken }` | `{ accessToken }` | Server refresh; on `invalid_grant` delete user |

**Spotify token URL:** `POST https://accounts.spotify.com/api/token`

Discoverify does **not** use PKCE on the server — it uses classic Authorization Code + secret. Frontend will need to change (see §8).

### User lifecycle

| Method | Path | Body | Response |
|--------|------|------|----------|
| `POST` | `/api/users/subscribe` | `{ userId, refreshToken, options? }` | `{ user }` | Create/update user, run first playlist generation |
| `POST` | `/api/users/unsubscribe` | `{ userId, accessToken }` | `{ success }` | Validate token matches userId, delete user |
| `GET` | `/api/users/:userId` | — | `{ user, now }` | Return options + `lastUpdated` + `playlistId` (no refresh token to client) |
| `POST` | `/api/users/restore-options` | `{ userId, accessToken }` | `{ user }` | Reset options to defaults |
| `POST` | `/api/users/options` | `{ userId, accessToken, options }` | `{ user }` | Save `playlistOptions` |

`validate(userId, accessToken)` = `GET /v1/me` with token, check `me.id === userId` (discoverify pattern).

### Discover / admin (optional for v1)

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/discover/generate` | `{ userId }` — server uses stored refresh token, runs engine |
| `POST` | `/api/admin/force` | `{ clientSecret }` — regenerate all users (cron manual trigger) |

---

## 7. Port discover engine to the server

**Source files to port (logic already implemented):**

| Frontend file | Responsibility |
|---------------|----------------|
| `src/discover/engine.ts` | `getAllTop`, `getSeeds`, recommendations URLs, `pickPlaylistUris`, `generateDiscoverPlaylist` |
| `src/discover/fallback.ts` | `pickTracksViaRelatedArtists` when recommendations 404 |
| `src/discover/options.ts` | Types + `DEFAULT_OPTIONS` |

**Changes when porting:**

- Replace `spotifyFetch` / `spotifyPut` / `spotifyPost` from `src/spotify/api.ts` with a server module that accepts `accessToken` as argument (no `sessionStorage`).
- Use `node-fetch` or native `fetch` (Node 18+).
- `generateDiscoverPlaylist(userId, options, market)` — same signature as frontend.
- Return `{ playlistId, trackCount, playlistUrl, mode: 'recommendations' | 'related-artists' }`.

**Cron job** (discoverify `cronService.js` + `updatePlaylists`):

1. Load all users from DB.
2. For each user: `getNewAccessToken(refreshToken)` → run generate → update `lastUpdated`.
3. On `invalid_grant`: delete user or mark inactive (discoverify deletes).
4. Rate-limit / sequential processing — discoverify runs sequentially to avoid Spotify rate limits.

---

## 8. Frontend changes required (after backend exists)

The next agent should update the SPA **or** document these for a follow-up PR:

### 8.1 Auth flow (align with discoverify)

**Option A — Recommended (discoverify parity):**

1. Remove PKCE from login URL in `src/spotify/auth.ts` (or gate behind env).
2. Redirect to Spotify authorize with `client_id` + `scope` + `redirect_uri` only.
3. On `/callback`, `POST` code to `POST /api/auth/token`.
4. Store **only** `refreshToken` in `sessionStorage` (or httpOnly cookie if you add sessions later).
5. For API calls: `POST /api/auth/refresh` → short-lived `accessToken` → call Spotify.

**Option B — Hybrid (minimal frontend churn):**

- Keep PKCE for dashboard browsing.
- On "Enable Discover Daily" / subscribe: send `refreshToken` to `POST /api/users/subscribe` and stop relying on localStorage for playlist id.

### 8.2 Discover Daily UI (`src/discover/view.ts`)

| Today | After backend |
|-------|----------------|
| `loadOptions()` / `saveOptions()` → localStorage | `GET/POST /api/users/:id` |
| `generateDiscoverPlaylist()` in browser | `POST /api/discover/generate` or subscribe flow |
| `loadDiscoverPlaylistId()` localStorage | `user.playlistId` from API |

### 8.3 Vite dev proxy

```ts
// vite.config.ts
server: {
  proxy: {
    '/api': { target: 'http://127.0.0.1:3001', changeOrigin: true },
  },
},
```

### 8.4 Environment variables

**Frontend `.env`:**

```env
VITE_SPOTIFY_CLIENT_ID=...
VITE_REDIRECT_URI=http://127.0.0.1:5173/callback
VITE_API_BASE_URL=          # empty in dev (proxy), or https://api.example.com
```

**Backend `backend/.env` (never commit):**

```env
SPOTIFY_CLIENT_ID=...
SPOTIFY_CLIENT_SECRET=...
SPOTIFY_REDIRECT_URI=http://127.0.0.1:5173/callback
DATABASE_URL=mongodb://localhost:27017/niche
PORT=3001
CRON_SCHEDULE=0 6 * * *      # e.g. 6 AM daily
ADMIN_CLIENT_SECRET=...    # optional, for /admin/force
ENCRYPTION_KEY=...           # optional, for userId/token encryption
```

Add redirect URI in Spotify Dashboard for production when deployed.

---

## 9. Security checklist

- [ ] **Never** expose `SPOTIFY_CLIENT_SECRET` to the frontend or `VITE_*` vars.
- [ ] Never return `refreshToken` from `GET /api/users/:userId`.
- [ ] Validate `accessToken` belongs to `userId` on mutating routes (discoverify `validate()`).
- [ ] CORS: allow only frontend origin in production.
- [ ] Consider encrypting `refreshToken` at rest (discoverify uses optional userId encryption).
- [ ] Rate-limit auth endpoints.
- [ ] `.env` in `.gitignore` (already is for root).

---

## 10. Spotify Developer Dashboard

1. **Redirect URIs:** `http://127.0.0.1:5173/callback` (dev) + production URL.
2. **Extended Quota Mode:** Apply if you need `/recommendations`; otherwise fallback path is implemented.
3. Same app Client ID for frontend redirect; secret only on server.

---

## 11. Implementation order (suggested)

1. **Scaffold** `backend/` — Express + TypeScript + health route.
2. **Auth routes** — token exchange + refresh; test with Postman/curl.
3. **User model + subscribe/unsubscribe** — persist options + refresh token.
4. **Port** `engine.ts` + `fallback.ts` → `backend/src/services/discover.ts`.
5. **Wire** subscribe to run first generation; store `playlistId`.
6. **Cron** — daily job for all users.
7. **Frontend** — proxy, switch Discover flow to API, optional auth migration.
8. **README** — dev instructions (`npm run dev` runs both), production deploy notes.

---

## 12. Key frontend entry points (for navigation)

| File | Role |
|------|------|
| `src/main.ts` | App shell: login, dashboard, playlist detail, routing to discover |
| `src/spotify/auth.ts` | PKCE, scopes, token storage |
| `src/spotify/api.ts` | `spotifyFetch`, `spotifyPut`, `spotifyPost`, error parsing |
| `src/discover/view.ts` | Discover Daily UI + generate button |
| `src/discover/engine.ts` | Full generation pipeline |
| `src/discover/options.ts` | `PlaylistOptions` type + defaults |

**Views:** `login` → `dashboard` | `discover` | `detail` (playlist tracks).

---

## 13. Known issues / don't regress

1. **Scope errors** — `needsReauth()` + `CURRENT_SCOPES_VERSION` in auth; bump version when scopes change.
2. **Null Spotify images** — use `images?.[0]` (see `src/spotify/images.ts`).
3. **Recommendations 404** — must keep fallback path on server.
4. **Dev server** — bind `127.0.0.1:5173` (`vite.config.ts`); Spotify redirect must match exactly.
5. **Node version** — use **Node 18+** (20 recommended); older Node breaks Vite.

---

## 14. Out of scope (unless product asks)

- Stripe / payments (discoverify has this; Niche does not).
- User accounts separate from Spotify (Niche uses Spotify id only).
- Public playlists or social features.

---

## 15. Quick test plan (backend done)

1. Subscribe user → `Niche Daily` playlist appears in Spotify.
2. Change options → regenerate → playlist updates, ~30 tracks.
3. Cron runs → `lastUpdated` advances.
4. Revoke app in Spotify → next cron removes user or logs error.
5. Frontend dashboard still loads playlists with short-lived access token.

---

## 16. Commands (today vs target)

**Today:**

```bash
nvm use 20
npm install
npm run dev          # frontend only @ :5173
```

**Target (example):**

```bash
npm run dev          # concurrently: vite + backend
npm run dev:api      # backend only :3001
npm run dev:web      # vite only :5173
```

---

*Last updated: backend implemented — Express API, MongoDB user model, discover engine port, daily cron, frontend subscribe flow.*
