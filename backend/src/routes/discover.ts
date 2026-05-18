import { Router } from 'express'
import { config } from '../config.js'
import { findUserById } from '../db/models/user.js'
import { generateForUserId } from '../services/userService.js'
import { updateAllUsers } from '../services/userService.js'

export const discoverRouter = Router()

discoverRouter.post('/generate', async (req, res) => {
  try {
    const { userId, market } = req.body as {
      userId?: string
      market?: string
    }

    if (!userId) {
      res.status(400).json({ error: 'userId is required' })
      return
    }

    const user = await findUserById(userId)
    if (!user) {
      res.status(404).json({ error: 'User not subscribed' })
      return
    }

    const result = await generateForUserId(userId, market ?? 'US')
    res.json({ result, user: { playlistId: result.playlistId } })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Generate failed'
    res.status(500).json({ error: message })
  }
})

export const adminRouter = Router()

adminRouter.post('/force', async (req, res) => {
  const { clientSecret } = req.body as { clientSecret?: string }

  if (
    !config.adminClientSecret ||
    clientSecret !== config.adminClientSecret
  ) {
    res.status(403).json({ error: 'Forbidden' })
    return
  }

  const summary = await updateAllUsers()
  res.json({ success: true, ...summary })
})
