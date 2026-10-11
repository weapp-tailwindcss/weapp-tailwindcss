import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createGcDiagnostics } from '../scripts/gc-diagnostics.mjs'
import { appendNodeImport, sameFilesystemPath } from '../scripts/gc-paths.mjs'
import { createServiceFixture, mpxProject, versionFor } from './helpers/gc-service.mjs'

const roots = []
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'benchmark-gc-test-'))
  roots.push(root)
  return { root, ...await createServiceFixture(root) }
}

afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })))
})

describe('私有 GC 诊断控制器', () => {
  it('关闭时及非 Mpx 项目不创建目录、不调整子进程环境', async () => {
    const { root, cwd } = await fixture()
    const directory = path.join(root, 'disabled')
    expect(await createGcDiagnostics({ cwd, versionMeta: versionFor(root), projectMeta: mpxProject, kind: 'build', run: 1 })).toBeUndefined()
    expect(await createGcDiagnostics({ cwd, versionMeta: versionFor(root), projectMeta: { ...mpxProject, key: 'other' }, directory, kind: 'build', run: 1 })).toBeUndefined()
    await expect(fs.access(directory)).rejects.toThrow()
  })

  it('解析实际 service bin，保留 NODE_OPTIONS 并给每轮唯一目录，缺失 preload 证据明确标记', async () => {
    const { root, cwd, entry } = await fixture()
    const args = { cwd, versionMeta: versionFor(root), projectMeta: mpxProject, directory: path.join(root, '中文 diag space'), kind: 'build', run: 1, env: { NODE_OPTIONS: '--no-warnings --stack-trace-limit=20' } }
    const first = await createGcDiagnostics(args)
    const second = await createGcDiagnostics(args)
    const identity = JSON.parse(first.env.WEAPP_TW_BENCH_GC_SESSION)
    expect(first.env.WEAPP_TW_BENCH_GC_EXPECTED_ENTRY).toBe(await fs.realpath(entry))
    expect(first.env.NODE_OPTIONS).toMatch(/^--no-warnings --stack-trace-limit=20 --import=file:/)
    expect(first.env.NODE_OPTIONS).toContain('%20')
    expect(first.env.NODE_OPTIONS).not.toBe(second.env.NODE_OPTIONS)
    expect(identity.sessionDirectory).not.toBe(JSON.parse(second.env.WEAPP_TW_BENCH_GC_SESSION).sessionDirectory)
    expect(identity).toMatchObject({ role: 'current', project: mpxProject.key, kind: 'build', run: 1, sourceCommit: 'a'.repeat(40) })
    first.spawned(1234)
    first.mark('mutation-write', 1)
    await first.finish()
    const manifest = JSON.parse(await fs.readFile(path.join(identity.sessionDirectory, 'controller.json'), 'utf8'))
    expect(manifest).toMatchObject({ controller: { rootPid: 1234 }, missingPreloadEvidence: true, processEvidence: [] })
    expect(manifest.boundaries.map(item => item.type)).toEqual(['spawn', 'mutation-write'])
    expect(manifest.preloadSha256).toMatch(/^[a-f\d]{64}$/)
  })

  it('轮次边界达到固定上限后保留原始总数与截断数', async () => {
    const { root, cwd } = await fixture()
    const diagnostics = await createGcDiagnostics({ cwd, versionMeta: versionFor(root), projectMeta: mpxProject, directory: path.join(root, 'diag'), kind: 'hmr', run: 1 })
    const identity = JSON.parse(diagnostics.env.WEAPP_TW_BENCH_GC_SESSION)
    for (let round = 0; round < 300; round += 1) {
      diagnostics.mark('mutation-write', round)
    }
    await diagnostics.finish()
    const manifest = JSON.parse(await fs.readFile(path.join(identity.sessionDirectory, 'controller.json'), 'utf8'))
    expect(manifest).toMatchObject({ boundaryCount: 300, truncatedBoundaries: 44 })
    expect(manifest.boundaries).toHaveLength(256)
  })

  it('保留信号退出留下的完整前缀，不将半行或未记账写入误判为完整证据', async () => {
    const { root, cwd, entry } = await fixture()
    const diagnostics = await createGcDiagnostics({ cwd, versionMeta: versionFor(root), projectMeta: mpxProject, directory: path.join(root, 'diag'), kind: 'hmr', run: 1 })
    const identity = JSON.parse(diagnostics.env.WEAPP_TW_BENCH_GC_SESSION)
    await fs.writeFile(path.join(identity.sessionDirectory, 'gc-123.ndjson'), `${JSON.stringify({ type: 'process-start', pid: 123, identity, actualEntry: await fs.realpath(entry), preloadSha256: identity.expectedPreloadSha256, pathHelperSha256: identity.expectedPathHelperSha256 })}\n{"type":"gc-batch"`, 'utf8')
    await diagnostics.finish()
    const manifest = JSON.parse(await fs.readFile(path.join(identity.sessionDirectory, 'controller.json'), 'utf8'))
    expect(manifest).toMatchObject({ missingPreloadEvidence: false, processEvidence: [{ pid: 123, ready: true, completeFinalLine: false, recordIntegrityUnavailable: true, lastWriteAccounted: false }] })
    await fs.appendFile(path.join(identity.sessionDirectory, 'gc-123.ndjson'), '\n')
    await diagnostics.finish()
    const corrupted = JSON.parse(await fs.readFile(path.join(identity.sessionDirectory, 'controller.json'), 'utf8'))
    expect(corrupted).toMatchObject({ missingPreloadEvidence: false, processEvidence: [{ pid: 123, ready: true, completeFinalLine: true, recordIntegrityUnavailable: true, lastWriteAccounted: false, readError: expect.any(String) }] })
  })

  it('诊断目录不可写时报告缺证并保持业务路径可执行', async () => {
    const { root, cwd } = await fixture()
    const directory = path.join(root, 'file-not-directory')
    await fs.writeFile(directory, '')
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    expect(await createGcDiagnostics({ cwd, versionMeta: versionFor(root), projectMeta: mpxProject, directory, kind: 'build', run: 1 })).toBeUndefined()
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining('诊断证据未能交付'))
  })
})

