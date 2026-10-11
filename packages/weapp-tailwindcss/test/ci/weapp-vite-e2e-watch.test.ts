import { EventEmitter } from 'node:events'
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { PassThrough } from 'node:stream'
import { fileURLToPath } from 'node:url'
import { isWatchReadyOutput, resolveWatchPlatform, runWeappViteWatch } from '../../../../scripts/weapp-vite-e2e-watch.mjs'
import { buildDemoBaseCases } from '../../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/cases/demo/base'

describe('weapp-vite e2e watch platform', () => {
  it('defaults to the mini-program platform used by the output assertions', () => {
    expect(resolveWatchPlatform({})).toBe('weapp')
  })

  it.each(['weapp', 'web', 'all'] as const)('accepts the explicit %s platform', (platform) => {
    expect(resolveWatchPlatform({
      WEAPP_VITE_E2E_WATCH_PLATFORM: platform,
    })).toBe(platform)
  })

  it('rejects unsupported platforms before starting the watcher', () => {
    expect(() => resolveWatchPlatform({
      WEAPP_VITE_E2E_WATCH_PLATFORM: 'unknown',
    })).toThrow('Unsupported WEAPP_VITE_E2E_WATCH_PLATFORM: unknown')
  })

  it('waits for the actual build-ready signal before mutating sources', () => {
    expect(isWatchReadyOutput('根据 Vite 项目根目录自动推断 appType -> weapp-vite')).toBe(false)
    expect(isWatchReadyOutput('开发服务已就绪')).toBe(true)
  })

  it('uses native classic HMR without an additional build writer', () => {
    const watchCase = buildDemoBaseCases('/repository').find(item => item.name === 'weapp-vite-tailwindcss-v4')

    expect(watchCase?.env).toMatchObject({
      WEAPP_VITE_E2E_WATCH_HMR_RUNTIME: 'classic',
    })
    expect(watchCase?.env).not.toHaveProperty('WEAPP_VITE_E2E_WATCH_BUILD_FALLBACK')
    expect(watchCase?.maxPluginProcessMs).toBe(1_000)
  })
})

const fixtures: Array<Awaited<ReturnType<typeof createFixture>>> = []

async function createFixture(env: NodeJS.ProcessEnv = {}) {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'weapp vite single writer '))
  const packageDir = path.join(cwd, 'node_modules', 'weapp-vite')
  await mkdir(path.join(packageDir, 'bin'), { recursive: true })
  await writeFile(path.join(cwd, 'package.json'), '{"type":"module"}')
  await writeFile(path.join(packageDir, 'package.json'), JSON.stringify({
    name: 'weapp-vite',
    bin: { 'weapp-vite': './bin/project-cli.mjs' },
  }))
  await copyFile(fileURLToPath(new URL('../fixtures/weapp-vite-watch/cli.mjs', import.meta.url)), path.join(packageDir, 'bin/project-cli.mjs'))
  await writeFile(path.join(cwd, 'input.txt'), 'initial')
  const signals = new EventEmitter()
  const output = new PassThrough()
  let logs = ''
  let settled = false
  output.on('data', (chunk) => {
    logs += chunk.toString()
  })
  const result = runWeappViteWatch({ cwd, env: { ...process.env, ...env }, signals: signals as typeof process, stdout: output as typeof process.stdout, stderr: output as typeof process.stderr })
    .then(() => undefined, error => error as Error)
    .finally(() => { settled = true })
  const fixture = {
    cwd,
    signals,
    result,
    logs: () => logs,
    settled: () => settled,
    events: async () => {
      const text = await readFile(path.join(cwd, 'events.jsonl'), 'utf8').catch(() => '')
      return text.trim() ? text.trim().split('\n').map(line => JSON.parse(line)) : []
    },
  }
  fixtures.push(fixture)
  return fixture
}

afterEach(async () => {
  for (const fixture of fixtures.splice(0)) {
    fixture.signals.emit('SIGTERM')
    await fixture.result
    await rm(fixture.cwd, { recursive: true, force: true })
  }
})

