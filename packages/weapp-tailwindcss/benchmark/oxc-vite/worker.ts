import type { Browser, Page } from 'playwright'
import type { ViteDevServer } from 'vite'
import type { HmrTimingEvent, MemorySample, Phase, WorkerOptions, WorkerReport } from './types'
import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { fingerprintBuild } from './artifacts'
import { canonicalState, capture, openBrowser, waitForState } from './browser'
import { instrumentNative } from './native'
import { nativeMode } from './options'
import { instrumentParser } from './parser'
import { makeVariants, restoreOwnedSource, writeOwnedSource } from './source'

const options = JSON.parse(process.argv[2]!) as WorkerOptions
const project = path.join(options.root, 'demo', 'web', 'vue-vite-tailwindcss-v4')
const sourceFile = path.join(project, 'src', 'App.vue')
const report: WorkerReport = {
  status: 'running',
  compare: options.compare,
  mode: options.mode,
  pair: options.pair,
  cleanupErrors: [],
  serverErrors: [],
  browserErrors: [],
  diagnostics: { phase: 'build', events: [] },
  parser: { resolved: '', rawTransferSupported: false, counts: {} },
  hmr: [],
  peakNodeRssKiB: 0,
  memoryScope: 'process.resourceUsage().maxRSS：仅本 worker Node 进程的峰值 KiB，不含 Chromium 或其它子进程。',
  restored: false,
}
let browser: Browser | undefined
let page: Page | undefined
let server: ViteDevServer | undefined
let parser: ReturnType<typeof instrumentParser> | undefined
let native: ReturnType<typeof instrumentNative> | undefined
let original: string | undefined
let variants: ReturnType<typeof makeVariants> | undefined
let temporary: string | undefined
let interrupted = false
let timingCapture: TimingCapture | undefined

interface TimingCapture {
  readonly events: HmrTimingEvent[]
  phase: (value: Exclude<Phase, 'self-check'>) => void
  restore: () => void
}

function createTimingCapture(enabled: boolean): TimingCapture {
  let phase: Exclude<Phase, 'self-check'> = 'build'
  const events: HmrTimingEvent[] = []
  const stdout = process.stdout
  const originalWrite = stdout.write
  let pending = ''

  function consume(chunk: string) {
    pending += chunk
    let newline = pending.indexOf('\n')
    while (newline !== -1) {
      const line = pending.slice(0, newline).trimEnd()
      pending = pending.slice(newline + 1)
      if (line.startsWith('[weapp-tailwindcss:hmr] ')) {
        try {
          const event = JSON.parse(line.slice('[weapp-tailwindcss:hmr] '.length)) as Omit<HmrTimingEvent, 'benchmarkPhase'>
          if (typeof event.bundler === 'string' && typeof event.phase === 'string' && typeof event.durationMs === 'number') {
            events.push({ ...event, benchmarkPhase: phase })
          }
        }
        catch {
          // 不让诊断输出解析失败影响 benchmark 主流程。
        }
      }
      newline = pending.indexOf('\n')
    }
  }

  if (enabled) {
    const write = ((...args: Parameters<typeof process.stdout.write>) => {
      const [chunk, encoding] = args
      const text = typeof chunk === 'string'
        ? chunk
        : Buffer.from(chunk).toString(typeof encoding === 'string' ? encoding : undefined)
      consume(text)
      return originalWrite.apply(stdout, args)
    }) as typeof process.stdout.write
    stdout.write = write
  }

  return {
    events,
    phase(value) { phase = value },
    restore() {
      if (enabled) {
        stdout.write = originalWrite
        consume('')
      }
    },
  }
}

function sampleMemory(phase: Exclude<Phase, 'self-check'>, point: MemorySample['point']) {
  if (!options.profile) {
    return
  }
  const memory = process.memoryUsage()
  const toKiB = (bytes: number) => Math.round(bytes / 1024)
  report.memorySamples ??= []
  report.memorySamples.push({
    phase,
    point,
    rssKiB: toKiB(memory.rss),
    heapUsedKiB: toKiB(memory.heapUsed),
    heapTotalKiB: toKiB(memory.heapTotal),
    externalKiB: toKiB(memory.external),
    arrayBuffersKiB: toKiB(memory.arrayBuffers),
  })
}

