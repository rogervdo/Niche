# Niche — Spotify playlist dashboard

A Vite + TypeScript web app for browsing and managing your Spotify library, cleaning up playlists, and generating a daily **Niche Daily** playlist of niche artists by genre.

## Spotify API access (read this first)

Spotify [restricts third-party apps](https://developer.spotify.com/documentation/web-api/concepts/quota-modes) in ways that matter for how you run Niche:

| Mode | Who can use it | Notes |
|------|----------------|-------|
| **Development mode** (default for new apps) | Up to **5 Spotify accounts** total, including the app owner | Each user must be added to the app’s **Users and access** allowlist in the [Developer Dashboard](https://developer.spotify.com/dashboard). The app owner needs **Spotify Premium**. |
| **Extended quota mode** (public / unlimited users) | Organizations only | [Since May 2025](https://developer.spotify.com/blog/2025-04-15-updating-the-criteria-for-web-api-extended-access), Spotify accepts extended-quota applications only from registered companies (e.g. 250k+ MAUs, commercial product). There is no path for a public hobby app on a single personal Client ID. |

**If you deploy a shared URL or share this repo’s hosted instance:** anyone who is not on that app’s allowlist can complete Spotify login but will get **403** errors when Niche calls the API (often shown as “Spotify denied this request…”).

**To use Niche yourself or with a small group:** clone this repo, [create your own Spotify app](#1-spotify-developer-dashboard), set your own Client ID in `.env`, and add each Spotify user under **Users and access**. Do not rely on someone else’s deployed Client ID unless they have added your account to their allowlist.

**For a few friends on your app:** Dashboard → your app → **Settings** → **Users and access** → **Add new user** (use their Spotify login email). They must **Disconnect** → **Connect with Spotify** after you add them.

## How Spotify connection works

This project is inspired by [discoverify](https://github.com/ethanzohar/discoverify), which uses a **backend** to swap the OAuth code for tokens (client secret stays on the server) and stores refresh tokens in a database for daily cron jobs.

**Niche** uses **[Authorization Code with PKCE](https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow)** in the browser for the dashboard. The optional **backend** stores refresh tokens for scheduled Discover Daily updates (discoverify-style).

| | Discoverify | Niche (browser) | Niche (with backend) |
|---|-------------|-----------------|----------------------|
| Token exchange | Server + client secret | Browser + PKCE | PKCE for UI; server stores refresh token on subscribe |
| Refresh token | MongoDB | `sessionStorage` | MongoDB when daily updates enabled |
| Daily playlist | Cron | Manual Generate | Cron + manual |

## Setup

### 1. Spotify Developer Dashboard

You need **your own** Spotify Developer app (development mode is limited to 5 users; see [Spotify API access](#spotify-api-access-read-this-first) above).

1. Open [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) → **Create app** (use a Spotify **Premium** account for the owner).
2. Under **Settings** → **Redirect URIs**, add exactly:
   ```
   http://127.0.0.1:5173/callback
   ```
   For a production deploy, also add your hosted callback (e.g. `https://your-domain.vercel.app/callback`).
3. Copy the **Client ID** and **Client Secret**.
4. To let someone else use **your** app (max 4 others plus you): **Settings** → **Users and access** → **Add new user** with their Spotify email, then have them reconnect in Niche.

### 2. Environment

**Frontend** (root):

```bash
cp .env.example .env
```

```env
VITE_SPOTIFY_CLIENT_ID=your_client_id_here
VITE_REDIRECT_URI=http://127.0.0.1:5173/callback
VITE_API_BASE_URL=
```

**Backend** (optional, for daily updates):

```bash
cp backend/.env.example backend/.env
```

```env
SPOTIFY_CLIENT_ID=your_client_id_here
SPOTIFY_CLIENT_SECRET=your_client_secret_here
SPOTIFY_REDIRECT_URI=http://127.0.0.1:5173/callback
DATABASE_URL=mongodb://localhost:27017/niche
PORT=3001
CRON_SCHEDULE=0 6 * * *
FRONTEND_ORIGIN=http://127.0.0.1:5173
```

### 3. Run

Requires **Node 18+** (use `nvm use 20` if needed).

**Frontend only:**

```bash
npm install
npm run dev:web
```

**Frontend + backend** (recommended for Discover Daily auto-update):

```bash
npm install
cd backend && npm install && cd ..
npm run dev
```

- Web: **http://127.0.0.1:5173**
- API: **http://127.0.0.1:3001** (proxied as `/api` in dev)

MongoDB must be running for the backend. Easiest option (Docker):

```bash
npm run db:up
```

Or install locally: `brew install mongodb-community` then `brew services start mongodb-community`.

## Features

### Playlist dashboard

- Connect / disconnect Spotify (Authorization Code + PKCE in the browser)
- Paginated fetch of every playlist in your library — owned, followed, and collaborative
- Stats: total, yours, collaborative, followed
- Search by playlist name or owner
- Filter by type (all / yours / collaborative / followed)
- Sort playlists (library order, name, track count, owner, type, public/collaborative)
- Adjustable grid tile size and refresh from Spotify
- **MongoDB cache** (when the backend + MongoDB are running): playlist library, per-playlist tracks (including Liked Songs), liked-song membership, enriched track metadata (popularity, etc.), and audio features are stored server-side for 24 hours. The browser keeps a fast local mirror; Spotify is only called on cache miss or refresh.

### Playlist detail

- **List** and **album-art grid** views (heart icon shows whether each track is in Liked Songs)
- Sort tracks by playlist order, artist, album, popularity, release date, duration, tempo, valence, danceability, or acousticness (audio sorts load Spotify audio features on demand)
- **30-second previews** on hover (Spotify embed proxy; optional backend preview route when running the API)
- **Detect duplicates** — finds multiple versions of the same song (remix, live, deluxe, remaster, etc.), highlights them in the track list, and lets you remove extras
- **Search & replace** — swap a track for a more popular studio version when one exists
- Edit **your** and **collaborative** playlists (followed playlists are read-only)

### Discover Daily

Builds or updates a private Spotify playlist named **Niche Daily** (30 tracks, one standout track per artist):

- **Genre-based discovery** — finds new artists by genre search, not by replaying your top tracks
- **Anchor artists** (optional) — branch from related artists around up to 5 artists you paste in
- **Exclude playlists** (optional) — block every artist on up to 10 playlists you already know
- **Artist popularity** band (Spotify 0–100)
- **Max followers** cap — limit how big an artist can be (follower count proxy; API has no monthly listeners)
- **Generate Niche Daily** on demand in the browser
- **Enable daily updates** (optional backend + MongoDB) — cron regenerates the playlist each morning and persists your options server-side

If Spotify’s `/recommendations` endpoint is unavailable for your app ([common for new apps since 2024](https://developer.spotify.com/blog/2024-11-27-changes-to-the-web-api)), Niche falls back to related-artist and genre search logic automatically.

### Discover Daily — important

1. **Re-connect after updating** — new scopes require **Disconnect** → **Connect with Spotify** again.
2. **Recommendations API** — Spotify [restricted](https://developer.spotify.com/blog/2024-11-27-changes-to-the-web-api) `/recommendations` for many new apps (404). Niche **automatically falls back** to related artists + top tracks.
3. **Daily cron** — requires backend + MongoDB. Click **Enable daily updates** on the Discover page, or run `npm run dev:api` and subscribe.
4. **Not a public Spotify integration** — a deployed Niche instance is tied to one Developer app and its 5-user allowlist. Others who want the same experience should **clone the repo** and use their own Client ID (and allowlist), not a shared production URL unless you explicitly added them in the Dashboard.

## Project structure

```
src/                   # Vite frontend
  api/client.ts        # Backend API client
  discover/
    engine.ts          # Niche Daily orchestration (browser)
    artistDiscover.ts  # Genre + anchor artist discovery
    fallback.ts        # Related-artists fallback when recommendations 404
    options.ts         # Discover options + localStorage
    view.ts            # Discover Daily UI
  playlist/
    detailView.ts      # Playlist list/grid, sort, previews
    detectDuplicates.ts
    trackReplace.ts
  spotify/
    auth.ts            # PKCE login, token refresh
    api.ts             # Spotify API client
    playlistEdit.ts    # Remove / replace tracks in playlists

backend/               # Express API (optional)
  src/
    routes/            # auth, users, discover, preview
    services/          # spotify, discover engine, user jobs
    jobs/              # daily cron
    db/models/         # MongoDB user schema
```

See **[HANDOFF.md](./HANDOFF.md)** for the full backend spec and migration notes.

## API (backend)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/health` | Health check |
| `POST` | `/api/auth/token` | Exchange auth code (client secret) |
| `POST` | `/api/auth/refresh` | Refresh access token |
| `POST` | `/api/users/subscribe` | Enable daily updates + first generation |
| `POST` | `/api/users/unsubscribe` | Remove user from DB |
| `GET` | `/api/users/:userId` | Options + playlist id (no refresh token) |
| `POST` | `/api/users/options` | Save playlist options |
| `POST` | `/api/discover/generate` | Manual server-side generation |
