import cron from 'node-cron'
import { config } from '../config.js'
import { updateAllUsers } from '../services/userService.js'

let running = false

export function startDailyPlaylistJob(): void {
  if (!cron.validate(config.cronSchedule)) {
    console.warn(
      `Invalid CRON_SCHEDULE "${config.cronSchedule}" — daily job disabled`
    )
    return
  }

  cron.schedule(config.cronSchedule, async () => {
    if (running) {
      console.warn('Daily playlist job already running — skipping')
      return
    }

    running = true
    console.log('Starting daily playlist update…')
    try {
      const summary = await updateAllUsers()
      console.log('Daily playlist update complete:', summary)
    } catch (err) {
      console.error('Daily playlist update failed:', err)
    } finally {
      running = false
    }
  })

  console.log(`Daily playlist cron scheduled: ${config.cronSchedule}`)
}