async function cleanup() {
  // 浏览器和 server 分别释放，单个失败不能阻止源码恢复。
  for (const [name, close] of [
    ['browser', () => browser?.close()],
    ['server', () => server?.close()],
  ] as const) {
    try {
      await close()
    }
    catch (error) {
      report.cleanupErrors.push(`${name}: ${String(error)}`)
    }
  }
  try {
    if (original !== undefined && variants) {
      await restoreOwnedSource(sourceFile, original, Object.values(variants))
      report.restored = true
    }
  }
  catch (error) {
    report.cleanupErrors.push(`restore: ${String(error)}`)
  }
  for (const [name, restore] of [['parser', () => parser?.restore()], ['native', () => native?.restore()]] as const) {
    try {
      restore()
    }
    catch (error) {
      report.cleanupErrors.push(`${name}: ${String(error)}`)
    }
  }
  if (temporary) {
    try {
      await rm(temporary, { recursive: true, force: true })
    }
    catch (error) {
      report.cleanupErrors.push(`temporary: ${String(error)}`)
    }
  }
  sampleMemory('restore', 'after-cleanup')
}

function stop() {
  interrupted = true
  // 只中断已拥有的资源，完整清理统一留给 finally，避免异步创建中的资源漏收。
  void browser?.close().catch(error => report.cleanupErrors.push(`interrupt browser: ${String(error)}`))
  void server?.close().catch(error => report.cleanupErrors.push(`interrupt server: ${String(error)}`))
}
process.once('SIGINT', stop)
process.once('SIGTERM', stop)

async function main() {
  process.env.WEAPP_TW_TARGET = options.target
  process.env.WEAPP_TW_NATIVE = nativeMode(options)
  if (options.profile) {
    process.env.WEAPP_TW_HMR_TIMING = '1'
    process.env.WEAPP_TW_HMR_TIMING_LOG = '0'
  }
  timingCapture = createTimingCapture(options.profile)
  original = await readFile(sourceFile, 'utf8')
  variants = makeVariants(original)
  parser = instrumentParser(options.root, options.mode === 'normal' || options.mode === 'raw' ? options.mode : 'default')
  if (options.compare === 'native') {
    native = instrumentNative(options.root)
    report.native = native.report
  }
  assert(!interrupted, 'worker 收到中断。')
  report.parser = parser.report
  if (options.selfCheck) {
    parser.selfCheck()
    native?.selfCheck()
    report.status = 'self-check'
    return
  }
  temporary = await mkdtemp(path.join(os.tmpdir(), 'weapp-oxc-vite-'))
  const demoRequire = createRequire(path.join(project, 'package.json'))
  const repositoryRequire = createRequire(path.join(options.root, 'package.json'))
  process.env.NODE_ENV = 'production'
  parser.phase('build')
  native?.phase('build')
  timingCapture?.phase('build')
  const buildStarted = performance.now()
  const vite = await import(pathToFileURL(demoRequire.resolve('vite')).href) as typeof import('vite')
  const logger = vite.createLogger('info', { allowClearScreen: false })
  const customLogger = {
    ...logger,
    error(message: string, detail?: Parameters<typeof logger.error>[1]) {
      report.serverErrors.push(message)
      logger.error(message, detail)
    },
  }
  const configFile = path.join(project, 'vite.config.ts')
  const built = await vite.build({ root: project, configFile, customLogger, clearScreen: false, cacheDir: path.join(temporary, 'build-cache'), build: { write: false, emptyOutDir: false } })
  const buildMs = performance.now() - buildStarted
  report.build = { milliseconds: buildMs, ...fingerprintBuild(built) }
  sampleMemory('build', 'after-build')
  assert(!interrupted, 'worker 收到中断。')
  assert.equal(report.serverErrors.length, 0, '生产构建记录了 server error。')
  // Vite build 会保留 NODE_ENV；显式切换到真实 dev 命令的环境，避免禁用 Vue HMR。
  process.env.NODE_ENV = 'development'
  parser.phase('dev-startup')
  native?.phase('dev-startup')
  timingCapture?.phase('dev-startup')
  const startupStarted = performance.now()
  server = await vite.createServer({ root: project, configFile, customLogger, clearScreen: false, cacheDir: path.join(temporary, 'dev-cache'), server: { host: '127.0.0.1', port: 0, strictPort: true } })
  assert.equal(server.config.isProduction, false, 'HMR 验证必须使用开发配置。')
  assert(!interrupted, 'worker 收到中断。')
  await server.listen()
  assert(!interrupted, 'worker 收到中断。')
  const address = server.httpServer?.address()
  assert(address && typeof address === 'object', 'Vite 未提供本任务的监听地址。')
  ;({ browser, page } = await openBrowser(repositoryRequire, report.browserErrors))
  assert(!interrupted, 'worker 收到中断。')
  const diagnostics = report.diagnostics!
  diagnostics.phase = 'dev-startup'
  function record(type: string, detail: string) {
    // 只记录有限事件，失败时区分 CSS 延迟、丢失更新和整页刷新；不增加页面或重试。
    if (diagnostics.events.length < 100) {
      diagnostics.events.push({ phase: diagnostics.phase, milliseconds: performance.now(), type, detail: detail.slice(0, 4000) })
    }
  }
  page.on('framenavigated', (frame) => {
    if (frame === page?.mainFrame()) {
      record('navigation', frame.url())
    }
  })
  page.on('requestfailed', request => record('requestfailed', `${request.url()}: ${request.failure()?.errorText}`))
  page.on('console', message => record(`console:${message.type()}`, message.text()))
  let connected = false
  page.on('websocket', (socket) => {
    socket.on('close', () => record('websocket-close', socket.url()))
    socket.on('socketerror', error => record('websocket-error', error))
    socket.on('framereceived', ({ payload }) => {
      record('hmr', String(payload))
      try {
        connected ||= JSON.parse(String(payload)).type === 'connected'
      }
      catch {
        /* 仅识别 Vite 握手，不处理其它 WebSocket。 */
      }
    })
  })
  await page.goto(`http://127.0.0.1:${address.port}/`, { waitUntil: 'networkidle', timeout: options.timeoutMs })
  const initial = await waitForState(page, 'dev-startup', options.timeoutMs)
  diagnostics.expectedSession = initial.session
  report.startupMs = performance.now() - startupStarted
  sampleMemory('dev-startup', 'after-startup')
  assert(connected, '未观察到 Vite HMR WebSocket 握手。')
  let previous = original
  let textMarkup: string | undefined
  for (const phase of ['text', 'add', 'remove', 'restore'] as const) {
    assert(!interrupted, 'worker 收到中断。')
    assert.equal(await readFile(sourceFile, 'utf8'), previous, 'App.vue 已被外部修改，停止保存。')
    await page.waitForTimeout(150)
    parser.phase(phase)
    native?.phase(phase)
    timingCapture?.phase(phase)
    diagnostics.phase = phase
    assert(!interrupted, 'worker 收到中断，停止保存。')
    const started = performance.now()
    await writeOwnedSource(sourceFile, variants[phase])
    previous = variants[phase]
    const state = await waitForState(page, phase, options.timeoutMs, initial.session)
    if (phase === 'text') {
      textMarkup = state.markup
    }
    if (phase === 'remove') {
      assert.equal(state.markup, textMarkup, '删除新增节点后 DOM 未恢复到文本 HMR 状态。')
    }
    if (phase === 'restore') {
      assert.deepEqual(canonicalState(state), canonicalState(initial), '恢复后 DOM 或计算样式发生漂移。')
    }
    assert.equal(report.browserErrors.length + report.serverErrors.length, 0, 'HMR 存在浏览器或 server error。')
    report.hmr.push({ phase, milliseconds: performance.now() - started, state: canonicalState(state) })
    sampleMemory(phase, 'after-hmr')
  }
  report.status = 'passed'
}

