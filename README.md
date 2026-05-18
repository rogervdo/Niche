# Niche — Spotify playlist dashboard

A small Vite app that connects to your Spotify account and lists every playlist in your library: ones you own, ones you follow, and collaborative playlists.

## How Spotify connection works

This project is inspired by [discoverify](https://github.com/ethanzohar/discoverify), which uses a **backend** to swap the OAuth code for tokens (client secret stays on the server) and stores refresh tokens in a database for daily cron jobs.

**Niche** is a browser-only dashboard, so it uses **[Authorization Code with PKCE](https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow)** instead:

| | Discoverify | Niche |
|---|-------------|-------|
| Token exchange | Node backend + client secret | Browser + PKCE (no secret) |
| Refresh token | Saved in MongoDB | `sessionStorage` (this tab only) |
| Best for | Scheduled server tasks | Interactive tools / dashboards |

Flow:

1. **Connect** → redirect to Spotify authorize URL (like discoverify’s `SpotifyHelper.getOAuthCodeUrl`)
2. **Callback** → `/callback?code=...` → exchange code for access + refresh token
3. **API** → `GET /v1/me/playlists` with Bearer token ([docs](https://developer.spotify.com/documentation/web-api/reference/get-list-users-playlists))

Scopes: `playlist-read-private`, `playlist-read-collaborative`, `user-read-private`.

## Setup

### 1. Spotify Developer Dashboard

1. Open [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) → **Create app**.
2. Under **Settings** → **Redirect URIs**, add exactly:
   ```
   http://127.0.0.1:5173/callback
   ```
   (Spotify recommends `127.0.0.1` over `localhost`.)
3. Copy the **Client ID**.

### 2. Environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
VITE_SPOTIFY_CLIENT_ID=your_client_id_here
VITE_REDIRECT_URI=http://127.0.0.1:5173/callback
```

### 3. Run

Requires **Node 18+** (use `nvm use 20` if needed).

```bash
npm install
npm run dev
```

Open **http://127.0.0.1:5173** (match the redirect URI host).

## Features

- Connect / disconnect Spotify
- Paginated fetch of all playlists in your library
- Dashboard stats: total, yours, collaborative, followed
- Search and filter
- Open any playlist in Spotify

## Project structure

```
src/
  main.ts           # UI + boot
  spotify/
    auth.ts         # PKCE login, token refresh
    api.ts          # /me, /me/playlists
    types.ts
```

## Later: server-backed auth (like discoverify)

If you need background jobs (e.g. auto-updating playlists), add a small Express API:

- `POST /api/spotify/refreshToken` — exchange `code` with `client_secret`
- `POST /api/spotify/accessToken` — refresh access tokens
- Store `refresh_token` per user in a database

See discoverify’s [`discoverDailyRoutes.js`](https://github.com/ethanzohar/discoverify/blob/master/backend/routes/discoverDailyRoutes.js) and [`spotifyHelper.js`](https://github.com/ethanzohar/discoverify/blob/master/backend/helpers/spotifyHelper.js).
