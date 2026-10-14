import type { SpawnedHBuilderXCommand } from '../../../packages/hbuilderx-runner/src/types'
import { EventEmitter } from 'node:events'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { afterEach, expect, it, vi } from 'vitest'
import * as processTools from '../../../packages/hbuilderx-runner/src/process'
import { localBrowserCommand } from '../browser-local'
import { resolveWranglerCommand, runLocalCommand } from './command'
import localConfig from './playwright.config'

const websiteRoot = fileURLToPath(new URL('../..', import.meta.url))
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

it('从导出的包 manifest 解析 Wrangler bin，并固定本地地址与默认环境', async () => {
  const command = await resolveWranglerCommand(websiteRoot, 45678)
  expect(command.command).toBe(process.execPath)
  expect(command.cwd).toBe(websiteRoot)
  expect(path.basename(command.args[0])).toBe('wrangler.js')
  expect(command.args.slice(1)).toEqual(['dev', '--config', path.join(websiteRoot, 'wrangler.jsonc'), '--env', '', '--local', '--ip', '127.0.0.1', '--port', '45678', '--inspector-port', '0'])
  expect(command.args).not.toContain('--remote')
})

it('三浏览器只访问本轮 URL，显式后台运行且禁止更新基线', () => {
  vi.stubEnv('PLAYWRIGHT_BASE_URL', 'https://unrelated.example/')
  vi.stubEnv('PLAYWRIGHT_CHROMIUM_CHANNEL', 'chrome')
  const command = localBrowserCommand({ websiteRoot, baseUrl: new URL('http://127.0.0.1:45678/'), signal: new AbortController().signal, request: vi.fn() })
  expect(command.env).toMatchObject({ CI: '1', PLAYWRIGHT_BASE_URL: 'http://127.0.0.1:45678/', PLAYWRIGHT_HTML_OPEN: 'never' })
  expect(command.env.PLAYWRIGHT_CHROMIUM_CHANNEL).toBe('chrome')
  expect(command.args).toEqual([expect.stringMatching(/cli\.js$/), 'test', '--config', path.join(websiteRoot, 'scripts', 'local-worker', 'playwright.config.ts'), '--project=chromium', '--project=firefox', '--project=webkit', '--update-snapshots=none'])
  expect(localConfig.testDir).toBe(path.join(websiteRoot, 'tests'))
  expect(localConfig.use?.headless).toBe(true)
  expect(localConfig.projects?.map(project => project.name)).toEqual(['chromium', 'firefox', 'webkit'])
  expect(localConfig.projects?.every(project => project.use?.headless === true)).toBe(true)
  expect(localConfig.updateSnapshots).toBe('none')
})

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
})

it('命令失败与命令收尾失败同时保留，服务作用域仍可继续收尾', async () => {
  const cleanup = new Error('browser close failed')
  vi.spyOn(processTools, 'spawnCommand').mockReturnValueOnce({
    child: Object.assign(new EventEmitter(), { pid: 424242 }),
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
