import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createNativeSessionRecovery, findNativeCleanupBlock } from '../scripts/hbuilderx-native-session'

const roots: string[] = []
afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })))
})

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'native-session-'))
  roots.push(root)
  const file = path.join(root, 'App.uvue')
  const manifest = path.join(root, 'manifest.json')
  const source = '\uFEFF<template>原始\r\n字节</template>\r\n'
  await fs.writeFile(file, source)
  const recovery = await createNativeSessionRecovery({
    directory: path.join(root, 'recovery'),
    projectRoot: root,
    platform: 'app-harmony',
    host: { host: 'test-host', version: '5.31.2026093020-alpha' },
    files: [{ file }, { file: path.resolve(root, 'nested', '..', 'App.uvue') }, { file: manifest, optional: true }],
  })
  await recovery.bindProject({ kind: 'canonical-root', projectRoot: root, projectPath: root, launchProject: root })
  const safe = vi.fn()
  const release = vi.fn()
  const options = { stop: vi.fn(), nativeStopReason: () => undefined as string | undefined, afterStop: vi.fn(), safe: [safe], release: [release] }
  return { root, file, manifest, source, recovery, safe, release, options }
}

describe('原生停止边界与恢复资料', () => {
  it('原始字节、hash、文件身份去重及缺失 manifest 均在写入前持久化', async () => {
    const { file, manifest, source, recovery, options } = await fixture()
    const record = JSON.parse(await fs.readFile(path.join(recovery.directory, 'recovery.json'), 'utf8'))
    expect(record.files).toHaveLength(2)
    expect(record.files[0].sha256).toBe(createHash('sha256').update(source).digest('hex'))
    expect(record.host).toMatchObject({ host: 'test-host' })
    expect(await fs.readFile(path.join(recovery.directory, record.files[0].backup), 'utf8')).toBe(source)
    recovery.beginMutation()
    await fs.writeFile(file, 'changed')
    await fs.writeFile(manifest, '{}')
    await recovery.cleanup(options)
    expect(await fs.readFile(file, 'utf8')).toBe(source)
    await expect(fs.stat(manifest)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it.each(['stop', 'fallback'])('%s 阻塞冻结恢复，并保留主错误和安全收尾错误', async (kind) => {
    const { file, recovery, options, safe, release } = await fixture()
    const primary = new Error('primary failed')
    const secondary = new Error('stop rejected')
    const log = new Error('log close failed')
    if (kind === 'stop') {
      options.stop.mockRejectedValue(secondary)
    }
    else { options.nativeStopReason = () => 'Harmony fallback' }
    safe.mockRejectedValue(log)
    recovery.beginMutation()
    await fs.writeFile(file, 'changed')
    const error = await recovery.cleanup({ ...options, failure: { error: primary } }).catch(error => error)
    const block = findNativeCleanupBlock(new Error('wrapper', { cause: new AggregateError([primary, error], '主任务及清理失败') }))!
    expect(block).toBeDefined()
    expect(block.errors).toContain(log)
    if (kind === 'stop') {
      expect(block.errors).toContain(secondary)
    }
    expect(release).not.toHaveBeenCalled()
    expect(safe).toHaveBeenCalledOnce()
    await recovery.restore()
    expect(await fs.readFile(file, 'utf8')).toBe('changed')
    const record = JSON.parse(await fs.readFile(path.join(recovery.directory, 'blocked.json'), 'utf8'))
    expect(record.primaryError).toContain(primary.message)
  })

  it('阻塞记录写失败仍保留停止原错并冻结现场', async () => {
    const { file, recovery, options } = await fixture()
    const stop = new Error('stop failed')
    options.stop.mockRejectedValue(stop)
    await fs.mkdir(path.join(recovery.directory, 'blocked.json'))
    recovery.beginMutation()
    await fs.writeFile(file, 'changed')
    const error = await recovery.cleanup(options).catch(error => error)
    expect(error.errors[0]).toBe(stop)
    expect(error.errors).toHaveLength(2)
    expect(await fs.readFile(file, 'utf8')).toBe('changed')
  })

  it('项目身份落盘失败时不开始恢复写入，仍释放尚未启动的自有 alias', async () => {
    const { file, source, recovery, options, release } = await fixture()
    await fs.rm(path.join(recovery.directory, 'project.json'))
    await fs.mkdir(path.join(recovery.directory, 'project.json'))
    const spy = vi.spyOn(fs, 'writeFile')
    await expect(recovery.bindProject({ kind: 'owned-alias', projectRoot: 'test', projectPath: 'alias', launchProject: 'alias' })).rejects.toThrow()
    await recovery.cleanup(options)
    expect(spy.mock.calls.some(([target]) => target === file)).toBe(false)
    expect(await fs.readFile(file, 'utf8')).toBe(source)
    expect(release).toHaveBeenCalledOnce()
  })
})
