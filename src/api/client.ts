import type { PlaylistOptions } from '../discover/options'

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? ''

export interface PublicUser {
  userId: string
  playlistId: string | null
  lastUpdated: string | null
  playlistOptions: PlaylistOptions
}

async function apiFetch<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })

  const data = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) {
    throw new Error(data.error ?? `API error (${res.status})`)
  }
  return data
}

export async function isBackendAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/health`)
    return res.ok
  } catch {
    return false
  }
}

export async function getUser(
  userId: string
): Promise<{ user: PublicUser; now: string } | null> {
  try {
    return await apiFetch(`/api/users/${encodeURIComponent(userId)}`)
  } catch {
    return null
  }
}

export async function subscribe(
  userId: string,
  refreshToken: string,
  options?: PlaylistOptions
): Promise<PublicUser> {
  const data = await apiFetch<{ user: PublicUser }>('/api/users/subscribe', {
    method: 'POST',
    body: JSON.stringify({ userId, refreshToken, options }),
  })
  return data.user
}

export async function unsubscribe(
  userId: string,
  accessToken: string
): Promise<void> {
  await apiFetch('/api/users/unsubscribe', {
    method: 'POST',
    body: JSON.stringify({ userId, accessToken }),
  })
}

export async function saveUserOptions(
  userId: string,
  accessToken: string,
  options: PlaylistOptions
): Promise<PublicUser> {
  const data = await apiFetch<{ user: PublicUser }>('/api/users/options', {
    method: 'POST',
    body: JSON.stringify({ userId, accessToken, options }),
  })
  return data.user
}

export async function restoreUserOptions(
  userId: string,
  accessToken: string
): Promise<PublicUser> {
  const data = await apiFetch<{ user: PublicUser }>(
    '/api/users/restore-options',
    {
      method: 'POST',
      body: JSON.stringify({ userId, accessToken }),
    }
  )
  return data.user
}

export async function generatePlaylist(
  userId: string,
  market?: string
): Promise<{
  playlistId: string
  trackCount: number
  playlistUrl: string
  mode: 'niche-artists'
  artistCount?: number
  targetGenres?: string[]
}> {
  const data = await apiFetch<{
    result: {
      playlistId: string
      trackCount: number
      playlistUrl: string
      mode: 'niche-artists'
      artistCount?: number
      targetGenres?: string[]
    }
  }>('/api/discover/generate', {
    method: 'POST',
    body: JSON.stringify({ userId, market }),
  })
  return data.result
}
