import type { MiniProgram } from '@weapp-vite/miniprogram-automator'
import type { MockInstance } from 'vitest'
import * as fs from 'node:fs/promises'
import { createServer } from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { formatWorkflowError } from '../scripts/e2e-preflight/cleanup'
import * as projectCleanup from '../scripts/wechat-project-cleanup'
import { wechatRequest } from '../scripts/wechat/service'
import { withTemplateAppId } from './template-ide/project-config'
import { createTemplateIdeArtifacts, withTemplateIdeSession } from './template-ide/session'

const { launch } = vi.hoisted(() => ({ launch: vi.fn() }))
vi.mock('../scripts/wechat/automator', () => ({ Launcher: class { launch = launch } }))

describe('模板 IDE 会话的错误与资源归属', () => {
  let artifactDir: string
  let options: Parameters<typeof withTemplateIdeSession>[0]
  let close: MockInstance<typeof projectCleanup.closeWechatProject>
  const cleanup: Array<() => Promise<void>> = []

  function connection() {
    const screenshot = vi.fn().mockResolvedValue(undefined)
    const mini = { screenshot, disconnect: vi.fn() } as unknown as MiniProgram
    launch.mockResolvedValue(mini)
    return { mini, screenshot }
  }

  beforeEach(async () => {
    artifactDir = await fs.mkdtemp(path.join(os.tmpdir(), 'template-ide-session-'))
    vi.stubEnv('E2E_WECHAT_LOCK_DIRECTORY', artifactDir)
    options = { artifactDir, projectPath: path.join(artifactDir, 'project'), launchTimeoutMs: 1000, closeTimeoutMs: 1000 }
    close = vi.spyOn(projectCleanup, 'closeWechatProject').mockResolvedValue(undefined)
  })
  afterEach(async () => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
    vi.unstubAllEnvs()
    await Promise.all(cleanup.splice(0).map(dispose => dispose()))
    await fs.rm(artifactDir, { recursive: true, force: true })
  })

  it('执行成功后只清理自己的项目一次，保留返回值', async () => {
    const { mini, screenshot } = connection()
    const run = vi.fn().mockResolvedValue('rendered')
    await expect(withTemplateIdeSession(options, run)).resolves.toBe('rendered')
    expect(run).toHaveBeenCalledExactlyOnceWith(mini)
    expect(close).toHaveBeenCalledExactlyOnceWith(options.projectPath, mini, 1000)
    expect(screenshot).not.toHaveBeenCalled()
    expect(await fs.readdir(artifactDir)).toEqual([])
  })

  it('启动失败未取得连接时不截图，保留原错误及完整原因栈', async () => {
    const primary = new Error('launch failed', { cause: new Error('original failure') })
    launch.mockRejectedValue(primary)
    const run = vi.fn()
    await expect(withTemplateIdeSession(options, run)).rejects.toBe(primary)
    expect(run).not.toHaveBeenCalled()
    expect(close).not.toHaveBeenCalled()
    const diagnostic = await fs.readFile(path.join(artifactDir, 'error.txt'), 'utf8')
    expect(diagnostic).toContain(primary.stack!.split('\n')[1]!.trim())
    expect(diagnostic).toContain('original failure')
    expect(await fs.readdir(artifactDir)).toEqual(['error.txt'])
  })

  it('探针失败使用有界截图，诊断完成后仍抛出同一首因', async () => {
    const { screenshot } = connection()
    const primary = new Error('render failed')
    await expect(withTemplateIdeSession(options, async () => {
      throw primary
    })).rejects.toBe(primary)
    expect(screenshot).toHaveBeenCalledExactlyOnceWith({ path: path.join(artifactDir, 'failure.png'), timeout: 5000 })
    expect(screenshot.mock.invocationCallOrder[0]).toBeLessThan(close.mock.invocationCallOrder[0]!)
  })

  it('探针、两项诊断、项目关闭与配置恢复同时失败仍保留全部原因', async () => {
    const { screenshot } = connection()
    const primary = new Error('render failed')
    const capture = new Error('screenshot timed out')
    const closure = new Error('project close failed')
    screenshot.mockRejectedValue(capture)
    close.mockRejectedValue(closure)
    const configFile = path.join(artifactDir, 'project.config.json')
    await fs.writeFile(configFile, '{"appid":"touristappid"}')
    const external = '{"appid":"wx1111111111111111"}'
    // 用真实文件系统拒绝诊断写入，不依赖 ESM 内建模块的可替换性。
    await fs.mkdir(path.join(artifactDir, 'error.txt'))
    const error = await withTemplateAppId(configFile, 'wx0123456789abcdef', () =>
      withTemplateIdeSession(options, async () => {
        await fs.writeFile(configFile, external)
        throw primary
      })).catch(error => error)
    const output = formatWorkflowError(error)
    for (const failure of [primary, capture, closure]) {
      expect(output).toContain(failure.message)
      expect(output).toContain(failure.stack!.split('\n')[1]!.trim())
    }
    expect(output).toMatch(/EISDIR|EPERM|EACCES/)
    expect(output).toContain('配置已被修改')
    expect(await fs.readFile(configFile, 'utf8')).toBe(external)
    expect(screenshot).toHaveBeenCalledOnce()
    expect(close).toHaveBeenCalledOnce()
  })

  it('主体成功但项目关闭失败仍使会话失败', async () => {
    connection()
    const failure = new Error('project close failed')
    close.mockRejectedValue(failure)
    await expect(withTemplateIdeSession(options, async () => 'rendered')).rejects.toBe(failure)
    expect(close).toHaveBeenCalledOnce()
    expect(await fs.readFile(path.join(artifactDir, 'error.txt'), 'utf8')).toBe(formatWorkflowError(failure))
  })

  it('最终诊断记录渲染、截图与关闭的全部叶子错误，保留原聚合层级', async () => {
    const { screenshot } = connection()
    const primary = new Error('render failed', { cause: new Error('protocol did not respond') })
    const capture = new Error('screenshot timed out')
    const closure = new Error('project close failed')
    screenshot.mockRejectedValue(capture)
    close.mockRejectedValue(closure)
    const error = await withTemplateIdeSession(options, async () => {
      throw primary
    }).catch(error => error)
    expect(error).toBeInstanceOf(AggregateError)
    expect(error.cause).toBe(error.errors[0])
    expect(error.errors[0]).toBeInstanceOf(AggregateError)
    expect(error.errors[0].cause).toBe(primary)
    expect(error.errors[0].errors).toEqual([primary, capture])
    expect(error.errors[1]).toBe(closure)
    const diagnostic = await fs.readFile(path.join(artifactDir, 'error.txt'), 'utf8')
    expect(diagnostic).toBe(formatWorkflowError(error))
    for (const failure of [primary, primary.cause as Error, capture, closure]) {
      expect(diagnostic).toContain(failure.message)
      expect(diagnostic).toContain(failure.stack!.split('\n')[1]!.trim())
    }
    expect(screenshot).toHaveBeenCalledOnce()
    expect(close).toHaveBeenCalledOnce()
  })

  it('最终诊断写入失败也保留已有错误层级、对象与因果，且不重复关闭', async () => {
    const { screenshot } = connection()
    const primary = new Error('render failed')
    const capture = new Error('screenshot timed out')
    const closure = new Error('project close failed')
    screenshot.mockRejectedValue(capture)
    const diagnostic = path.join(artifactDir, 'error.txt')
    close.mockImplementation(async () => {
      // 首因已写入后模拟最终报告路径不可写，验证最后一次持久化的独立失败边界。
      expect(await fs.readFile(diagnostic, 'utf8')).toContain(primary.message)
      await fs.rm(diagnostic)
      await fs.mkdir(diagnostic)
      throw closure
    })
    const error = await withTemplateIdeSession(options, async () => {
      throw primary
    }).catch(error => error)
    expect(error).toBeInstanceOf(AggregateError)
    expect(error.cause).toBe(error.errors[0])
    const sessionError = error.errors[0]
    expect(sessionError).toBeInstanceOf(AggregateError)
    expect(sessionError.cause).toBe(sessionError.errors[0])
    expect(sessionError.errors[0].cause).toBe(primary)
    expect(sessionError.errors[0].errors).toEqual([primary, capture])
    expect(sessionError.errors[1]).toBe(closure)
    expect(error.errors[1]).toMatchObject({ code: expect.stringMatching(/EISDIR|EPERM|EACCES/) })
    expect(formatWorkflowError(error)).toContain(diagnostic)
    expect(screenshot).toHaveBeenCalledOnce()
    expect(close).toHaveBeenCalledOnce()
  })

  it('真实本地 HTTP 500 后保留首因，外层不再发送服务请求', async () => {
    const requests: string[] = []
    const server = createServer((request, response) => {
      requests.push(new URL(request.url!, 'http://127.0.0.1').pathname)
      response.writeHead(500).end('{"code":"APPID_ERROR"}')
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    cleanup.push(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())))
    const address = server.address()
    if (!address || typeof address === 'string') {
      throw new Error('测试 HTTP 服务未分配端口')
    }
    close.mockRestore()
    const observedClose = vi.spyOn(projectCleanup, 'closeWechatProject')
    launch.mockImplementation(async () => wechatRequest(address.port, { kind: 'auto', project: options.projectPath, port: 45678 }))
    const run = vi.fn()
    const error = await withTemplateIdeSession(options, run).catch(error => error)
    expect(error.message).toContain('auto 失败（HTTP 500）')
    expect(requests).toEqual(['/v2/auto'])
    expect(observedClose).not.toHaveBeenCalled()
    expect(run).not.toHaveBeenCalled()
    expect(await fs.readFile(path.join(artifactDir, 'error.txt'), 'utf8')).toContain('auto 失败（HTTP 500）')
  })

  it('启动层已聚合认证与收尾失败时保留完整错误，不再发送清理请求', async () => {
    const primary = new Error('auto HTTP 500')
    const blocked = new Error('服务已阻断，保留现场')
    const error = new AggregateError([primary, blocked], '启动与清理失败', { cause: primary })
    launch.mockRejectedValue(error)
    await expect(withTemplateIdeSession(options, vi.fn())).rejects.toBe(error)
    expect(close).not.toHaveBeenCalled()
    expect(await fs.readFile(path.join(artifactDir, 'error.txt'), 'utf8')).toBe(formatWorkflowError(error))
  })

  it('同一模板的失败运行使用新目录，不混入旧的成功证据', async () => {
    const previous = await createTemplateIdeArtifacts(artifactDir)
    await fs.writeFile(path.join(previous, 'rendered.png'), 'previous screenshot')
    const current = await createTemplateIdeArtifacts(artifactDir)
    expect(current).not.toBe(previous)
    launch.mockRejectedValue(new Error('appLaunch timeout'))
    await expect(withTemplateIdeSession({ ...options, artifactDir: current }, vi.fn())).rejects.toThrow('appLaunch timeout')
    expect(await fs.readdir(current)).toEqual(['error.txt'])
    expect(await fs.readFile(path.join(previous, 'rendered.png'), 'utf8')).toBe('previous screenshot')
  })
})
