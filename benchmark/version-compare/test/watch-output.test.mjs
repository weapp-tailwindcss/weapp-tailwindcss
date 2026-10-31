import { Buffer } from 'node:buffer'
import { EventEmitter } from 'node:events'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as savePacing from '../../performance/demo/save-pacing.mjs'
import { benchmarkProjects } from '../scripts/projects.mjs'
import { runCase } from '../scripts/run-matrix.mjs'
import * as watchReadiness from '../scripts/watch-readiness.mjs'
import { createServiceFixture, mpxProject, versionFor } from './helpers/gc-service.mjs'

const mocks = vi.hoisted(() => ({ spawn: vi.fn(), sampler: vi.fn() }))
vi.mock('node:child_process', async importOriginal => ({ ...await importOriginal(), spawn: mocks.spawn }))
vi.mock('../scripts/process-memory.mjs', async importOriginal => ({ ...await importOriginal(), createProcessMemorySampler: mocks.sampler }))
const roots = []
const { watchBuildLogs } = benchmarkProjects.find(project => project.key === 'demo-uni-app-vite-tailwindcss-v4__mp-weixin')
const startLog = 'Incremental Compiling...\n'
const completeLog = 'DONE  Build complete. Watching for changes...\n'
afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })))
})

async function fixture(rollback, mutation, projectOptions = {}) {
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
  const stop = vi.fn(() => {
    child.exitCode = 0
    return { count: 0 }
  })
  mocks.sampler.mockReset().mockReturnValue({ stop })
  let sourceWrites = 0
  let mutationAt = 0
  vi.spyOn(fs, 'writeFile').mockImplementation(async (file, text, ...args) => {
    await writeFile(file, text, ...args)
    if (file !== source) {
      return
    }
    sourceWrites++
    if (text !== original) {
      mutationAt = performance.now()
      await writeFile(output, text)
      if (mutation) {
        await mutation({ child })
      }
      child.stdout.emit('data', Buffer.from('[weapp-tailwindcss:hmr] {"bundler":"webpack","phase":"processAssets","durationMs":23}\n'))
    }
    else {
      await rollback({ child, output, original, writeFile, elapsedSinceMutation: performance.now() - mutationAt })
    }
  })
  return {
    source,
    output,
    original,
    child,
    stop,
    writes: () => sourceWrites,
    run: () => runCase(versionFor(root), { ...mpxProject, ...projectOptions }, { buildRuns: 0, hmrRuns: 1, timeoutMs: 1000, pollIntervalMs: 1 }),
  }
}

function observeOutputRead(test, writes) {
  const readFile = fs.readFile.bind(fs)
  let notify
  vi.spyOn(fs, 'readFile').mockImplementation(async (file, ...args) => {
    const text = await readFile(file, ...args)
    if (file === test.output && test.writes() === writes && notify) {
      const receipt = notify
      notify = undefined
      // 等本次读取的后续微任务处理完成，避免断言跑在观察逻辑之前。
      setImmediate(receipt)
    }
    return text
  })
  return () => new Promise((resolve) => {
    notify = resolve
  })
}

