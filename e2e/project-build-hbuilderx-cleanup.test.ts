import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ensureProjectBuilt } from './projectBuild'

const mocks = vi.hoisted(() => ({ run: vi.fn(), alias: vi.fn() }))
vi.mock('../packages/hbuilderx-runner/src', () => ({
  createHBuilderXRunner: async () => ({
    resolution: { channel: 'test', host: 'test', path: 'test-cli', version: 'test' },
    run: mocks.run,
  }),
  fileExists: async () => true,
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
    mocks.run.mockResolvedValue(undefined)
  })
  afterEach(async () => {
    vi.restoreAllMocks()
    await fs.rm(directory, { recursive: true, force: true })
  })

  function failCommand(command: string, failure: Error) {
    mocks.run.mockImplementation(async ({ args }: { args: string[] }) => {
      if (args[command === 'launch' ? 0 : 1] === command) {
        throw failure
      }
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
})
