import { Buffer } from 'node:buffer'
import { EventEmitter } from 'node:events'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { runCase } from '../scripts/run-matrix.mjs'
import { createServiceFixture, mpxProject, versionFor } from './helpers/gc-service.mjs'

const mocks = vi.hoisted(() => ({ spawn: vi.fn(), sampler: vi.fn() }))
vi.mock('node:child_process', async importOriginal => ({ ...await importOriginal(), spawn: mocks.spawn }))
vi.mock('../scripts/process-memory.mjs', async importOriginal => ({ ...await importOriginal(), createProcessMemorySampler: mocks.sampler }))
const roots = []
afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })))
})

async function fixture(rollback, mutation) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'benchmark-watch-output-'))
  roots.push(root)
  const { cwd } = await createServiceFixture(root)
  const source = path.join(cwd, mpxProject.sourceFile)
  const output = path.join(cwd, mpxProject.outputTemplate)
  const original = '<template><view class="flex">完整基线</view></template>'
  const writeFile = fs.writeFile.bind(fs)
  await writeFile(source, original)
  await writeFile(output, original)
  const child = Object.assign(new EventEmitter(), { pid: 123, exitCode: null, stdout: new EventEmitter(), stderr: new EventEmitter() })
  child.kill = vi.fn(() => {
    child.exitCode = 0
    child.emit('close', 0)
    return true
  })
  vi.spyOn(process, 'kill').mockImplementation((pid, signal) => {
    expect(pid).toBe(-child.pid)
    return child.kill(signal)
  })
  mocks.spawn.mockReset().mockImplementation(() => {
    queueMicrotask(() => child.stdout.emit('data', Buffer.from('fixture-ready\n')))
    return child
  })
  mocks.sampler.mockReset().mockReturnValue({ stop: () => ({ count: 0 }) })
  let sourceWrites = 0
  vi.spyOn(fs, 'writeFile').mockImplementation(async (file, text, ...args) => {
    await writeFile(file, text, ...args)
    if (file !== source) {
      return
    }
    sourceWrites++
    if (text !== original) {
      await writeFile(output, text)
      if (mutation) {
        child.exitCode = 0
        await mutation()
      }
      child.stdout.emit('data', Buffer.from('[weapp-tailwindcss:hmr] {"bundler":"webpack","phase":"processAssets","durationMs":23}\n'))
    }
    else {
      await rollback({ output, original, writeFile })
    }
  })
  return {
    source,
    output,
    original,
    writes: () => sourceWrites,
    run: () => runCase(versionFor(root), mpxProject, { buildRuns: 0, hmrRuns: 1, timeoutMs: 1000, pollIntervalMs: 1 }),
  }
}

describe('watch 回滚的文件观察边界', () => {
  it.each(['missing', 'empty', 'whitespace'])('不把 %s 产物误判为 marker 已移除', async (kind) => {
    const test = await fixture(async ({ output, writeFile }) => {
      if (kind === 'missing') {
        await fs.rm(output, { force: true })
      }
      else {
        await writeFile(output, kind === 'empty' ? '' : ' \n\t ')
      }
    })
    await expect(test.run()).rejects.toThrow(/hmr rollback 1/)
    expect(await fs.readFile(test.source, 'utf8')).toBe(test.original)
  })

  it('只在需要时恢复源码，不在有效回滚后再次写入触发新构建', async () => {
    const test = await fixture(({ output, original, writeFile }) => writeFile(output, original))
    const result = await test.run()
    expect(result.hmrPluginMs).toEqual([23])
    expect(test.writes()).toBe(2)
    expect(await fs.readFile(test.source, 'utf8')).toBe(test.original)
  })

  it('允许框架在后续构建中添加合法元数据，不要求回滚与首轮逐字节相同', async () => {
    const test = await fixture(({ output, original, writeFile }) => writeFile(output, `${original}\n<!-- build-metadata: watch -->`))
    const result = await test.run()
    expect(result.hmrPluginMs).toEqual([23])
    expect(await fs.readFile(test.output, 'utf8')).toContain('<!-- build-metadata: watch -->')
    expect(test.writes()).toBe(2)
  })

  it('暂时占用的读取必须重试，不能把第一次读取失败当成有效回滚', async () => {
    const test = await fixture(({ output, original, writeFile }) => writeFile(output, original))
    const readFile = fs.readFile.bind(fs)
    let rollbackReads = 0
    vi.spyOn(fs, 'readFile').mockImplementation((file, ...args) => {
      if (file === test.output && test.writes() === 2 && ++rollbackReads === 1) {
        return Promise.reject(Object.assign(new Error('暂时占用'), { code: 'EBUSY' }))
      }
      return readFile(file, ...args)
    })
    await test.run()
    expect(rollbackReads).toBeGreaterThanOrEqual(2)
  })

  it('明确报告读取权限错误，不把无法读取等同于 marker 已删除', async () => {
    const test = await fixture(({ output, original, writeFile }) => writeFile(output, original))
    const readFile = fs.readFile.bind(fs)
    vi.spyOn(fs, 'readFile').mockImplementation((file, ...args) => {
      if (file === test.output && test.writes() === 2) {
        return Promise.reject(Object.assign(new Error('无读取权限'), { code: 'EACCES' }))
      }
      return readFile(file, ...args)
    })
    await expect(test.run()).rejects.toMatchObject({ code: 'EACCES' })
  })

  it('源码写入部分完成后失败，仍在 watcher 关闭后恢复原文', async () => {
    const failure = new Error('写入中断')
    const test = await fixture(({ output, original, writeFile }) => writeFile(output, original), () => {
      throw failure
    })
    await expect(test.run()).rejects.toBe(failure)
    expect(test.writes()).toBe(2)
    expect(await fs.readFile(test.source, 'utf8')).toBe(test.original)
  })
})
