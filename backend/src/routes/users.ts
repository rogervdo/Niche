import { Router } from 'express'
import {
  deleteUserById,
  findUserById,
  toPublicUser,
  upsertUser,
} from '../db/models/user.js'
import { mergeOptions, type PlaylistOptions } from '../discover/options.js'
import {
  generateForUser,
  requireValidAccess,
} from '../services/userService.js'
import { SpotifyApiError } from '../services/spotify.js'

export const usersRouter = Router()

usersRouter.post('/subscribe', async (req, res) => {
  try {
    const { userId, refreshToken, options } = req.body as {
      userId?: string
      refreshToken?: string
      options?: Partial<PlaylistOptions>
    }

    if (!userId || !refreshToken) {
      res.status(400).json({ error: 'userId and refreshToken are required' })
      return
    }

    const user = await upsertUser(userId, refreshToken, options)
    await generateForUser(user)

    res.json({ user: toPublicUser(user) })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Subscribe failed'
    res.status(500).json({ error: message })
  }
})

usersRouter.post('/unsubscribe', async (req, res) => {
  try {
    const { userId, accessToken } = req.body as {
      userId?: string
      accessToken?: string
    }

    if (!userId || !accessToken) {
      res.status(400).json({ error: 'userId and accessToken are required' })
      return
    }

    await requireValidAccess(userId, accessToken)
    await deleteUserById(userId)
    res.json({ success: true })
  } catch (err) {
    const status = err instanceof SpotifyApiError ? err.status : 400
    const message = err instanceof Error ? err.message : 'Unsubscribe failed'
    res.status(status).json({ error: message })
  }
})

usersRouter.get('/:userId', async (req, res) => {
  const user = await findUserById(req.params.userId)
  if (!user) {
    res.status(404).json({ error: 'User not found' })
    return
  }

  res.json({ user: toPublicUser(user), now: new Date().toISOString() })
})

usersRouter.post('/restore-options', async (req, res) => {
  try {
    const { userId, accessToken } = req.body as {
      userId?: string
      accessToken?: string
    }

    if (!userId || !accessToken) {
      res.status(400).json({ error: 'userId and accessToken are required' })
      return
    }

    await requireValidAccess(userId, accessToken)

    const user = await findUserById(userId)
    if (!user) {
      res.status(404).json({ error: 'User not found' })
      return
    }

    user.playlistOptions = mergeOptions()
    await user.save()
    res.json({ user: toPublicUser(user) })
  } catch (err) {
    const status = err instanceof SpotifyApiError ? err.status : 400
    const message = err instanceof Error ? err.message : 'Restore failed'
    res.status(status).json({ error: message })
  }
})

usersRouter.post('/options', async (req, res) => {
  try {
    const { userId, accessToken, options } = req.body as {
      userId?: string
      accessToken?: string
      options?: Partial<PlaylistOptions>
    }

    if (!userId || !accessToken || !options) {
      res.status(400).json({
        error: 'userId, accessToken, and options are required',
      })
      return
    }

    await requireValidAccess(userId, accessToken)

    const user = await findUserById(userId)
    if (!user) {
      res.status(404).json({ error: 'User not subscribed' })
      return
    }

    user.playlistOptions = mergeOptions({
      ...user.playlistOptions,
      ...options,
    })
    await user.save()
    res.json({ user: toPublicUser(user) })
  } catch (err) {
    const status = err instanceof SpotifyApiError ? err.status : 400
    const message = err instanceof Error ? err.message : 'Save options failed'
    res.status(status).json({ error: message })
  }
})
