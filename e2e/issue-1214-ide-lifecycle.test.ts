import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { captureMiniProgramViewport } from '../scripts/demo-visual-e2e-report/mini-program-screenshot'
import { formatWorkflowError } from '../scripts/e2e-preflight/cleanup'
import { closeWechatProject } from '../scripts/wechat-project-cleanup'
import { Launcher } from '../scripts/wechat/automator'
import { createLayoutProject } from './issue-1214/ide-project'
import { runLayoutIdeProbe } from './issue-1214/ide-runner'
import { compareLayout } from './issue-1214/layout'
import { buildProject, readOutput } from './issue-1214/project'
import { readLayoutRects } from './issue-1214/read-layout'

vi.mock('../scripts/wechat/automator', () => ({
  Launcher: class {
    launch() {
      throw new Error('unconfigured')
    }
  },
}))
vi.mock('../scripts/wechat-project-cleanup', () => ({ closeWechatProject: vi.fn() }))
vi.mock('../scripts/e2e-preflight/probes/wechat-version', () => ({ wechatVersion: vi.fn() }))
vi.mock('../scripts/demo-visual-e2e-report/mini-program-screenshot', () => ({ captureMiniProgramViewport: vi.fn().mockResolvedValue({ width: 10, height: 10 }) }))
vi.mock('./frameworkIdeDiagnostics', () => ({ collectFrameworkIdeDiagnostics: vi.fn().mockResolvedValue('diagnostics') }))
vi.mock('./issue-1214/ide-project', () => ({ createLayoutProject: vi.fn(), runtimeSpacing: 8 }))
vi.mock('./issue-1214/project', () => ({ buildProject: vi.fn(), readOutput: vi.fn() }))
vi.mock('./issue-1214/read-layout', () => ({ readLayoutRects: vi.fn().mockResolvedValue({ utility: {}, reference: {} }) }))
vi.mock('./issue-1214/layout', () => ({ compareLayout: vi.fn().mockReturnValue({ passed: true }) }))

let dir: string
let close: ReturnType<typeof vi.fn>
let launch: ReturnType<typeof vi.fn>
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'issue-1214-lifecycle-'))
  vi.stubEnv('E2E_PREFLIGHT_WECHAT_CLI', 'fixture')
  close = vi.fn()
  launch = vi.fn()
  vi.spyOn(Launcher.prototype, 'launch').mockImplementation(launch)
  vi.mocked(createLayoutProject).mockImplementation(async (marker) => {
    vi.mocked(readOutput).mockResolvedValue({ wxml: marker, css: '' } as never)
    return { root: dir, output: dir, close } as never
  })
  vi.mocked(buildProject).mockResolvedValue({ stdout: '', stderr: '' } as never)
  vi.mocked(captureMiniProgramViewport).mockResolvedValue({ width: 10, height: 10 } as never)
  vi.mocked(readLayoutRects).mockResolvedValue({ utility: {}, reference: {} } as never)
  vi.mocked(compareLayout).mockReturnValue({ passed: true } as never)
})
afterEach(async () => {
  vi.restoreAllMocks()
  vi.resetAllMocks()
  vi.unstubAllEnvs()
  await fs.rm(dir, { recursive: true, force: true })
})

it('启动失败未移交连接时不二次关闭，但释放临时项目', async () => {
  const error = new AggregateError([new Error('readiness'), new Error('disconnect')], 'launch cleanup failed')
  launch.mockRejectedValue(error)
  vi.mocked(closeWechatProject).mockRejectedValue(new Error('already released'))
  await expect(runLayoutIdeProbe(dir)).rejects.toBe(error)
  expect(closeWechatProject).not.toHaveBeenCalled()
  expect(close).toHaveBeenCalledOnce()
  const [run] = await fs.readdir(dir)
  const evidence = JSON.parse(await fs.readFile(path.join(dir, run!, 'evidence.json'), 'utf8'))
  expect(evidence.error).toContain('readiness')
  expect(evidence.error).toContain('disconnect')
})

it('测量通过但关闭失败时，落盘证据必须记录完整生命周期失败', async () => {
  const client = {
    reLaunch: vi.fn().mockResolvedValue({
      waitForRendered: vi.fn(),
      $: vi.fn().mockResolvedValue({ text: () => vi.mocked(createLayoutProject).mock.lastCall![0] }),
    }),
    systemInfo: vi.fn().mockResolvedValue({ SDKVersion: 'test', model: 'test', system: 'test', platform: 'devtools', windowWidth: 375 }),
  }
  launch.mockResolvedValue(client)
  vi.mocked(closeWechatProject).mockRejectedValue(new Error('close denied'))
  await expect(runLayoutIdeProbe(dir)).rejects.toThrow('close denied')
  const [run] = await fs.readdir(dir)
  const evidence = JSON.parse(await fs.readFile(path.join(dir, run!, 'evidence.json'), 'utf8'))
  expect(evidence.comparison, evidence.error).toMatchObject({ passed: true })
  expect(evidence.status).toBe('failed')
  expect(evidence.error).toContain('close denied')
  expect(close).toHaveBeenCalledOnce()
})

it('证据保存与 IDE 关闭均失败时仍释放项目，保留操作首错和全部次错', async () => {
  const primary = new Error('page failed')
  const client = { reLaunch: vi.fn().mockRejectedValue(primary) }
  launch.mockResolvedValue(client)
  const write = fs.writeFile.bind(fs)
  vi.spyOn(fs, 'writeFile').mockImplementation((file, ...args) => {
    if (path.basename(String(file)) === 'evidence.json') {
      return Promise.reject(new Error('evidence denied'))
    }
    return write(file, ...args)
  })
  vi.mocked(closeWechatProject).mockRejectedValue(new Error('close denied'))
  const error = await runLayoutIdeProbe(dir).catch(error => error)
  expect(error).toBeInstanceOf(AggregateError)
  expect(error.errors[0].errors[0]).toBe(primary)
  expect(formatWorkflowError(error)).toContain('evidence denied')
  expect(formatWorkflowError(error)).toContain('close denied')
  expect(closeWechatProject).toHaveBeenCalledExactlyOnceWith(dir, client)
  expect(close).toHaveBeenCalledOnce()
})
