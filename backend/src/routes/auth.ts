import { Router } from 'express'
import { config } from '../config.js'
import {
  exchangeAuthCode,
  refreshAccessToken,
  isInvalidGrant,
  SpotifyApiError,
} from '../services/spotify.js'
export const authRouter = Router()

authRouter.post('/token', async (req, res) => {
  try {
    const { code, redirectUri } = req.body as {
      code?: string
      redirectUri?: string
    }

    if (!code) {
      res.status(400).json({ error: 'code is required' })
      return
    }

    const tokens = await exchangeAuthCode(
      code,
      redirectUri ?? config.spotify.redirectUri
    )

    if (!tokens.refresh_token) {
      res.status(400).json({
        error:
          'No refresh token returned. Disconnect the app in Spotify settings and try again.',
      })
      return
    }

    res.json({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_in: tokens.expires_in,
    })
  } catch (err) {
    const message =
      err instanceof SpotifyApiError ? err.message : 'Token exchange failed'
    res.status(400).json({ error: message })
  }
})

authRouter.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body as { refreshToken?: string }
    if (!refreshToken) {
      res.status(400).json({ error: 'refreshToken is required' })
      return
    }

    const tokens = await refreshAccessToken(refreshToken)
    res.json({ accessToken: tokens.accessToken })
  } catch (err) {
    if (isInvalidGrant(err)) {
      res.status(401).json({ error: 'invalid_grant' })
      return
    }
    const message =
      err instanceof SpotifyApiError ? err.message : 'Refresh failed'
    res.status(400).json({ error: message })
  }
})
