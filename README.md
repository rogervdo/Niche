# Niche — Spotify playlist dashboard

A small Vite app that connects to your Spotify account and lists every playlist in your library: ones you own, ones you follow, and collaborative playlists.

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

1. Open [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) → **Create app**.
2. Under **Settings** → **Redirect URIs**, add exactly:
   ```
   http://127.0.0.1:5173/callback
   ```
3. Copy the **Client ID** and **Client Secret**.

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

- Connect / disconnect Spotify
- Paginated fetch of all playlists in your library
- Dashboard stats: total, yours, collaborative, followed
- Search and filter
- Playlist detail view with track list
- **Discover Daily** — [discoverify](https://github.com/ethanzohar/discoverify)-style recommendations:
  - Random seeds from your top artists/tracks (short / medium / long term)
  - Mood sliders (acousticness, energy, valence, etc.)
  - Writes a **Niche Daily** playlist (30 tracks)
  - **Enable daily updates** (with backend) — cron regenerates the playlist each morning

### Discover Daily — important

1. **Re-connect after updating** — new scopes require **Disconnect** → **Connect with Spotify** again.
2. **Recommendations API** — Spotify [restricted](https://developer.spotify.com/blog/2024-11-27-changes-to-the-web-api) `/recommendations` for many new apps (404). Niche **automatically falls back** to related artists + top tracks.
3. **Daily cron** — requires backend + MongoDB. Click **Enable daily updates** on the Discover page, or run `npm run dev:api` and subscribe.

## Project structure

```
src/                   # Vite frontend
  api/client.ts        # Backend API client
  discover/
    engine.ts          # recommendations + orchestration (browser)
    fallback.ts        # related-artists fallback
    options.ts         # seeds + sliders
    view.ts            # Discover Daily UI
  spotify/
    auth.ts            # PKCE login, token refresh
    api.ts             # Spotify API client

backend/               # Express API (optional)
  src/
    routes/            # auth, users, discover, admin
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