describe('watch 回滚的文件观察边界', () => {
  it('首次保存等待期间退出时，不继续写入 mutation', async () => {
    const test = await fixture(async () => {})
    const beforeSave = vi.fn(async () => {
      test.child.signalCode = 'SIGTERM'
    })
    vi.spyOn(savePacing, 'createSavePacer').mockReturnValue({ beforeSave, settled: vi.fn() })
    await expect(test.run()).rejects.toThrow(/dev exited during hmr round=1.*signal=SIGTERM/)
    expect(beforeSave).toHaveBeenCalledTimes(1)
    expect(test.writes()).toBe(0)
    expect(await fs.readFile(test.source, 'utf8')).toBe(test.original)
  })

  it('回滚前保存等待期间退出时，先清理再恢复源码', async () => {
    const test = await fixture(async ({ output, original, writeFile }) => {
      expect(test.stop).toHaveBeenCalled()
      await writeFile(output, original)
    })
    const beforeSave = vi.fn(async () => {}).mockImplementationOnce(async () => {}).mockImplementationOnce(async () => {
      test.child.signalCode = 'SIGTERM'
    })
    vi.spyOn(savePacing, 'createSavePacer').mockReturnValue({ beforeSave, settled: vi.fn() })
    await expect(test.run()).rejects.toThrow(/dev exited during hmr rollback round=1.*signal=SIGTERM/)
    expect(beforeSave).toHaveBeenCalledTimes(2)
    expect(test.writes()).toBe(2)
    expect(await fs.readFile(test.source, 'utf8')).toBe(test.original)
  })

  it('mutation 提交观察返回时退出，不继续正常回滚', async () => {
    const test = await fixture(async ({ output, original, writeFile }) => {
      expect(test.stop).toHaveBeenCalled()
      await writeFile(output, original)
    }, undefined, { watchBuildLogs })
    vi.spyOn(savePacing, 'createSavePacer').mockReturnValue({ beforeSave: vi.fn(async () => {}), settled: vi.fn() })
    const complete = vi.spyOn(watchReadiness, 'isWatchBuildComplete').mockImplementationOnce(() => {
      test.child.signalCode = 'SIGTERM'
      return true
    })
    await expect(test.run()).rejects.toThrow(/dev exited before hmr commit round=1.*signal=SIGTERM/)
    expect(complete).toHaveBeenCalledTimes(1)
    expect(test.writes()).toBe(2)
    expect(await fs.readFile(test.source, 'utf8')).toBe(test.original)
  })

  it('Uni 回滚文件已恢复仍等待本轮生产者提交，不复用旧 DONE 或 stderr 日志', async () => {
    let release
    let atRollback
    const rollbackStarted = new Promise((resolve) => {
      atRollback = resolve
    })
    const test = await fixture(async ({ child, output, original, writeFile }) => {
      await writeFile(output, original)
      child.stdout.emit('data', Buffer.from('DONE  Build complete. Watching for changes...\n'))
      child.stderr.emit('data', Buffer.from('Incremental Compiling...\nDONE  Build complete. Watching for changes...\n'))
      release = () => child.stdout.emit('data', Buffer.from(completeLog))
      atRollback()
    }, ({ child }) => {
      child.stdout.emit('data', Buffer.from('Incremental Compiling...\nDONE  Build complete. Watching for changes...\n'))
    }, { watchBuildLogs })
    const { stop } = test
    const nextRead = observeOutputRead(test, 2)
    const firstRead = nextRead()
    const running = test.run()
    try {
      await rollbackStarted
      await firstRead
      expect(stop).not.toHaveBeenCalled()
      const readAfterStart = nextRead()
      test.child.stdout.emit('data', Buffer.from(startLog))
      await readAfterStart
      expect(stop).not.toHaveBeenCalled()
    }
    finally {
      release()
      await running
    }
    expect(stop).toHaveBeenCalled()
  })

  it('Uni 提交日志先于回滚文件恢复时，仍校验实际产物', async () => {
    let release
    let atRollback
    const rollbackStarted = new Promise((resolve) => {
      atRollback = resolve
    })
    const test = await fixture(async ({ child, output, original, writeFile }) => {
      child.stdout.emit('data', Buffer.from(startLog + completeLog))
      release = () => writeFile(output, original)
      atRollback()
    }, ({ child }) => {
      for (const byte of Buffer.from(`开始差量编译...\r\n${completeLog}`)) {
        child.stdout.emit('data', Buffer.from([byte]))
      }
    }, { watchBuildLogs })
    const nextRead = observeOutputRead(test, 2)
    const firstRead = nextRead()
    const running = test.run()
    let result
    try {
      await rollbackStarted
      await firstRead
      expect(test.stop).not.toHaveBeenCalled()
    }
    finally {
      await release()
      result = await running
    }
    expect(result.hmrPluginMs).toEqual([23])
    expect(await fs.readFile(test.output, 'utf8')).toBe(test.original)
  })

  it.each(['code', 'signal'])('Uni 本轮提交前以 %s 退出时，不凭已回滚的文件放行', async (kind) => {
    const test = await fixture(async ({ child, output, original, writeFile }) => {
      await writeFile(output, original)
      child.stdout.emit('data', Buffer.from(startLog))
      if (kind === 'code') {
        child.exitCode = 1
      }
      else {
        child.signalCode = 'SIGTERM'
      }
    }, ({ child }) => {
      child.stdout.emit('data', Buffer.from(startLog + completeLog))
    }, { watchBuildLogs })
    await expect(test.run()).rejects.toThrow(/dev exited before rollback commit/)
    expect(await fs.readFile(test.source, 'utf8')).toBe(test.original)
  })

  it('Uni mutation 未提交时，不提前写入 rollback', async () => {
    let release
    let atMutation
    const mutationStarted = new Promise((resolve) => {
      atMutation = resolve
    })
    const test = await fixture(async ({ child, output, original, writeFile }) => {
      await writeFile(output, original)
      child.stdout.emit('data', Buffer.from(startLog + completeLog))
    }, ({ child }) => {
      child.stdout.emit('data', Buffer.from(startLog))
      release = () => child.stdout.emit('data', Buffer.from(completeLog))
      atMutation()
    }, { watchBuildLogs })
    const nextRead = observeOutputRead(test, 1)
    const firstRead = nextRead()
    const running = test.run()
    try {
      await mutationStarted
      await firstRead
      expect(test.writes()).toBe(1)
    }
    finally {
      release()
      await running
    }
    expect(test.writes()).toBe(2)
  })

  it('框架需要更长的编译稳定窗口时，在计时外等待后再回滚', async () => {
    const test = await fixture(async ({ output, original, writeFile, elapsedSinceMutation }) => {
      if (elapsedSinceMutation >= 500) {
        await writeFile(output, original)
      }
    }, undefined, { watchSettleMs: 600 })
    const result = await test.run()
    expect(result.hmrPluginMs).toEqual([23])
    expect(result.hmrMs[0]).toBeLessThan(500)
    expect(await fs.readFile(test.source, 'utf8')).toBe(test.original)
  })

  it('保存与回滚跨过 watcher 去重窗口，不丢失立即回滚事件', async () => {
    const test = await fixture(async ({ output, original, writeFile, elapsedSinceMutation }) => {
      if (elapsedSinceMutation >= 100) {
        await writeFile(output, original)
      }
    })
    const result = await test.run()
    expect(result.hmrPluginMs).toEqual([23])
    expect(await fs.readFile(test.output, 'utf8')).toBe(test.original)
  })

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
