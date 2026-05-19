import cors from 'cors'
import express from 'express'
import { config } from './config.js'
import { connectDb } from './db/client.js'
import { startDailyPlaylistJob } from './jobs/dailyPlaylist.js'
import { ensureDb } from './middleware/ensureDb.js'
import { authRouter } from './routes/auth.js'
import { adminRouter, discoverRouter } from './routes/discover.js'
import { previewRouter } from './routes/preview.js'
import { usersRouter } from './routes/users.js'

const app = express()

app.use(
  cors({
    origin: config.frontendOrigin,
    credentials: true,
  })
)
app.use(express.json())

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, now: new Date().toISOString() })
})

app.use('/api/preview', previewRouter)
app.use('/api/auth', authRouter)
app.use('/api/users', ensureDb, usersRouter)
app.use('/api/discover', ensureDb, discoverRouter)
app.use('/api/admin', ensureDb, adminRouter)

const isVercel = Boolean(process.env.VERCEL)

if (!isVercel) {
  async function main(): Promise<void> {
    await connectDb()
    startDailyPlaylistJob()
    const host = process.env.HOST ?? '127.0.0.1'
    app.listen(config.port, host, () => {
      console.log(`Niche API listening on http://${host}:${config.port}`)
    })
  }

  main().catch((err) => {
    console.error('Failed to start server:', err)
    process.exit(1)
  })
}

export default app
