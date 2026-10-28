import type { SpawnedHBuilderXCommand } from '../../../packages/hbuilderx-runner/src/types'
import { execFile } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { promisify, stripVTControlCharacters } from 'node:util'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import * as processTools from '../../../packages/hbuilderx-runner/src/process'
import * as processTree from '../../../scripts/demo-e2e-workflow/process-tree'
import { formatWorkflowError, runWithCleanup } from '../../../scripts/e2e-preflight/cleanup'
import { localBrowserCommand } from '../browser-local'
import { resolveWranglerCommand, runLocalCommand as runCommand } from './command'
import localConfig from './playwright.config.mts'
import { createLocalTestScope, localIntegrationTimeout, localTestCleanupMs } from './test-scope'

const websiteRoot = fileURLToPath(new URL('../..', import.meta.url))
const platform = Object.getOwnPropertyDescriptor(process, 'platform')!
let scope: ReturnType<typeof createLocalTestScope>
beforeEach(({ signal }) => {
  scope = createLocalTestScope(signal)
})
function runLocalCommand(options: Parameters<typeof runCommand>[0], signal: AbortSignal, timeoutMs?: number) {
  return scope.run(signal => runCommand(options, signal, timeoutMs), signal)
}
afterEach(async () => {
  await runWithCleanup(() => scope.close(), () => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    Object.defineProperty(process, 'platform', platform)
  })
}, localTestCleanupMs)

it('从导出的包 manifest 解析 Wrangler bin，并固定本地地址与默认环境', async () => {
  const command = await resolveWranglerCommand(websiteRoot, 45678)
  expect(command.command).toBe(process.execPath)
  expect(command.cwd).toBe(websiteRoot)
  expect(path.basename(command.args[0])).toBe('wrangler.js')
  expect(command.args.slice(1)).toEqual(['dev', '--config', path.join(websiteRoot, 'wrangler.jsonc'), '--env', '', '--local', '--ip', '127.0.0.1', '--port', '45678', '--inspector-port', '0'])
  expect(command.args).not.toContain('--remote')
})

it('next 验证显式选择独立 Wrangler 环境', async () => {
  const command = await resolveWranglerCommand(websiteRoot, 45678, 'next')
  expect(command.args.slice(command.args.indexOf('--env'), command.args.indexOf('--env') + 2)).toEqual(['--env', 'next'])
  expect(command.args).toContain('--local')
})

it('三浏览器只访问本轮 URL，显式后台运行且禁止更新基线', () => {
  vi.stubEnv('PLAYWRIGHT_BASE_URL', 'https://unrelated.example/')
  vi.stubEnv('PLAYWRIGHT_CHROMIUM_CHANNEL', 'chrome')
  const command = localBrowserCommand({ websiteRoot, baseUrl: new URL('http://127.0.0.1:45678/'), signal: new AbortController().signal, request: vi.fn() })
  expect(command.env).toMatchObject({ CI: '1', PLAYWRIGHT_BASE_URL: 'http://127.0.0.1:45678/', PLAYWRIGHT_HTML_OPEN: 'never' })
  expect(command.env.PLAYWRIGHT_CHROMIUM_CHANNEL).toBe('chrome')
  expect(command.args).toEqual([expect.stringMatching(/cli\.js$/), 'test', '--config', path.join(websiteRoot, 'scripts', 'local-worker', 'playwright.config.mts'), '--project=chromium', '--project=firefox', '--project=webkit', '--update-snapshots=none'])
  expect(localConfig.testDir).toBe(path.join(websiteRoot, 'tests'))
  expect(localConfig.use?.headless).toBe(true)
  expect(localConfig.projects?.map(project => project.name)).toEqual(['chromium', 'firefox', 'webkit'])
  expect(localConfig.projects?.every(project => project.use?.headless === true)).toBe(true)
  expect(localConfig.updateSnapshots).toBe('none')
  expect(localConfig.workers).toBe(1)
  expect(localConfig.retries).toBe(0)
  expect(localConfig.maxFailures).toBe(1)
  expect(localConfig.use?.trace).toBe('retain-on-failure')
  expect(localConfig.timeout).toBe(60_000)
  expect(localConfig.expect?.timeout).toBe(60_000)
  expect(localConfig.expect?.toHaveScreenshot?.maxDiffPixels).toBe(5)
})

it.each(['local', 'default'] as const)('由实际 Playwright CLI 加载 %s 配置并发现三浏览器用例', async (mode) => {
  const command = localBrowserCommand({ websiteRoot, baseUrl: new URL('http://127.0.0.1:45678/'), signal: new AbortController().signal, request: vi.fn() })
  const args = mode === 'local' ? command.args : [command.args[0], 'test']
  const { stdout } = await promisify(execFile)(command.command, [...args, '--list', '--reporter=json'], {
    cwd: command.cwd,
    env: command.env,
    timeout: 20_000,
    maxBuffer: 10 * 1024 * 1024,
  })
  const report = JSON.parse(stdout)
  expect(report.errors).toEqual([])
  expect(report.config.projects.map((project: { name: string }) => project.name)).toEqual(['chromium', 'firefox', 'webkit'])
  expect(report.suites.length).toBeGreaterThan(0)
  if (mode === 'local') {
    expect(report.config.maxFailures).toBe(1)
    expect(report.config.projects.every((project: { retries: number }) => project.retries === 0)).toBe(true)
  }
}, 25_000)

