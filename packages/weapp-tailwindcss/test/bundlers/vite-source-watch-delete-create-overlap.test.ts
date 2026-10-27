import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { expect, it, vi } from 'vitest'
import { createViteCssMemory } from '@/bundlers/vite/css-memory'
import { createFrameworkSourceCandidatesPlugin } from '@/bundlers/vite/shared/framework-source-candidates-plugin'
import { createFrameworkSourceScanSession } from '@/bundlers/vite/shared/framework-source-scan-session'
import { createSourceCandidateCollector } from '@/bundlers/vite/source-candidates'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

it('异步删除清理完成不能撤销随后已接收的同名 create', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vite-watch-delete-create-'))
  const file = path.join(root, 'arbitrary-style.css')
  const css = '.fresh-watch-candidate { color: blue }'
  const collector = createSourceCandidateCollector({ extractor: source => [source] })
  const memory = createViteCssMemory({ debug: vi.fn(), getSourceCandidateSource: collector.source })
  const hmrCandidateState = {
    apply: (change: unknown) => change,
    createChange: (id: string, change: object) => ({ ...change, file: id }),
    clear: vi.fn(),
  }
  const session = createFrameworkSourceScanSession({
    cssMemory: memory,
    debug: vi.fn(),
    getResolvedConfig: () => ({ root }),
    hmrCandidateState: hmrCandidateState as any,
    isCandidateRequest: () => true,
    isWatchLikeBuild: () => true,
    opts: {},
    runtimeState: { tailwindRuntime: {} } as any,
    shouldOwnTailwindGeneration: true,
    sourceCandidateCollector: collector,
  })
  const deleteStarted = deferred()
  const deleteGate = deferred()
  const createStarted = deferred()
  const createGate = deferred()
  const plugin = createFrameworkSourceCandidatesPlugin({
    cssMemory: memory,
    hmrCandidateState,
    hmrTimingRecorder: { measure: (_name: string, task: () => unknown) => task() },
    invalidateRecordedGeneratorCandidates: vi.fn(),
    rememberOriginalCssLayerSource: vi.fn(),
    async removeViteProcessedCssSource(id: string) {
      memory.removeSource(id)
      deleteStarted.resolve()
      await deleteGate.promise
    },
    async refreshTailwindRootCssSource() {
      createStarted.resolve()
      await createGate.promise
    },
    resolveCurrentGeneratorBranch: () => ({ isWeb: false }),
    runtimeState: {},
    shouldOwnTailwindGeneration: true,
    sourceCandidateCollector: collector,
    sourceScanSession: session,
  })
  const hook = plugin.watchChange as any
  const watch = typeof hook === 'function' ? hook : hook.handler
  let deletion: Promise<unknown> | undefined
  let creation: Promise<unknown> | undefined
  try {
    await collector.syncCurrentSource(file, '.retired-watch-candidate{}')
    deletion = watch.call({}, file, { event: 'delete' })
    await deleteStarted.promise
    await writeFile(file, css)
    creation = watch.call({}, file, { event: 'create' })
    await createStarted.promise
    deleteGate.resolve()
    await deletion
    await session.waitForPendingSyncs()
    createGate.resolve()
    await creation
    await session.waitForPendingSyncs()

    expect(collector.source(file)).toBe(css)
    expect(collector.values()).toEqual(new Set([css]))
    expect(memory.getStats().pendingCssSourceOwners).toBe(0)
  }
  finally {
    deleteGate.resolve()
    createGate.resolve()
    await Promise.allSettled([deletion, creation])
    await session.dispose()
    memory.dispose()
    await rm(root, { recursive: true, force: true })
  }
})
