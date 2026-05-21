#!/usr/bin/env node
/**
 * Fail fast before dev servers start when required ports are taken.
 * Usage: node scripts/check-dev-ports.mjs [5173] [3001]
 */
import net from 'node:net'
import { execSync } from 'node:child_process'

const DEFAULT_PORTS = {
  5173: 'Vite (web)',
  3001: 'API',
}

const ports = process.argv.length > 2
  ? process.argv.slice(2).map((p) => Number(p))
  : Object.keys(DEFAULT_PORTS).map(Number)

function portLabel(port) {
  return DEFAULT_PORTS[port] ?? 'service'
}

function pidOnPort(port) {
  try {
    return execSync(`lsof -tiTCP:${port} -sTCP:LISTEN 2>/dev/null`, {
      encoding: 'utf8',
    }).trim()
  } catch {
    return ''
  }
}

function isPortInUse(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.once('error', (err) => resolve(err.code === 'EADDRINUSE'))
    server.once('listening', () => server.close(() => resolve(false)))
    server.listen(port, host)
  })
}

const blocked = []
for (const port of ports) {
  if (!(port > 0 && port < 65536)) continue
  if (await isPortInUse(port)) {
    const pid = pidOnPort(port)
    blocked.push({ port, pid })
  }
}

if (blocked.length === 0) process.exit(0)

console.error('\nCannot start dev — port(s) already in use:\n')
for (const { port, pid } of blocked) {
  console.error(`  ${port}  ${portLabel(port)}`)
  if (pid) {
    const pids = pid.split(/\s+/).filter(Boolean)
    console.error(`        PID ${pids.join(', ')}  →  kill ${pids[0]}`)
  } else {
    console.error('        (could not detect PID — try: lsof -iTCP:' + port + ' -sTCP:LISTEN)')
  }
}
if (blocked.some((b) => b.port === 5173)) {
  console.error(
    '\n  Port 5173 is fixed in vite.config.ts (Spotify redirect URI). Stop the old server instead of using another port.\n',
  )
} else {
  console.error('')
}
process.exit(1)
