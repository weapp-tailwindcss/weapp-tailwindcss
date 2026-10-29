import type { HBuilderXCommandResult } from '../packages/hbuilderx-runner/src'
import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HBuilderXCommandError } from '../packages/hbuilderx-runner/src'
import { ensureProjectBuilt } from './projectBuild'

const mocks = vi.hoisted(() => ({ run: vi.fn(), alias: vi.fn(), exists: vi.fn() }))
vi.mock('../packages/hbuilderx-runner/src', async original => ({
  ...await original<typeof import('../packages/hbuilderx-runner/src')>(),
  createHBuilderXRunner: async () => ({
    resolution: { channel: 'test', host: 'test', path: 'test-cli', version: 'test' },
    run: mocks.run,
  }),
  fileExists: mocks.exists,
}))
vi.mock('../scripts/hbuilderx-project-alias.mjs', async importOriginal => ({
  ...await importOriginal<typeof import('../scripts/hbuilderx-project-alias.mjs')>(),
  createHBuilderXProjectAlias: mocks.alias,
}))

describe('HBuilderX static 构建的项目释放边界', () => {
  let directory: string
  let alias: { projectName: string, projectPath: string, cleanup: () => Promise<void> }
  beforeEach(async () => {
    vi.clearAllMocks()
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    directory = await fs.mkdtemp(path.join(tmpdir(), 'hbuilderx-build-cleanup-'))
    await fs.writeFile(path.join(directory, 'package.json'), JSON.stringify({ name: 'test-hbuilderx-tailwindcss' }))
    const { createHBuilderXProjectAlias } = await vi.importActual<typeof import('../scripts/hbuilderx-project-alias.mjs')>('../scripts/hbuilderx-project-alias.mjs')
    alias = await createHBuilderXProjectAlias(directory, path.join(directory, 'aliases'))
    mocks.alias.mockResolvedValue(alias)
    mocks.exists.mockResolvedValue(true)
    mocks.run.mockImplementation(async ({ args }: { args: string[] }) => result(args))
  })
  afterEach(async () => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    await fs.rm(directory, { recursive: true, force: true })
  })

  function result(args: string[], output = ''): HBuilderXCommandResult {
    return { command: 'test-cli', args: [...args, '--host', 'test'], cwd: directory, exit: { code: 0, signal: null }, logs: [output], output, issue: { kind: 'unknown', message: '未匹配到失败分类' } }
  }

  function failCommand(command: string, failure: Error) {
    mocks.run.mockImplementation(async ({ args }: { args: string[] }) => {
      if (args[command === 'launch' ? 0 : 1] === command) {
        throw failure
      }
      return result(args)
    })
  }

  it('编译完成且确认关闭后才删除本轮别名', async () => {
    await ensureProjectBuilt(directory, { force: true })
    await expect(fs.lstat(alias.projectPath)).rejects.toMatchObject({ code: 'ENOENT' })
    expect(mocks.run.mock.calls.at(-1)?.[0].args).toEqual(['project', 'close', '--path', alias.projectPath])
  })

  it('编译通过但关闭失败时阻断并保留可恢复的别名', async () => {
    const closeError = new Error('close timed out')
    failCommand('close', closeError)
    const error = await ensureProjectBuilt(directory, { force: true }).catch(error => error)
    expect(error).toBeInstanceOf(Error)
    expect(error.message).toContain(alias.projectPath)
    expect(error.cause).toBe(closeError)
    expect((await fs.lstat(alias.projectPath)).isSymbolicLink()).toBe(true)
  })

  it.each(['open', 'launch'])('%s 与关闭同时失败时保留两个原始异常', async (command) => {
    const primary = new Error(`${command} timed out`)
    const close = new Error('close timed out')
    mocks.run.mockImplementation(async ({ args }: { args: string[] }) => {
      if (args[1] === 'close') {
        throw close
      }
      if (args[command === 'launch' ? 0 : 1] === command) {
        throw primary
      }
      return result(args)
    })
    const error = await ensureProjectBuilt(directory, { force: true }).catch(error => error)
    expect(error).toBeInstanceOf(AggregateError)
    expect(error.cause).toBe(primary)
    expect(error.errors[0]).toBe(primary)
    expect(error.errors[1]).toMatchObject({ cause: close, message: expect.stringContaining(alias.projectPath) })
    expect((await fs.lstat(alias.projectPath)).isSymbolicLink()).toBe(true)
  })

  it('编译失败但关闭成功时原样抛出首个异常并释放别名', async () => {
    const primary = new Error('compile failed')
    failCommand('launch', primary)
    await expect(ensureProjectBuilt(directory, { force: true })).rejects.toBe(primary)
    await expect(fs.lstat(alias.projectPath)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('别名删除失败也不能覆盖编译异常', async () => {
    const primary = new Error('compile failed')
    const deletion = new Error('alias is busy')
    alias.cleanup = vi.fn().mockRejectedValue(deletion)
    failCommand('launch', primary)
    const error = await ensureProjectBuilt(directory, { force: true }).catch(error => error)
    expect(error).toBeInstanceOf(AggregateError)
    expect(error.cause).toBe(primary)
    expect(error.errors[0]).toBe(primary)
    expect(error.errors[1]).toMatchObject({ cause: deletion, message: expect.stringContaining(alias.projectPath) })
  })

  it.each([
    '08:51:29.690 Build failed with errors.',
    '项目 test 编译失败。',
    'Project test compilation failed.',
    '\u001B[31m08:51:29.690 已停止运行...\u001B[39m',
    '08:51:29.690 Stopped running...',
    'DONE  Build complete.\nBuild failed with errors.',
  ])('退出零但编译以失败终态结束时保留首错并立即关闭：%s', async (terminal) => {
    const output = `08:51:29.689 [plugin:source-candidates] EISDIR: illegal operation on a directory, read\n${terminal}\n`
    const launch = result(['launch', 'mp-weixin'], output)
    mocks.run.mockImplementation(async ({ args }: { args: string[] }) => args[0] === 'launch' ? launch : result(args))
    const error = await ensureProjectBuilt(directory, { force: true }).catch(error => error)
    expect(error).toBeInstanceOf(HBuilderXCommandError)
    expect(error.result).toBe(launch)
    expect(error.message).toContain('EISDIR')
    expect(mocks.exists).not.toHaveBeenCalled()
    expect(mocks.run.mock.calls.at(-1)?.[0].args).toEqual(['project', 'close', '--path', alias.projectPath])
    await expect(fs.lstat(alias.projectPath)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it.each(['cli-instance-mismatch', 'config-load-failed'] as const)('退出零但携带已知失败分类仍保留原结果：%s', async (kind) => {
    const launch = { ...result(['launch'], 'first actionable failure'), issue: { kind, message: '实际失败分类' } }
    mocks.run.mockImplementation(async ({ args }: { args: string[] }) => args[0] === 'launch' ? launch : result(args))
    const error = await ensureProjectBuilt(directory, { force: true }).catch(error => error)
    expect(error).toBeInstanceOf(HBuilderXCommandError)
    expect(error.result).toBe(launch)
    expect(error.message).toContain('first actionable failure')
    expect(mocks.exists).not.toHaveBeenCalled()
  })

  it('编译终态失败与关闭失败聚合，保留原结果及可恢复别名', async () => {
    const launch = result(['launch'], 'Build failed with errors.\n')
    const close = new Error('close unconfirmed')
    mocks.run.mockImplementation(async ({ args }: { args: string[] }) => {
      if (args[1] === 'close') {
        throw close
      }
      return args[0] === 'launch' ? launch : result(args)
    })
    const error = await ensureProjectBuilt(directory, { force: true }).catch(error => error)
    expect(error).toBeInstanceOf(AggregateError)
    expect(error.errors[0]).toBeInstanceOf(HBuilderXCommandError)
    expect(error.errors[0].result).toBe(launch)
    expect(error.errors[1].cause).toBe(close)
    expect((await fs.lstat(alias.projectPath)).isSymbolicLink()).toBe(true)
  })

  it('末尾日志缓冲裁掉失败终句后，仍使用 runner 保留的重要错误', async () => {
    const launch = { ...result(['launch'], '关键错误：\n08:51:29.690 项目 test 编译失败。\n最近日志：\nlate debug output'), logs: ['late debug output'] }
    mocks.run.mockImplementation(async ({ args }: { args: string[] }) => args[0] === 'launch' ? launch : result(args))
    const error = await ensureProjectBuilt(directory, { force: true }).catch(error => error)
    expect(error).toBeInstanceOf(HBuilderXCommandError)
    expect(error.result).toBe(launch)
    expect(mocks.exists).not.toHaveBeenCalled()
  })

  it('退出零但关闭结果携带已知失败时仍保留别名', async () => {
    const close = { ...result(['project', 'close'], 'wrong host'), issue: { kind: 'cli-instance-mismatch' as const, message: 'wrong host' } }
    mocks.run.mockImplementation(async ({ args }: { args: string[] }) => args[1] === 'close' ? close : result(args))
    const error = await ensureProjectBuilt(directory, { force: true }).catch(error => error)
    expect(error.cause).toBeInstanceOf(HBuilderXCommandError)
    expect(error.cause.result).toBe(close)
    expect((await fs.lstat(alias.projectPath)).isSymbolicLink()).toBe(true)
  })

  it.each(['DONE  Build complete.', '项目 test 编译成功。', 'Project test compiled successfully.'])('成功后正常停止仍验证产物，不把错误词汇当终态：%s', async (success) => {
    const output = `warning: helper handles error messages\n${success}\n08:51:29.690 已停止运行...\n`
    mocks.run.mockImplementation(async ({ args }: { args: string[] }) => result(args, args[0] === 'launch' ? output : ''))
    await ensureProjectBuilt(directory, { force: true })
    expect(mocks.exists).toHaveBeenCalled()
    await expect(fs.lstat(alias.projectPath)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('真实 Stable 成功行带官方日志提示尾注后正常停止，仍验证完整产物', async () => {
    const output = [
      `08:58:05.170 项目 ${alias.projectName} 编译成功。 前端运行日志，请另行在小程序开发工具的控制台查看。如需在 HBuilder 查看日志输出，可开启运行日志回显，详情：https://uniapp.dcloud.net.cn/tutorial/run/mp-log.html`,
      '08:58:05.172 ready in 5436ms.',
      '08:58:05.173 \u001B[31m已停止运行...\u001B[39m',
    ].join('\n')
    mocks.run.mockImplementation(async ({ args }: { args: string[] }) => result(args, args[0] === 'launch' ? output : ''))
    await ensureProjectBuilt(directory, { force: true })
    expect(mocks.exists).toHaveBeenCalled()
    await expect(fs.lstat(alias.projectPath)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('调试输出仍收集管道结果，不因 inherit 丢失首错证据', async () => {
    vi.stubEnv('E2E_DEBUG_BUILD', '1')
    const output = '08:51:29.690 项目 test 编译成功。\n'
    mocks.run.mockImplementation(async ({ args }: { args: string[] }) => result(args, args[0] === 'launch' ? output : ''))
    await ensureProjectBuilt(directory, { force: true })
    expect(mocks.run.mock.calls.every(([options]) => options.stdio === 'pipe')).toBe(true)
    expect(process.stdout.write).toHaveBeenCalledWith(output)
  })

  it('产物仍未就绪时保留本轮 launch 原结果和完整诊断', async () => {
    vi.stubEnv('E2E_IDE_HBUILDERX_DEV_BUILD_TIMEOUT_MS', '0')
    mocks.exists.mockResolvedValue(false)
    const launch = result(['launch', 'mp-weixin'], '08:51:29.690 compiler entry=/owned/entry\nfirst actionable detail\n')
    mocks.run.mockImplementation(async ({ args }: { args: string[] }) => args[0] === 'launch' ? launch : result(args))
    const error = await ensureProjectBuilt(directory, { force: true }).catch(error => error)
    expect(error).toBeInstanceOf(HBuilderXCommandError)
    expect(error.result).toBe(launch)
    expect(error.message).toContain('compile output did not become ready')
    expect(error.message).toContain('first actionable detail')
    expect(mocks.run.mock.calls.at(-1)?.[0].args).toEqual(['project', 'close', '--path', alias.projectPath])
    await expect(fs.lstat(alias.projectPath)).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