it('旧 fallback 配置在启动任何 CLI 前失败', async () => {
  const fixture = await createFixture({ WEAPP_VITE_E2E_WATCH_BUILD_FALLBACK: '1' })
  expect((await fixture.result)?.message).toContain('competing output writers')
  expect(await fixture.events()).toEqual([])
})

it.each(['stdout', 'stderr'])('同一真实 CLI 跨 %s 分片就绪后持续处理新增、替换和回滚', async (readyStream) => {
  const fixture = await createFixture({ READY_STREAM: readyStream })
  await vi.waitFor(() => expect(fixture.logs()).toContain('开发服务已就绪'), { timeout: 3000 })
  for (const value of ['added', 'replaced', 'initial']) {
    await writeFile(path.join(fixture.cwd, 'input.txt'), value)
    await vi.waitFor(async () => expect(await readFile(path.join(fixture.cwd, 'output.txt'), 'utf8')).toBe(value))
  }
  expect(fixture.settled()).toBe(false)
  expect((await fixture.events()).filter(event => event.kind === 'start')).toHaveLength(1)
  fixture.signals.emit('SIGTERM')
  if (process.platform === 'win32') {
    expect((await fixture.result)?.message).toContain('SIGTERM')
  }
  else {
    expect(await fixture.result).toBeUndefined()
  }
  expect(fixture.signals.listenerCount('SIGTERM')).toBe(0)
})

it.each([
  ['before', '0'],
  ['before', '2'],
  ['after', '0'],
  ['after', '2'],
])('真实 CLI 在就绪 %s 自行退出 %s 必须失败', async (phase, code) => {
  const fixture = await createFixture({ EXIT_PHASE: phase, EXIT_CODE: code })
  expect((await fixture.result)?.message).toContain(`exited ${phase} ready: ${code}`)
  expect(fixture.signals.listenerCount('SIGINT')).toBe(0)
  expect(fixture.signals.listenerCount('SIGTERM')).toBe(0)
})

it.skipIf(process.platform === 'win32').each(['startup', 'running'])('取消 %s 时保留监听并等待子进程实际清理，重复信号不抢先退出', async (phase) => {
  const fixture = await createFixture({ NO_READY: phase === 'startup' ? '1' : '0' })
  await vi.waitFor(async () => expect(await fixture.events()).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'start' })])))
  if (phase === 'running') {
    await vi.waitFor(() => expect(fixture.logs()).toContain('开发服务已就绪'))
  }
  fixture.signals.emit('SIGTERM')
  await vi.waitFor(async () => expect(await fixture.events()).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'closing' })])))
  fixture.signals.emit('SIGTERM')
  fixture.signals.emit('SIGINT')
  expect(fixture.settled()).toBe(false)
  expect(fixture.signals.listenerCount('SIGTERM')).toBe(1)
  expect(await fixture.result).toBeUndefined()
  const events = await fixture.events()
  expect(events.filter(event => event.kind === 'closing')).toHaveLength(1)
  expect(events.at(-1).kind).toBe('closed')
  expect(fixture.signals.listenerCount('SIGTERM')).toBe(0)
})

it('意外 exit 后尚未 close 时收到取消，不能把失败改写为正常停止', async () => {
  const fixture = await createFixture({ EXIT_PHASE: 'after', EXIT_CODE: '0', HOLD_PIPE: '1' })
  let pid: number
  await vi.waitFor(async () => {
    pid = (await fixture.events()).find(event => event.kind === 'start')?.pid
    expect(pid).toBeGreaterThan(0)
    expect(() => process.kill(pid, 0)).toThrow()
  })
  expect(fixture.settled()).toBe(false)
  fixture.signals.emit('SIGTERM')
  expect((await fixture.result)?.message).toContain('exited after ready: 0')
})

it.skipIf(process.platform === 'win32')('收到关闭请求后的 SIGKILL 仍必须报告失败', async () => {
  const fixture = await createFixture({ STOP_MODE: 'kill' })
  await vi.waitFor(() => expect(fixture.logs()).toContain('开发服务已就绪'))
  fixture.signals.emit('SIGTERM')
  expect((await fixture.result)?.message).toContain('SIGKILL')
})