it('真实本地 CLI 在首个失败后不重试或调度后续用例', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'website-first-failure-'))
  const sentinel = path.join(directory, 'executed.jsonl')
  const reportPath = path.join(directory, 'report.json')
  const playwrightUrl = pathToFileURL(path.join(websiteRoot, 'node_modules', '@playwright', 'test', 'index.mjs')).href
  const configPath = path.join(directory, 'playwright.config.mts')
  try {
    await writeFile(path.join(directory, 'package.json'), JSON.stringify({ type: 'module' }))
    await writeFile(configPath, `
      import { defineConfig } from ${JSON.stringify(playwrightUrl)}
      import config from ${JSON.stringify(pathToFileURL(path.join(websiteRoot, 'scripts', 'local-worker', 'playwright.config.mts')).href)}
      export default defineConfig({ ...config, testDir: ${JSON.stringify(directory)}, testMatch: '**/gate.spec.ts', outputDir: ${JSON.stringify(path.join(directory, 'results'))}, reporter: [['json', { outputFile: ${JSON.stringify(reportPath)} }]] })
    `)
    await writeFile(path.join(directory, 'gate.spec.ts'), `
      import { appendFile } from 'node:fs/promises'
      import { expect, test } from ${JSON.stringify(playwrightUrl)}
      test('first failure', async () => {
        await appendFile(${JSON.stringify(sentinel)}, JSON.stringify({ test: 'first', retry: test.info().retry }) + '\\n')
        expect(false).toBe(true)
      })
      test('must not run', async () => {
        await appendFile(${JSON.stringify(sentinel)}, JSON.stringify({ test: 'later' }) + '\\n')
      })
    `)
    const command = localBrowserCommand({ websiteRoot, baseUrl: new URL('http://127.0.0.1:45678/'), signal: new AbortController().signal, request: vi.fn() })
    const failure = await runLocalCommand({
      ...command,
      env: { ...command.env, FORCE_COLOR: '1' },
      args: [command.args[0], 'test', '--config', configPath],
    }, new AbortController().signal, 20_000).then(() => undefined, error => error)
    expect(failure?.message, formatWorkflowError(failure)).toContain('exit=1 signal=null')
    const report = JSON.parse(await readFile(reportPath, 'utf8'))
    expect(report.errors.map((error: { message: string }) => ({ ...error, message: stripVTControlCharacters(error.message) }))).toEqual([{ message: 'Testing stopped early after 1 maximum allowed failures.' }])
    const executed = (await readFile(sentinel, 'utf8')).trim().split('\n').map(line => JSON.parse(line))
    expect(executed).toEqual([{ test: 'first', retry: 0 }])
    expect(report.config.maxFailures).toBe(1)
    expect(report.stats.unexpected).toBe(1)
    expect(report.stats.flaky).toBe(0)
    expect(report.config.projects.every((project: { retries: number }) => project.retries === 0)).toBe(true)
  }
  finally {
    await rm(directory, { recursive: true, force: true })
  }
}, localIntegrationTimeout(1, 20_000))

it('取消已发生时不启动任何命令', async () => {
  const controller = new AbortController()
  const reason = new Error('cancelled before spawn')
  controller.abort(reason)
  const spawn = vi.spyOn(processTools, 'spawnCommand')
  await expect(runLocalCommand({ command: 'unused', args: [], cwd: websiteRoot }, controller.signal)).rejects.toBe(reason)
  expect(spawn).not.toHaveBeenCalled()
})

it('命令超时后等待真实合成进程关闭，不留下后台命令', async () => {
  const spawn = vi.spyOn(processTools, 'spawnCommand')
  await expect(runLocalCommand({ command: process.execPath, args: ['-e', 'setInterval(() => {}, 1000)'], cwd: websiteRoot }, new AbortController().signal, 80)).rejects.toThrow('本地命令超时')
  const child = spawn.mock.results[0].value.child
  expect(child.exitCode !== null || child.signalCode !== null).toBe(true)
  expect(() => process.kill(child.pid, 0)).toThrow()
}, localIntegrationTimeout(1, 80))

it('命令失败与命令收尾失败同时保留，服务作用域仍可继续收尾', async () => {
  Object.defineProperty(process, 'platform', { ...platform, value: 'linux' })
  vi.spyOn(processTree, 'createWorkflowProcessTree').mockImplementation(child => ({
    capture: async () => new Map([[child.pid!, { pid: child.pid!, parent: 1, group: child.pid!, started: new Date().toISOString() }]]),
    stop: vi.fn(async () => {}),
  }))
  const cleanup = new Error('browser close failed')
  vi.spyOn(processTools, 'spawnCommand').mockReturnValueOnce({
    child: Object.assign(new EventEmitter(), { pid: 424242, exitCode: null, signalCode: null }),
    logs: ['test assertion failed'],
    closed: Promise.resolve({ code: 2, signal: null }),
    stop: vi.fn().mockRejectedValue(cleanup),
  } as unknown as SpawnedHBuilderXCommand)
  const error = await runLocalCommand({ command: 'browser', args: ['test'], cwd: websiteRoot }, new AbortController().signal).catch(error => error)
  expect(error).toBeInstanceOf(AggregateError)
  expect(error.errors[0].message).toContain('本地命令失败')
  expect(error.errors[0].message).toContain('test assertion failed')
  expect(error.errors[1]).toBe(cleanup)
})
