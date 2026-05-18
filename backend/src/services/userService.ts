import {
  deleteUserById,
  findUserById,
  getDecryptedRefreshToken,
  toPublicUser,
  User,
  type UserDocument,
} from '../db/models/user.js'
import { DEFAULT_OPTIONS, mergeOptions, type PlaylistOptions } from '../discover/options.js'
import { generateDiscoverPlaylist } from '../services/discover.js'
import {
  isInvalidGrant,
  refreshAccessToken,
  validateUser,
} from '../services/spotify.js'

export async function generateForUser(
  user: UserDocument,
  market = 'US'
): Promise<ReturnType<typeof generateDiscoverPlaylist>> {
  const refreshToken = getDecryptedRefreshToken(user)
  const { accessToken, refreshToken: newRefresh } =
    await refreshAccessToken(refreshToken)

  if (newRefresh !== refreshToken) {
    user.refreshToken = newRefresh
  }

  const result = await generateDiscoverPlaylist(
    user.userId,
    mergeOptions(user.playlistOptions),
    accessToken,
    market,
    user.playlistId
  )

  user.playlistId = result.playlistId
  user.lastUpdated = new Date()
  await user.save()

  return result
}

export async function generateForUserId(
  userId: string,
  market = 'US'
): Promise<ReturnType<typeof generateDiscoverPlaylist>> {
  const user = await findUserById(userId)
  if (!user) {
    throw new Error('User not subscribed')
  }
  return generateForUser(user, market)
}

export async function updateAllUsers(): Promise<{
  updated: number
  failed: number
  removed: number
}> {
  const users = await User.find()
  let updated = 0
  let failed = 0
  let removed = 0

  for (const user of users) {
    try {
      await generateForUser(user)
      updated += 1
    } catch (err) {
      if (isInvalidGrant(err)) {
        await deleteUserById(user.userId)
        removed += 1
      } else {
        console.error(`Failed to update playlist for ${user.userId}:`, err)
        failed += 1
      }
    }
  }

  return { updated, failed, removed }
}

export async function requireValidAccess(
  userId: string,
  accessToken: string
): Promise<void> {
  await validateUser(userId, accessToken)
}

export { mergeOptions, DEFAULT_OPTIONS, type PlaylistOptions, toPublicUser }
