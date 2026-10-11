import assert from 'node:assert/strict'
import { createWriteStream } from 'node:fs'
import { createServer } from 'node:net'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'
import { stripVTControlCharacters } from 'node:util'
import { execa } from 'execa'
import { captureOwnedProcessGroups, signalOwnedProcessGroup } from './process-groups.mjs'

export function developmentEnvironment(env) {
  return {
    ...env,
    NODE_ENV: 'development',
    BROWSERSLIST_ENV: 'development',
  }
}

export async function freePort(host = '127.0.0.1') {
  const server = createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, host, resolve)
  })
  const port = server.address().port
  await new Promise(resolve => server.close(resolve))
  return port
}

export function start(args, cwd, env, logFile) {
  return startProcess('pnpm', args, cwd, env, logFile)
}

export function startProcess(command, args, cwd, env, logFile) {
  let log = ''
  const output = logFile ? createWriteStream(logFile) : undefined
  if (process.env.DEMO_MATRIX_PROCESS_DIAGNOSTICS === '1') {
    // 使用文件 URL 跨越子进程 cwd、Windows 盘符和空格边界。
    const diagnostic = new URL('./process-diagnostic.cjs', import.meta.url).href
    env = { ...env, NODE_OPTIONS: `${env.NODE_OPTIONS ?? process.env.NODE_OPTIONS ?? ''} --trace-exit --trace-uncaught --import=${diagnostic}` }
  }
  if (process.env.DEMO_MATRIX_WATCH_DIAGNOSTICS === '1') {
    const diagnostic = new URL('./watch-lifecycle-diagnostic.cjs', import.meta.url).href
    env = { ...env, NODE_OPTIONS: `${env.NODE_OPTIONS ?? process.env.NODE_OPTIONS ?? ''} --import=${diagnostic}` }
  }
  const child = execa(command, args, { cwd, env: { CI: '1', ...env }, detached: process.platform !== 'win32', reject: false })
  for (const stream of [child.stdout, child.stderr]) {
    stream.on('data', (data) => {
      log += data.toString()
      output?.write(data)
    })
  }
  let settled = false
  let stopping
  const done = child.then((result) => {
    settled = true
    output?.end()
    return result
  })
  async function stop() {
    if (!settled) {
      if (process.platform === 'win32') {
        await execa('taskkill', ['/pid', String(child.pid), '/T', '/F'], { reject: false })
      }
      else {
        // pnpm/corepack 可能创建新的后代进程组，必须在父进程退出前记录归属。
        const groups = await captureOwnedProcessGroups(child.pid)
        for (const pid of groups.toReversed()) {
          await signalOwnedProcessGroup(pid, 'SIGTERM')
        }
        const controller = new AbortController()
        try {
          await Promise.race([done, delay(3000, undefined, { signal: controller.signal })])
        }
        finally { controller.abort() }
        // 启动器退出后，后代仍可能持有输出管道；以整个会话完成为准升级信号。
        if (!settled) {
          for (const pid of groups.toReversed()) {
            await signalOwnedProcessGroup(pid, 'SIGKILL')
          }
        }
      }
    }
    await done
  }
  return {
    log: () => log,
    done,
    ensureRunning() {
      assert.equal(child.exitCode, null, log)
      assert.equal(child.signalCode, null, log)
    },
    stop() {
      stopping ??= stop()
      return stopping
    },
  }
}

export async function until(check, session, timeout = 180_000) {
  const deadline = Date.now() + timeout
  let lastError
  while (Date.now() < deadline) {
    session?.ensureRunning()
    try {
      return await check()
    }
    catch (error) { lastError = error }
    await delay(300)
  }
  throw new Error(`${lastError?.stack}\n${session?.log() ?? ''}`)
}

export function assertViteWatchBuildComplete(log, offset = 0) {
  const current = stripVTControlCharacters(log.slice(offset))
  const completed = [...current.matchAll(/built in [\d.]+\s*m?s\./g)].at(-1)
  assert.ok(completed && completed.index > current.lastIndexOf('build started...'), 'Vite has not finished writing this build')
}

export function assertWeappViteWatchReady(log) {
  const current = stripVTControlCharacters(log)
  const completed = current.lastIndexOf('小程序初次构建完成')
  assert.ok(completed >= 0 && current.lastIndexOf('开发服务已就绪：') > completed, 'weapp-vite has not completed its initial build and watcher setup')
}

export function assertTaroWatchBuildComplete(log, offset = 0) {
  if (log.includes('watching for file changes')) {
    return assertViteWatchBuildComplete(log, offset)
  }
  const current = stripVTControlCharacters(log.slice(offset))
  const completed = current.lastIndexOf('Compiled successfully')
  const lastProgress = Math.max(...['setup (', 'building (', 'sealing ('].map(phase => current.lastIndexOf(phase)))
  assert.ok(completed >= 0 && current.lastIndexOf('Watching...') > completed && completed > lastProgress, 'Taro has not completed this compilation and resumed watching')
}

export function assertUniWatchBuildComplete(log, offset = 0) {
  const current = stripVTControlCharacters(log.slice(offset))
  const completed = current.lastIndexOf('Build complete. Watching for changes')
  assert.ok(completed >= 0 && completed > current.lastIndexOf('Compiling...'), 'uni-app has not completed this compilation')
  if (offset === 0) {
    assert.match(current, /ready in \d+ms\./, 'uni-app watcher is not ready')
  }
}

export function assertMpxWatchBuildComplete(log, offset = 0) {
  const current = stripVTControlCharacters(log.slice(offset))
  const completed = [...current.matchAll(/Compiled (?:successfully|with some warnings)/g)].at(-1)
  assert.ok(completed && completed.index > current.lastIndexOf('Compiling '), 'Mpx has not completed this compilation')
}

export function assertGulpWatchBuildComplete(log, offset = 0) {
  const current = stripVTControlCharacters(log.slice(offset))
  const completed = Math.max(current.lastIndexOf('build complete'), offset === 0 ? current.lastIndexOf('watching for changes') : -1)
  const pending = Math.max(...[' is changed', ' is added', ' is deleted', ' failed '].map(event => current.lastIndexOf(event)))
  assert.ok(completed >= 0 && completed > pending, 'Gulp has not completed this compilation and resumed watching')
}

export async function complete(session, timeout = 600_000) {
  let timer
  try {
    const result = await Promise.race([
      session.done,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`Build timed out\n${session.log()}`)), timeout) }),
    ])
    assert.equal(result.exitCode, 0, session.log())
  }
  finally {
    clearTimeout(timer)
  }
}
