import { getPool } from '../client.js'
import { decrypt, encrypt } from '../../lib/crypto.js'
import { mergeOptions, type PlaylistOptions } from '../../discover/options.js'

export interface IUser {
  userId: string
  refreshToken: string
  playlistId: string | null
  lastUpdated: Date | null
  playlistOptions: PlaylistOptions
  knownArtistIds: string[]
  knownArtistsUpdatedAt: Date | null
}

export interface UserDocument extends IUser {}

interface UserRow {
  user_id: string
  refresh_token: string
  playlist_id: string | null
  last_updated: Date | null
  known_artist_ids: string[] | null
  known_artists_updated_at: Date | null
  playlist_options: PlaylistOptions | null
}

const USER_COLUMNS =
  'user_id, refresh_token, playlist_id, last_updated, known_artist_ids, known_artists_updated_at, playlist_options'

function rowToUser(row: UserRow): UserDocument {
  return {
    userId: row.user_id,
    refreshToken: decrypt(row.refresh_token),
    playlistId: row.playlist_id,
    lastUpdated: row.last_updated,
    knownArtistIds: row.known_artist_ids ?? [],
    knownArtistsUpdatedAt: row.known_artists_updated_at,
    playlistOptions: mergeOptions(row.playlist_options ?? undefined),
  }
}

export function toPublicUser(user: UserDocument) {
  return {
    userId: user.userId,
    playlistId: user.playlistId,
    lastUpdated: user.lastUpdated,
    playlistOptions: mergeOptions(user.playlistOptions),
  }
}

export async function findUserById(userId: string): Promise<UserDocument | null> {
  const { rows } = await getPool().query<UserRow>(
    `SELECT ${USER_COLUMNS} FROM users WHERE user_id = $1`,
    [userId]
  )
  return rows[0] ? rowToUser(rows[0]) : null
}

export async function deleteUserById(userId: string): Promise<void> {
  await getPool().query('DELETE FROM users WHERE user_id = $1', [userId])
}

export async function listUsers(): Promise<UserDocument[]> {
  const { rows } = await getPool().query<UserRow>(
    `SELECT ${USER_COLUMNS} FROM users ORDER BY user_id`
  )
  return rows.map(rowToUser)
}

export async function saveUser(user: UserDocument): Promise<UserDocument> {
  const { rows } = await getPool().query<UserRow>(
    `UPDATE users SET
       refresh_token = $2,
       playlist_id = $3,
       last_updated = $4,
       known_artist_ids = $5,
       known_artists_updated_at = $6,
       playlist_options = $7,
       updated_at = now()
     WHERE user_id = $1
     RETURNING ${USER_COLUMNS}`,
    [
      user.userId,
      encrypt(user.refreshToken),
      user.playlistId,
      user.lastUpdated,
      JSON.stringify(user.knownArtistIds),
      user.knownArtistsUpdatedAt,
      JSON.stringify(user.playlistOptions),
    ]
  )
  return rowToUser(rows[0]!)
}

export async function upsertUser(
  userId: string,
  refreshToken: string,
  options?: Partial<PlaylistOptions>
): Promise<UserDocument> {
  const existing = await findUserById(userId)

  if (existing) {
    return saveUser({
      ...existing,
      refreshToken,
      playlistOptions: options
        ? mergeOptions({ ...existing.playlistOptions, ...options })
        : existing.playlistOptions,
    })
  }

  const { rows } = await getPool().query<UserRow>(
    `INSERT INTO users (user_id, refresh_token, playlist_options)
     VALUES ($1, $2, $3)
     RETURNING ${USER_COLUMNS}`,
    [userId, encrypt(refreshToken), JSON.stringify(mergeOptions(options))]
  )
  return rowToUser(rows[0]!)
}
