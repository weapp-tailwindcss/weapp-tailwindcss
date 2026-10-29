import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'

export function createBrowserStartup(timeout, session) {
  assert.ok(Number.isFinite(timeout) && timeout > 0, 'Browser startup timeout must be positive')
  const startedAt = Date.now()
  const deadline = startedAt + timeout
  let phase = 'launch'
  function state() {
    return { phase, timeout, elapsed: Date.now() - startedAt }
  }
  function remaining() {
    const value = deadline - Date.now()
    if (value <= 0) {
      throw new Error(`Browser startup deadline exceeded: ${JSON.stringify(state())}`)
    }
    return value
  }
  async function run(name, operation) {
    phase = name
    return await within(remaining(), () => operation(remaining()), () => `Browser startup deadline exceeded: ${JSON.stringify(state())}`)
  }
  const boundedSession = {
    ensureRunning() {
      session?.ensureRunning()
      remaining()
    },
    log: () => session?.log?.() ?? '',
  }
  return {
    remaining,
    run,
    state,
    mark: (name) => {
      phase = name
    },
    session: boundedSession,
  }
}

export async function within(timeout, operation, message) {
  let timer
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise((resolve, reject) => { timer = setTimeout(() => reject(new Error(message())), timeout) }),
    ])
  }
  finally {
    clearTimeout(timer)
  }
}

export async function launchBrowserPage(chromium, startup) {
  // launch 使用自身的原生截止与进程回收；页面创建超时时父浏览器已经有明确归属。
  const browser = await chromium.launch({ headless: true, timeout: Math.min(30_000, startup.remaining()) })
  try {
    const page = await startup.run('newPage', () => browser.newPage({ viewport: { width: 1200, height: 900 } }))
    return { browser, page }
  }
  catch (error) {
    try {
      await within(5000, () => browser.close(), () => 'Browser cleanup exceeded 5000ms after page creation failure')
    }
    catch (cleanupError) {
      throw new AggregateError([error, cleanupError], `Browser page creation and cleanup failed: ${JSON.stringify(startup.state())}`, { cause: error })
    }
    throw new Error(`Browser page creation failed: ${JSON.stringify(startup.state())}`, { cause: error })
  }
}

export async function closeBrowserInspection(browser, artifactDir, inspection) {
  const results = await Promise.allSettled([
    writeFile(path.join(artifactDir, 'last-inspection.json'), JSON.stringify(inspection ?? {}, null, 2)),
    browser.close(),
  ])
  const errors = results.filter(result => result.status === 'rejected').map(result => result.reason)
  if (errors.length) {
    throw new AggregateError(errors, 'Browser inspection evidence or cleanup failed')
  }
}
