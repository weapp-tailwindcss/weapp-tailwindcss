import { access, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { expect, it, vi } from 'vitest'
import { iosBuildApplication } from './react-native/ios-build'
import { withIosBuildScratch } from './react-native/ios-build-scratch'

vi.mock('node:os', async (original) => {
  const actual = await original<typeof import('node:os')>()
  return { ...actual, tmpdir: vi.fn(actual.tmpdir) }
})

it('临时根经符号链接进入时仍接受 Xcode 返回的物理产物路径', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'ios-scratch-alias-'))
  const project = path.join(root, 'project')
  const physical = path.join(await realpath(root), 'temporary')
  const alias = path.join(root, 'temporary-alias')
  try {
    await Promise.all([mkdir(project), mkdir(physical)])
    await symlink(physical, alias, 'junction')
    vi.mocked(tmpdir).mockReturnValueOnce(alias)
    await withIosBuildScratch(project, {}, async () => {}, async (derivedData) => {
      const output = path.join(derivedData, 'Build', 'Products')
      await mkdir(output, { recursive: true })
      const settings = JSON.stringify([{ buildSettings: { PRODUCT_BUNDLE_IDENTIFIER: 'test.app', WRAPPER_EXTENSION: 'app', TARGET_BUILD_DIR: await realpath(output), FULL_PRODUCT_NAME: 'Test.app' } }])
      expect(iosBuildApplication(settings, derivedData, 'test.app')).toBe(path.join(await realpath(output), 'Test.app'))
    })
  }
  finally {
    await rm(root, { recursive: true, force: true })
  }
})

it.each(['pod install', 'xcodebuild'])('%s 失败仍清理本轮构建目录并保留工程和原始异常', async (stage) => {
  const project = await mkdtemp(path.join(tmpdir(), 'ios-scratch-project-'))
  const sentinel = path.join(project, 'owned-by-user.txt')
  const evidence: Record<string, unknown> = {}
  const error = new Error(`${stage} failed`)
  let directory = ''
  try {
    await writeFile(sentinel, 'preserved')
    await expect(withIosBuildScratch(project, evidence, async () => {}, async (derived) => {
      directory = path.dirname(derived)
      await writeFile(path.join(directory, 'partial-build'), 'partial')
      throw error
    })).rejects.toBe(error)
    await expect(access(directory)).rejects.toMatchObject({ code: 'ENOENT' })
    expect(evidence['scratch']).toMatchObject({ directory, status: 'removed' })
    expect(await readFile(sentinel, 'utf8')).toBe('preserved')
  }
  finally {
    await rm(project, { recursive: true, force: true })
  }
})

it('清理失败保留本轮路径和主异常，即使证据保存也失败', async () => {
  const project = await mkdtemp(path.join(tmpdir(), 'ios-scratch-project-'))
  const evidence: Record<string, unknown> = {}
  const failure = new Error('build failed')
  const cleanup = new Error('permission denied')
  const saveFailure = new Error('receipt write failed')
  let directory = ''
  let saves = 0
  try {
    const result = await withIosBuildScratch(project, evidence, async () => {
      if (++saves === 2) {
        throw saveFailure
      }
    }, async (derived) => {
      directory = path.dirname(derived)
      throw failure
    }, async () => { throw cleanup }).catch(error => error)
    expect(result).toBeInstanceOf(AggregateError)
    expect(result.errors[0]).toBe(failure)
    expect(result.errors[1].errors[0]).toMatchObject({ cause: cleanup, message: expect.stringContaining(directory) })
    expect(result.errors[1].errors[1]).toBe(saveFailure)
    expect(evidence['scratch']).toMatchObject({ directory, status: 'cleanup-failed' })
    await expect(access(directory)).resolves.toBeUndefined()
  }
  finally {
    await rm(project, { recursive: true, force: true })
    if (directory) {
      await rm(directory, { recursive: true, force: true })
    }
  }
})