async function run() {
  try {
    await main()
  }
  catch (error) {
    report.status = 'failed'
    report.error = error instanceof Error ? error.stack ?? error.message : String(error)
    // 失败只做一次有限诊断，不启动新页面或重试服务。
    if (page && !page.isClosed()) {
      try {
        report.diagnostics!.failureState = await capture(page)
        await writeFile(`${options.output}.html`, await page.content())
        await page.screenshot({ path: `${options.output}.png`, fullPage: false, timeout: 5000 })
      }
      catch (diagnosticError) {
        report.cleanupErrors.push(`diagnostic: ${String(diagnosticError)}`)
      }
    }
  }
  finally {
    await cleanup()
    if (timingCapture) {
      timingCapture.restore()
      if (options.profile) {
        report.timingEvents = timingCapture.events
      }
    }
    if (report.cleanupErrors.length > 0 || interrupted) {
      report.status = 'failed'
    }
    report.peakNodeRssKiB = process.resourceUsage().maxRSS
    await mkdir(path.dirname(options.output), { recursive: true })
    await writeFile(options.output, `${JSON.stringify(report, null, 2)}\n`)
    process.removeListener('SIGINT', stop)
    process.removeListener('SIGTERM', stop)
    if (report.status === 'failed') {
      process.exitCode = 1
    }
  }
}

void run().catch((error) => {
  process.stderr.write(`${String(error)}\n`)
  process.exitCode = 1
})
