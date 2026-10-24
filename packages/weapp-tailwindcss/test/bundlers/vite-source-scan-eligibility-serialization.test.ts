import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { expect, it, vi } from 'vitest'
import { createViteCssMemory } from '@/bundlers/vite/css-memory'
import { createFrameworkSourceScanSession } from '@/bundlers/vite/shared/framework-source-scan-session'
import { createSourceCandidateCollector } from '@/bundlers/vite/source-candidates'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

it('资格列表刷新后仍按同文件顺序提取，旧任务结束不能移除新任务所有权', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vite-eligibility-order-'))
  const file = path.join(root, 'newly-eligible.html')
  const eligibilityStarted = deferred()
  const eligibilityGate = deferred()
  const firstStarted = deferred()
  const firstGate = deferred()
  const secondStarted = deferred()
  const secondGate = deferred()
  const extracted: string[] = []
  let active = 0
  let maxActive = 0
  const collector = createSourceCandidateCollector({
    async extractor(source) {
      extracted.push(source)
      maxActive = Math.max(maxActive, ++active)
      try {
        if (source === 'first-eligible-candidate') {
          firstStarted.resolve()
          await firstGate.promise
        }
        if (source === 'second-eligible-candidate') {
          secondStarted.resolve()
          await secondGate.promise
        }
        return [source]
      }
      finally {
        active--
      }
    },
  })
  const memory = createViteCssMemory({ debug: vi.fn(), getSourceCandidateSource: collector.source })
  const session = createFrameworkSourceScanSession({
    cssMemory: memory,
    debug: vi.fn(),
    getResolvedConfig: () => ({ root }),
    hmrCandidateState: {
      apply: (change: unknown) => change,
      createChange: (id: string, change: object) => ({ ...change, file: id }),
      clear: vi.fn(),
    } as any,
    isCandidateRequest: () => true,
    isWatchLikeBuild: () => true,
    opts: {},
    runtimeState: { tailwindRuntime: {} } as any,
    shouldOwnTailwindGeneration: true,
    sourceCandidateCollector: collector,
  })
  const tasks: Promise<unknown>[] = []
  try {
    await session.sync()
    await writeFile(file, 'file-on-disk-candidate')
    const resolveFiles = collector.resolveScanFiles.bind(collector)
    vi.spyOn(collector, 'resolveScanFiles').mockImplementation(async (options) => {
      eligibilityStarted.resolve()
      await eligibilityGate.promise
      return resolveFiles(options)
    })
    const first = session.syncChangedFile(file, 'first-eligible-candidate')
    tasks.push(first)
    await eligibilityStarted.promise
    tasks.push(session.syncChangedFile(file, 'second-eligible-candidate'))
    eligibilityGate.resolve()
    await firstStarted.promise
    await new Promise<void>(resolve => setImmediate(resolve))
    const whileFirstBlocked = [...extracted]
    firstGate.resolve()
    await first
    await secondStarted.promise
    tasks.push(session.syncChangedFile(file, 'third-eligible-candidate'))
    await new Promise<void>(resolve => setImmediate(resolve))
    const whileSecondBlocked = [...extracted]
    secondGate.resolve()
    await Promise.all(tasks)

    expect(whileFirstBlocked).toEqual(['first-eligible-candidate'])
    expect(whileSecondBlocked).toEqual(['first-eligible-candidate', 'second-eligible-candidate'])
    expect(maxActive).toBe(1)
    expect(collector.source(file)).toBe('third-eligible-candidate')
    expect(collector.values()).toEqual(new Set(['third-eligible-candidate']))
    expect(session.getStats().pendingSourceCandidateSyncByFile).toBe(0)
    expect(memory.getStats().pendingCssSourceOwners).toBe(0)
  }
  finally {
    eligibilityGate.resolve()
    firstGate.resolve()
    secondGate.resolve()
    await Promise.allSettled(tasks)
    await session.dispose()
    memory.dispose()
    await rm(root, { recursive: true, force: true })
  }
})
