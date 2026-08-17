import { getPool } from '../client.js'

export const PLAYLIST_CACHE_TTL_MS = 24 * 60 * 60 * 1000

export interface CacheEntry<T = unknown> {
  payload: T
  fetchedAt: Date
}

export function isCacheFresh(fetchedAt: Date): boolean {
  return Date.now() - fetchedAt.getTime() < PLAYLIST_CACHE_TTL_MS
}

export async function cacheGet<T>(
  userId: string,
  kind: string,
  key: string
): Promise<CacheEntry<T> | null> {
  const { rows } = await getPool().query<{ payload: T; fetched_at: Date }>(
    'SELECT payload, fetched_at FROM cache WHERE user_id = $1 AND kind = $2 AND key = $3',
    [userId, kind, key]
  )
  return rows[0] ? { payload: rows[0].payload, fetchedAt: rows[0].fetched_at } : null
}

export async function cacheGetMany<T>(
  userId: string,
  kind: string,
  keys: string[]
): Promise<Map<string, CacheEntry<T>>> {
  const map = new Map<string, CacheEntry<T>>()
  if (!keys.length) return map

  const { rows } = await getPool().query<{
    key: string
    payload: T
    fetched_at: Date
  }>(
    'SELECT key, payload, fetched_at FROM cache WHERE user_id = $1 AND kind = $2 AND key = ANY($3)',
    [userId, kind, keys]
  )
  for (const row of rows) {
    map.set(row.key, { payload: row.payload, fetchedAt: row.fetched_at })
  }
  return map
}

export async function cachePut(
  userId: string,
  kind: string,
  key: string,
  payload: unknown
): Promise<void> {
  await getPool().query(
    `INSERT INTO cache (user_id, kind, key, payload, fetched_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (user_id, kind, key)
     DO UPDATE SET payload = EXCLUDED.payload, fetched_at = EXCLUDED.fetched_at, updated_at = now()`,
    [userId, kind, key, JSON.stringify(payload)]
  )
}

export async function cacheDelete(
  userId: string,
  kind: string,
  key?: string
): Promise<void> {
  if (key !== undefined) {
    await getPool().query(
      'DELETE FROM cache WHERE user_id = $1 AND kind = $2 AND key = $3',
      [userId, kind, key]
    )
  } else {
    await getPool().query('DELETE FROM cache WHERE user_id = $1 AND kind = $2', [
      userId,
      kind,
    ])
  }
}

export async function cacheDeleteAll(userId: string): Promise<void> {
  await getPool().query('DELETE FROM cache WHERE user_id = $1', [userId])
}
