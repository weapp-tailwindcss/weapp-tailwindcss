import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createViteCssMemory } from '@/bundlers/vite/css-memory'
import { createFrameworkSourceScanSession } from '@/bundlers/vite/shared/framework-source-scan-session'
import { createSourceCandidateCollector } from '@/bundlers/vite/source-candidates'

const directories: string[] = []

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

async function fixture(existingRoot?: string) {
  const root = existingRoot ?? await mkdtemp(path.join(os.tmpdir(), 'vite-source-delete-order-'))
  if (!existingRoot) {
    directories.push(root)
  }
  const file = path.join(root, 'arbitrary-entry.html')
  const started = deferred()
  const blocked = deferred()
  const collector = createSourceCandidateCollector({
    async extractor(source) {
      if (source === 'old-candidate') {
        started.resolve()
        await blocked.promise
      }
      return [source]
    },
  })
  const memory = createViteCssMemory({ debug: vi.fn(), getSourceCandidateSource: collector.source })
  const session = createFrameworkSourceScanSession({
    cssMemory: memory,
    debug: vi.fn(),
    getResolvedConfig: () => ({ root }),
    hmrCandidateState: { apply: change => change, createChange: (_file, change) => change, clear: vi.fn() } as any,
    isCandidateRequest: () => true,
    isWatchLikeBuild: () => true,
    opts: {},
    runtimeState: { tailwindRuntime: {} } as any,
    shouldOwnTailwindGeneration: true,
    sourceCandidateCollector: collector,
  })
  return { root, file, collector, session, memory, started, blocked }
}

describe('来源扫描的显式删除顺序', () => {
  afterEach(async () => {
    await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
  })

  it('同项目独立实例首次扫描读取当前来源，不继承另一个实例的候选快照', async () => {
    const first = await fixture()
    await writeFile(first.file, 'first-instance-candidate')
    await first.session.sync()
    await writeFile(first.file, 'second-instance-candidate')
    const second = await fixture(first.root)
    await second.session.sync()

    expect(first.collector.values()).toEqual(new Set(['first-instance-candidate']))
    expect(second.collector.values()).toEqual(new Set(['second-instance-candidate']))
    await first.session.dispose()
    first.memory.dispose()
    expect(second.collector.values()).toEqual(new Set(['second-instance-candidate']))
    await second.session.dispose()
    second.memory.dispose()
  })

  it('等待旧提取后仍执行删除，不使用被合并更新的旧快照', async () => {
    const { file, collector, session, memory, started, blocked } = await fixture()
    const old = session.syncChangedFile(file, 'old-candidate')
    await started.promise
    session.queueChangedFile({ event: 'update', id: file, source: 'stale-queued-candidate' })
    session.queueChangedFile({ event: 'delete', id: file })
    const deletion = session.flushChangedFiles()
    blocked.resolve()
    await Promise.all([old, deletion])

    expect(collector.values()).toEqual(new Set())
    expect(collector.source(file)).toBeUndefined()
    await session.dispose()
    memory.dispose()
  })

  it('删除事件等待旧任务时不会改成读取尚未收到 create 的同名文件', async () => {
    const { file, collector, session, memory, started, blocked } = await fixture()
    const old = session.syncChangedFile(file, 'old-candidate')
    await started.promise
    await writeFile(file, 'unobserved-recreated-candidate')
    session.queueChangedFile({ event: 'delete', id: file })
    const deletion = session.flushChangedFiles()
    blocked.resolve()
    await Promise.all([old, deletion])

    expect(collector.values()).toEqual(new Set())
    session.queueChangedFile({ event: 'create', id: file })
    await session.flushChangedFiles()
    expect(collector.values()).toEqual(new Set(['unobserved-recreated-candidate']))
    await session.dispose()
    memory.dispose()
  })

  it('同轮删除后重建且未附快照时读取新文件，不能继承删除前的更新内容', async () => {
    const { file, collector, session, memory } = await fixture()
    await writeFile(file, 'new-candidate')
    session.queueChangedFile({ event: 'update', id: file, source: 'stale-queued-candidate' })
    session.queueChangedFile({ event: 'delete', id: file })
    session.queueChangedFile({ event: 'create', id: file })
    await session.flushChangedFiles()

    expect(collector.values()).toEqual(new Set(['new-candidate']))
    expect(collector.source(file)).toBe('new-candidate')
    await session.dispose()
    memory.dispose()
  })
})
