import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { formatWorkflowError } from '../scripts/e2e-preflight/cleanup'
import { closeWechatProject } from '../scripts/wechat-project-cleanup'
import { Launcher } from '../scripts/wechat/automator'
import { runStyleRemovalIdeProbe } from './issue-1241/ide-runner'
import { createProject } from './issue-1241/project'
import { save } from './issue-1241/support'
import { watchSession } from './issue-1241/watch-session'

vi.mock('node:fs/promises', () => ({ writeFile: vi.fn() }))
vi.mock('../scripts/wechat/automator', () => ({ Launcher: class { launch() {} } }))
vi.mock('../scripts/wechat-project-cleanup', () => ({ closeWechatProject: vi.fn() }))
vi.mock('../scripts/e2e-preflight/probes/wechat-version', () => ({ wechatVersion: vi.fn() }))
vi.mock('../scripts/demo-visual-e2e-report/mini-program-screenshot', () => ({ captureMiniProgramViewport: vi.fn() }))
vi.mock('../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/text', () => ({ waitFor: vi.fn() }))
vi.mock('./issue-1241/project', () => ({ createProject: vi.fn(), readOutput: vi.fn() }))
vi.mock('./issue-1241/support', () => ({ save: vi.fn(), artifacts: 'artifacts' }))
vi.mock('./issue-1241/watch-session', () => ({ watchSession: vi.fn() }))
let stop: ReturnType<typeof vi.fn>
let launch: ReturnType<typeof vi.fn>
const output = path.resolve('style-removal-output')
beforeEach(() => {
  vi.stubEnv('E2E_PREFLIGHT_WECHAT_CLI', 'fixture-cli')
  stop = vi.fn()
  launch = vi.fn()
  vi.spyOn(Launcher.prototype, 'launch').mockImplementation(launch)
  vi.mocked(createProject).mockResolvedValue({ root: path.resolve('fixture'), output, pageFile: path.resolve('page.vue') } as never)
  vi.mocked(watchSession).mockReturnValue({ child: { pid: 42 }, stop, logs: () => 'watch log' } as never)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.resetAllMocks()
  vi.unstubAllEnvs()
})

it('启动失败未移交连接时只释放 watcher，保留原错误', async () => {
  const primary = new Error('launch failed')
  launch.mockRejectedValue(primary)
  await expect(runStyleRemovalIdeProbe()).rejects.toBe(primary)
  expect(stop).toHaveBeenCalledOnce()
  expect(closeWechatProject).not.toHaveBeenCalled()
})

it('主体、日志、watcher 和 IDE 收尾均失败时，仍尝试全部清理并保留首错', async () => {
  const primary = new Error('style mutation failed')
  const client = { systemInfo: vi.fn().mockRejectedValue(primary) }
  launch.mockResolvedValue(client)
  vi.spyOn(expect, 'poll').mockReturnValue({ toBe: vi.fn() } as never)
  vi.mocked(save).mockImplementation(async (name) => {
    if (name.endsWith('watch.log')) {
      throw new Error('log denied')
    }
  })
  stop.mockRejectedValue(new Error('watch stop failed'))
  vi.mocked(closeWechatProject).mockRejectedValue(new Error('IDE close failed'))
  const error = await runStyleRemovalIdeProbe().catch(error => error)
  expect(error).toBeInstanceOf(AggregateError)
  expect(error.errors[0]).toBe(primary)
  expect(formatWorkflowError(error)).toContain('log denied')
  expect(formatWorkflowError(error)).toContain('watch stop failed')
  expect(formatWorkflowError(error)).toContain('IDE close failed')
  expect(stop).toHaveBeenCalledOnce()
  expect(closeWechatProject).toHaveBeenCalledExactlyOnceWith(output, client)
})

it('watcher 已启动后写入失败也必须停止本轮 watcher', async () => {
  const primary = new Error('write failed')
  vi.mocked(writeFile).mockResolvedValueOnce(undefined).mockRejectedValueOnce(primary)
  await expect(runStyleRemovalIdeProbe()).rejects.toBe(primary)
  expect(stop).toHaveBeenCalledOnce()
  expect(closeWechatProject).not.toHaveBeenCalled()
})

it('两轮失败的证据目录独立，最终状态包含清理错误', async () => {
  launch.mockRejectedValue(new Error('launch failure'))
  stop.mockRejectedValue(new Error('stop failure'))
  await expect(runStyleRemovalIdeProbe()).rejects.toBeInstanceOf(AggregateError)
  await expect(runStyleRemovalIdeProbe()).rejects.toBeInstanceOf(AggregateError)
  const records = vi.mocked(save).mock.calls.filter(([name]) => path.basename(name) === 'evidence.json')
  expect(records).toHaveLength(2)
  expect(path.dirname(records[0]![0])).not.toBe(path.dirname(records[1]![0]))
  for (const [name, evidence] of records) {
    expect(path.basename(path.dirname(name))).toMatch(/^[a-f0-9-]{36}$/)
    expect(evidence).toMatchObject({ status: 'failed', error: expect.stringContaining('launch failure') })
    expect(evidence).toMatchObject({ error: expect.stringContaining('stop failure') })
  }
})
