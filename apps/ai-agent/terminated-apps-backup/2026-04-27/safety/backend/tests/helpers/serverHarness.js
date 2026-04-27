/* eslint-disable no-console */
const { spawn } = require('child_process')
const path = require('path')

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function parsePort(baseUrl) {
  try {
    const parsed = new URL(baseUrl)
    if (parsed.port) return Number(parsed.port)
  } catch {
    // fallback below
  }
  return Number(process.env.PORT || 5200)
}

async function isHealthy(baseUrl) {
  try {
    const response = await fetch(`${baseUrl}/api/health`)
    return response.ok
  } catch {
    return false
  }
}

function attachLogBuffer(processRef) {
  let logs = ''
  const append = (chunk) => {
    logs += String(chunk || '')
    if (logs.length > 16000) logs = logs.slice(-16000)
  }

  if (processRef.stdout) processRef.stdout.on('data', append)
  if (processRef.stderr) processRef.stderr.on('data', append)
  return () => logs
}

async function waitForHealth(baseUrl, timeoutMs) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if (await isHealthy(baseUrl)) return true
    await sleep(400)
  }
  return false
}

async function stopProcess(processRef) {
  if (!processRef || processRef.killed) return
  processRef.kill('SIGTERM')
  await sleep(700)
  if (!processRef.killed) {
    processRef.kill('SIGKILL')
  }
}

async function ensureBackendServer({
  baseUrl,
  startupTimeoutMs = 45000
}) {
  if (await isHealthy(baseUrl)) {
    return {
      started: false,
      stop: async () => {}
    }
  }

  if (process.env.SMOKE_AUTOSTART === '0') {
    throw new Error(`Backend is not reachable at ${baseUrl} and SMOKE_AUTOSTART=0`)
  }

  const cwd = path.resolve(__dirname, '../../..')
  const port = parsePort(baseUrl)
  const serverProcess = spawn('node', ['backend/server.js'], {
    cwd,
    env: {
      ...process.env,
      PORT: String(port)
    },
    stdio: ['ignore', 'pipe', 'pipe']
  })

  const getLogs = attachLogBuffer(serverProcess)
  const ready = await waitForHealth(baseUrl, startupTimeoutMs)
  if (!ready) {
    const logs = getLogs()
    await stopProcess(serverProcess)
    throw new Error(`Backend failed to start on ${baseUrl}. Recent logs: ${logs || 'none'}`)
  }

  return {
    started: true,
    stop: async () => {
      await stopProcess(serverProcess)
    }
  }
}

module.exports = {
  ensureBackendServer
}

