import type { HBuilderXCommandOptions } from '../../packages/hbuilderx-runner/src/types'
import type { LocalWorkerContext } from './local-worker/server'
import { access, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { localBrowserCommand, verifyBrowserLocal } from './browser-local'
import { verifyWorkerRoutes } from './local-worker/assertions'
import { runLocalCommand } from './local-worker/command'
import { withLocalWorker } from './local-worker/server'
import { verifyInstalledBaselines } from './visual-baselines/install'

vi.mock('./local-worker/assertions', () => ({ verifyWorkerRoutes: vi.fn() }))
vi.mock('./local-worker/command', () => ({ runLocalCommand: vi.fn() }))
vi.mock('./local-worker/server', () => ({ withLocalWorker: vi.fn() }))
vi.mock('./visual-baselines/install', () => ({ verifyInstalledBaselines: vi.fn() }))

const websiteRoot = fileURLToPath(new URL('..', import.meta.url))
let controller: AbortController
let context: LocalWorkerContext

beforeEach(() => {
  controller = new AbortController()
  context = { websiteRoot, baseUrl: new URL('http://127.0.0.1:45678/'), signal: controller.signal, request: vi.fn() }
  vi.mocked(withLocalWorker).mockImplementation(async action => action(context))
})
afterEach(() => vi.resetAllMocks())

function writePlan(source: unknown) {
  vi.mocked(runLocalCommand).mockImplementation(async (command) => {
    if (command.args.includes('--list')) {
      const file = command.env?.PLAYWRIGHT_JSON_OUTPUT_FILE
      if (!file) {
        throw new Error('发现命令缺少本轮 JSON 文件')
      }
      await writeFile(file, typeof source === 'string' ? source : JSON.stringify(source))
    }
  })
}

function discoveryFile(command: HBuilderXCommandOptions) {
  return command.env!.PLAYWRIGHT_JSON_OUTPUT_FILE!
}

it('相同命令先发现全量计划，再为浏览器调用传入独立预算', async () => {
  writePlan({ errors: [], suites: [{ specs: [{ tests: Array.from({ length: 2397 }, (_, index) => ({ projectName: ['chromium', 'firefox', 'webkit'][index % 3] })) }] }] })
  const command = localBrowserCommand(context)
  await verifyBrowserLocal({ websiteRoot })
  expect(verifyWorkerRoutes).toHaveBeenCalledWith(context)
  expect(runLocalCommand).toHaveBeenCalledTimes(2)
  const [discovery, execution] = vi.mocked(runLocalCommand).mock.calls
  expect(discovery[0]).toMatchObject({ command: command.command, cwd: command.cwd, stdio: 'pipe' })
  expect(discovery[0].args).toEqual([...command.args, '--list', '--reporter=json'])
  expect(discovery[0].env).toMatchObject(command.env)
  expect(discovery[1].aborted).toBe(false)
  expect(discovery[2]).toBe(20_000)
  expect(execution[0]).toEqual(command)
  expect(execution[1]).toBe(context.signal)
  expect(execution[2]).toBe(4_914_000)
  await expect(access(discoveryFile(discovery[0]))).rejects.toMatchObject({ code: 'ENOENT' })
})

it.each([
  { errors: [{ message: '配置加载失败' }], suites: [] },
  { errors: [], suites: [] },
  { errors: [], suites: [{ specs: [{ tests: [null] }] }] },
  'invalid json',
])('发现失败或计划无效时不启动浏览器，并清除本轮计划文件 (%j)', async (plan) => {
  writePlan(plan)
  await expect(verifyBrowserLocal({ websiteRoot })).rejects.toThrow()
  expect(runLocalCommand).toHaveBeenCalledTimes(1)
  const command = vi.mocked(runLocalCommand).mock.calls[0][0]
  expect(command.args).toContain('--list')
  await expect(access(discoveryFile(command))).rejects.toMatchObject({ code: 'ENOENT' })
})

it('发现命令被取消时保留原因且不启动实际测试', async () => {
  const reason = new Error('计划发现取消')
  vi.mocked(runLocalCommand).mockRejectedValue(reason)
  await expect(verifyBrowserLocal({ websiteRoot })).rejects.toBe(reason)
  expect(runLocalCommand).toHaveBeenCalledTimes(1)
  await expect(access(discoveryFile(vi.mocked(runLocalCommand).mock.calls[0][0]))).rejects.toMatchObject({ code: 'ENOENT' })
})

it('发现已写出有效计划后取消，仍不启动实际测试', async () => {
  const reason = new Error('发现完成时取消')
  vi.mocked(runLocalCommand).mockImplementation(async (command) => {
    await writeFile(discoveryFile(command), JSON.stringify({ errors: [], suites: [{ specs: [{ tests: [{ projectName: 'chromium' }] }] }] }))
    controller.abort(reason)
  })
  await expect(verifyBrowserLocal({ websiteRoot })).rejects.toBe(reason)
  expect(runLocalCommand).toHaveBeenCalledTimes(1)
  await expect(access(discoveryFile(vi.mocked(runLocalCommand).mock.calls[0][0]))).rejects.toMatchObject({ code: 'ENOENT' })
})

it('取消已发生时不启动发现命令', async () => {
  const reason = new Error('启动前取消')
  controller.abort(reason)
  await expect(verifyBrowserLocal({ websiteRoot })).rejects.toBe(reason)
  expect(runLocalCommand).not.toHaveBeenCalled()
})

it('黄金图缺少来源或审查时，在启动 Worker 之前失败', async () => {
  const reason = new Error('黄金图没有来源')
  vi.mocked(verifyInstalledBaselines).mockRejectedValueOnce(reason)
  await expect(verifyBrowserLocal({ websiteRoot })).rejects.toBe(reason)
  expect(withLocalWorker).not.toHaveBeenCalled()
  expect(runLocalCommand).not.toHaveBeenCalled()
})