describe('GC 诊断文件系统与 file URL 边界', () => {
  it('保留 POSIX 根与大小写，拒绝相对路径作为 realpath 身份', () => {
    expect(sameFilesystemPath('/work/mpx/bin.js', '/work/mpx/./bin.js', 'linux')).toBe(true)
    expect(sameFilesystemPath('/work/MPX/bin.js', '/work/mpx/bin.js', 'linux')).toBe(false)
    expect(sameFilesystemPath('mpx/bin.js', 'mpx/bin.js', 'linux')).toBe(false)
    expect(sameFilesystemPath('/', '/', 'linux')).toBe(true)
  })

  it('Windows realpath 身份兼容盘符、反斜杠、大小写与 UNC 根，同时区分盘符', () => {
    expect(sameFilesystemPath('C:\\Repo Space\\MPX\\bin.js', 'c:/repo space/mpx/bin.js', 'win32')).toBe(true)
    expect(sameFilesystemPath('C:\\Repo\\bin.js', 'D:\\Repo\\bin.js', 'win32')).toBe(false)
    expect(sameFilesystemPath('\\\\server\\Share\\MPX\\bin.js', '//server/share/mpx/bin.js', 'win32')).toBe(true)
    expect(sameFilesystemPath('C:\\', 'c:/', 'win32')).toBe(true)
    expect(sameFilesystemPath('C:bin.js', 'C:bin.js', 'win32')).toBe(false)
  })

  it('NODE_OPTIONS 只在 import 参数处转换 URL，空格与中文路径往返保持身份', () => {
    const posix = '/work/中文 space/gc-preload.mjs'
    const option = appendNodeImport('--no-warnings', posix, 'linux')
    expect(fileURLToPath(option.slice(option.indexOf('file:')))).toBe(posix)
    expect(appendNodeImport('--no-warnings', 'C:\\Repo Space\\中文\\gc-preload.mjs', 'win32')).toBe('--no-warnings --import=file:///C:/Repo%20Space/%E4%B8%AD%E6%96%87/gc-preload.mjs')
    expect(appendNodeImport('', '\\\\server\\share space\\gc-preload.mjs', 'win32')).toBe('--import=file://server/share%20space/gc-preload.mjs')
  })
})
