const TOKEN_URL = 'https://accounts.spotify.com/api/token'
const API_ROOT = 'https://api.spotify.com/v1'

import { config } from '../config.js'

export interface TokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
  token_type: string
}

export interface SpotifyUser {
  id: string
  country?: string
}

export class SpotifyApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string
  ) {
    super(message)
    this.name = 'SpotifyApiError'
  }
}

export function isInvalidGrant(err: unknown): boolean {
  if (err instanceof SpotifyApiError) {
    return err.status === 400 && err.code === 'invalid_grant'
  }
  if (err instanceof Error) {
    return /invalid_grant/i.test(err.message)
  }
  return false
}

async function parseTokenError(res: Response): Promise<never> {
  const data = (await res.json().catch(() => ({}))) as {
    error?: string
    error_description?: string
  }
  throw new SpotifyApiError(
    data.error_description ?? data.error ?? 'Token request failed',
    res.status,
    data.error
  )
}

export async function exchangeAuthCode(
  code: string,
  redirectUri: string
): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: config.spotify.clientId,
    client_secret: config.spotify.clientSecret,
  })

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  if (!res.ok) await parseTokenError(res)
  return res.json() as Promise<TokenResponse>
}

export async function refreshAccessToken(
  refreshToken: string
): Promise<{ accessToken: string; refreshToken: string }> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: config.spotify.clientId,
    client_secret: config.spotify.clientSecret,
  })

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  if (!res.ok) await parseTokenError(res)

  const data = (await res.json()) as TokenResponse
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? refreshToken,
  }
}

export async function validateUser(
  userId: string,
  accessToken: string
): Promise<SpotifyUser> {
  const me = await spotifyFetch<SpotifyUser>('/me', accessToken)
  if (me.id !== userId) {
    throw new SpotifyApiError('Access token does not match userId', 403)
  }
  return me
}

function parseSpotifyError(status: number, body: unknown): string {
  const err = body as {
    error?: { message?: string; status?: number }
    error_description?: string
  }
  return (
    err.error?.message ??
    err.error_description ??
    (typeof err.error === 'string' ? err.error : null) ??
    `Spotify API error (${status})`
  )
}

export async function spotifyFetch<T>(
  path: string,
  accessToken: string
): Promise<T> {
  const url = path.startsWith('http') ? path : `${API_ROOT}${path}`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new SpotifyApiError(parseSpotifyError(res.status, err), res.status)
  }

  return res.json() as Promise<T>
}

export async function spotifyPut(
  path: string,
  accessToken: string,
  body: unknown
): Promise<void> {
  const res = await fetch(`${API_ROOT}${path}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new SpotifyApiError(parseSpotifyError(res.status, err), res.status)
  }
}

export async function spotifyPost<T>(
  path: string,
  accessToken: string,
  body: unknown
): Promise<T> {
  const res = await fetch(`${API_ROOT}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new SpotifyApiError(parseSpotifyError(res.status, err), res.status)
  }

  return res.json() as Promise<T>
}
