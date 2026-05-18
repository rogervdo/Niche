import type { TokenResponse } from './types'

const CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID as string
const REDIRECT_URI = import.meta.env.VITE_REDIRECT_URI as string

const SCOPES = [
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-read-private',
].join(' ')

const VERIFIER_KEY = 'niche_pkce_verifier'
const TOKENS_KEY = 'niche_tokens'

export interface StoredTokens {
  accessToken: string
  refreshToken: string
  expiresAt: number
}

function requireConfig(): void {
  if (!CLIENT_ID || CLIENT_ID === 'your_spotify_client_id_here') {
    throw new Error(
      'Set VITE_SPOTIFY_CLIENT_ID in .env (copy from .env.example). See README.'
    )
  }
  if (!REDIRECT_URI) {
    throw new Error('Set VITE_REDIRECT_URI in .env')
  }
}

function generateRandomString(length: number): string {
  const possible =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  const values = crypto.getRandomValues(new Uint8Array(length))
  return Array.from(values, (x) => possible[x % possible.length]).join('')
}

async function sha256(plain: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder()
  return crypto.subtle.digest('SHA-256', encoder.encode(plain))
}

function base64UrlEncode(input: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(input)))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

async function createCodeChallenge(verifier: string): Promise<string> {
  const hashed = await sha256(verifier)
  return base64UrlEncode(hashed)
}

export function getStoredTokens(): StoredTokens | null {
  const raw = sessionStorage.getItem(TOKENS_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as StoredTokens
  } catch {
    return null
  }
}

function storeTokens(tokens: StoredTokens): void {
  sessionStorage.setItem(TOKENS_KEY, JSON.stringify(tokens))
}

export function clearAuth(): void {
  sessionStorage.removeItem(TOKENS_KEY)
  sessionStorage.removeItem(VERIFIER_KEY)
}

/** Redirect to Spotify — same idea as discoverify's getOAuthCodeUrl, with PKCE added. */
export async function loginWithSpotify(): Promise<void> {
  requireConfig()
  const verifier = generateRandomString(64)
  sessionStorage.setItem(VERIFIER_KEY, verifier)
  const challenge = await createCodeChallenge(verifier)

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    scope: SCOPES,
    redirect_uri: REDIRECT_URI,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    state: generateRandomString(16),
  })

  window.location.href = `https://accounts.spotify.com/authorize?${params}`
}

async function exchangeCode(code: string): Promise<StoredTokens> {
  const verifier = sessionStorage.getItem(VERIFIER_KEY)
  if (!verifier) {
    throw new Error('Missing PKCE verifier. Try connecting again.')
  }

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
    client_id: CLIENT_ID,
    code_verifier: verifier,
  })

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  const data = (await res.json()) as TokenResponse & { error?: string }
  if (!res.ok) {
    throw new Error(data.error ?? 'Token exchange failed')
  }
  if (!data.refresh_token) {
    throw new Error('No refresh token returned. Disconnect the app in Spotify settings and try again.')
  }

  sessionStorage.removeItem(VERIFIER_KEY)

  const tokens: StoredTokens = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000 - 60_000,
  }
  storeTokens(tokens)
  return tokens
}

async function refreshAccessToken(refreshToken: string): Promise<StoredTokens> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: CLIENT_ID,
  })

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  const data = (await res.json()) as TokenResponse & { error?: string }
  if (!res.ok) {
    clearAuth()
    throw new Error(data.error ?? 'Session expired. Connect again.')
  }

  const tokens: StoredTokens = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? refreshToken,
    expiresAt: Date.now() + data.expires_in * 1000 - 60_000,
  }
  storeTokens(tokens)
  return tokens
}

/** Handle /callback?code=... after Spotify redirect (discoverify stores code in Redirect.js). */
export async function handleAuthCallback(): Promise<boolean> {
  const params = new URLSearchParams(window.location.search)
  const code = params.get('code')
  const error = params.get('error')

  if (error) {
    throw new Error(`Spotify denied access: ${error}`)
  }
  if (!code) return false

  await exchangeCode(code)
  window.history.replaceState({}, '', window.location.pathname)
  return true
}

export async function getAccessToken(): Promise<string> {
  requireConfig()
  let tokens = getStoredTokens()
  if (!tokens) {
    throw new Error('Not connected')
  }

  if (Date.now() >= tokens.expiresAt) {
    tokens = await refreshAccessToken(tokens.refreshToken)
  }

  return tokens.accessToken
}

export function isConfigured(): boolean {
  return Boolean(CLIENT_ID && CLIENT_ID !== 'your_spotify_client_id_here' && REDIRECT_URI)
}
