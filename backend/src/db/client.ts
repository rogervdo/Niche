import pg from 'pg'
import { config } from '../config.js'

let pool: pg.Pool | null = null

export function getPool(): pg.Pool {
  if (!pool) {
    pool = new pg.Pool({
      connectionString: config.databaseUrl,
      max: 10,
      idleTimeoutMillis: 30_000,
    })
  }
  return pool
}

async function ensureSchema(): Promise<void> {
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS users (
      user_id TEXT PRIMARY KEY,
      refresh_token TEXT NOT NULL,
      playlist_id TEXT,
      last_updated TIMESTAMPTZ,
      known_artist_ids JSONB NOT NULL DEFAULT '[]',
      known_artists_updated_at TIMESTAMPTZ,
      playlist_options JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `)
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS cache (
      user_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      key TEXT NOT NULL,
      payload JSONB NOT NULL,
      fetched_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, kind, key)
    )
  `)
}

export async function connectDb(): Promise<void> {
  try {
    await getPool().query('SELECT 1')
    await ensureSchema()
  } catch (err) {
    const hint =
      'Is the database reachable? Check DATABASE_URL (expects a PostgreSQL connection string).'
    throw new Error(`${hint}\n${err instanceof Error ? err.message : String(err)}`, { cause: err })
  }
}

export async function disconnectDb(): Promise<void> {
  if (pool) {
    await pool.end()
    pool = null
  }
}
