import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createFrameworkSourceScanSession } from '@/bundlers/vite/shared/framework-source-scan-session'
import { createSourceCandidateCollector } from '@/bundlers/vite/source-candidates'

const createdDirs: string[] = []

async function createTempWorkspace() {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'weapp-tw-vite-source-session-'))
  const appRoot = path.join(workspaceRoot, 'packages/app')
  await mkdir(appRoot, { recursive: true })
  createdDirs.push(workspaceRoot)
  return { appRoot, workspaceRoot }
}

function createSession(options: {
  appRoot: string
  extractor: (source: string) => Promise<string[]>
  sources?: Array<{ base: string, pattern: string, negated: boolean }>
}) {
  const sourceCandidateCollector = createSourceCandidateCollector({ extractor: options.extractor })
  const hmrCandidateState = {
    apply: vi.fn(change => change),
    createChange: vi.fn((_file, change) => change),
  }
  return {
    session: createFrameworkSourceScanSession({
      cssMemory: {
        refreshRememberedCssSourceByCurrentFile: vi.fn(async () => {}),
        refreshRememberedCssSourceBySourceFile: vi.fn(async () => {}),
      } as any,
      debug: vi.fn(),
      getResolvedConfig: () => ({ root: options.appRoot }),
      hmrCandidateState: hmrCandidateState as any,
      isCandidateRequest: () => true,
      isWatchLikeBuild: () => true,
      opts: {},
      runtimeState: {
        tailwindRuntime: {
          majorVersion: 4,
          options: {
            projectRoot: options.appRoot,
            tailwindcss: {
              cwd: options.appRoot,
              v4: {
                base: options.appRoot,
                sources: options.sources,
              },
            },
          },
        },
      } as any,
      shouldOwnTailwindGeneration: true,
      sourceCandidateCollector,
    }),
    sourceCandidateCollector,
  }
}

describe('vite framework source scan session', () => {
  afterEach(async () => {
    await Promise.all(createdDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
  })

  it('监听依赖来自当前 source 扫描，改指向后移除旧文件和排除文件', async () => {
    const { appRoot } = await createTempWorkspace()
    const first = path.join(appRoot, 'first.html')
    const second = path.join(appRoot, 'second.html')
    await writeFile(first, 'first-candidate')
    await writeFile(second, 'second-candidate')
    const sources = [{ base: appRoot, pattern: 'first.html', negated: false }]
    const { session, sourceCandidateCollector } = createSession({ appRoot, sources, extractor: async source => [source] })
    await session.sync()
    expect([...session.getWatchFiles()].map(file => path.basename(file))).toContain('first.html')
    expect([...session.getWatchFiles()].map(file => path.basename(file))).not.toContain('second.html')
    sources[0]!.pattern = 'second.html'
    session.invalidate()
    await session.sync()
    expect([...session.getWatchFiles()].map(file => path.basename(file))).toContain('second.html')
    expect([...session.getWatchFiles()].map(file => path.basename(file))).not.toContain('first.html')
    expect(sourceCandidateCollector.valuesForEntries(sources)).toEqual(new Set(['second-candidate']))
  })

  it('serializes explicit source snapshots for the same HMR file', async () => {
    let releaseFirstExtraction!: () => void
    const firstExtractionBlocked = new Promise<void>((resolve) => {
      releaseFirstExtraction = resolve
    })
    const extractedSources: string[] = []
    const sourceCandidateCollector = createSourceCandidateCollector({
      async extractor(source) {
        extractedSources.push(source)
        if (source === 'old-candidate') {
          await firstExtractionBlocked
        }
        return [source]
      },
    })
    const hmrCandidateState = {
      apply: vi.fn(change => change),
      createChange: vi.fn((_file, change) => change),
    }
    const session = createFrameworkSourceScanSession({
      cssMemory: {
        refreshRememberedCssSourceByCurrentFile: vi.fn(async () => {}),
      } as any,
      debug: vi.fn(),
      getResolvedConfig: () => ({ root: '/project' }),
      hmrCandidateState: hmrCandidateState as any,
      isCandidateRequest: () => true,
      isWatchLikeBuild: () => true,
      opts: {},
      runtimeState: {
        tailwindRuntime: {},
      } as any,
      shouldOwnTailwindGeneration: true,
      sourceCandidateCollector,
    })
    const file = '/project/src/pages/index.vue'

    const oldSync = session.syncChangedFile(file, 'old-candidate')
    await vi.waitFor(() => {
      expect(extractedSources).toEqual(['old-candidate'])
    })

    const newSync = session.syncChangedFile(file, 'new-candidate')
    await Promise.resolve()
    expect(extractedSources).toEqual(['old-candidate'])

    releaseFirstExtraction()
    await Promise.all([oldSync, newSync])

    expect(extractedSources).toEqual(['old-candidate', 'new-candidate'])
    expect(sourceCandidateCollector.values()).toEqual(new Set(['new-candidate']))
    expect(hmrCandidateState.apply).toHaveBeenCalledTimes(2)
  })

  it('keeps implicit transformed modules inside the source scan roots', async () => {
    const { appRoot, workspaceRoot } = await createTempWorkspace()
    const appFile = path.join(appRoot, 'src/App.vue')
    await mkdir(path.dirname(appFile), { recursive: true })
    await writeFile(appFile, 'text-green-400')
    const extractor = vi.fn(async (source: string) => [source])
    const { session, sourceCandidateCollector } = createSession({ appRoot, extractor })
    await session.sync()
    extractor.mockClear()

    const dependencyFile = path.join(workspaceRoot, 'node_modules/monaco-editor/index.ts')
    await session.syncChangedFile(dependencyFile, 'text-blue-500')
    await session.syncChangedFile(appFile, 'text-green-500')

    expect(extractor).toHaveBeenCalledOnce()
    expect(extractor).toHaveBeenCalledWith('text-green-500', 'vue')
    expect(sourceCandidateCollector.values()).toEqual(new Set(['text-green-500']))
  })

  it('keeps gitignored modules out while accepting newly created source files', async () => {
    const { appRoot } = await createTempWorkspace()
    const ignoredFile = path.join(appRoot, 'ignored-by-gitignore.js')
    const existingFile = path.join(appRoot, 'src/App.vue')
    const newFile = path.join(appRoot, 'src/NewPage.vue')
    await mkdir(path.dirname(existingFile), { recursive: true })
    await writeFile(path.join(appRoot, '.gitignore'), 'ignored-by-gitignore.js\n')
    await writeFile(ignoredFile, 'text-red-500')
    await writeFile(existingFile, 'text-green-500')

    const extractor = vi.fn(async (source: string) => [source])
    const { session, sourceCandidateCollector } = createSession({ appRoot, extractor })
    const resolveScanFiles = vi.spyOn(sourceCandidateCollector, 'resolveScanFiles')
    await session.sync()
    resolveScanFiles.mockClear()
    extractor.mockClear()

    await session.syncChangedFile(ignoredFile, 'text-red-500')
    await session.syncChangedFile(ignoredFile, 'text-red-500')
    await writeFile(newFile, 'text-sky-500')
    await session.syncChangedFile(newFile, 'text-sky-500')

    expect(resolveScanFiles).toHaveBeenCalledTimes(2)
    expect(extractor).toHaveBeenCalledOnce()
    expect(extractor).toHaveBeenCalledWith('text-sky-500', 'vue')
    expect(sourceCandidateCollector.values()).toEqual(new Set(['text-green-500', 'text-sky-500']))
  })

  it('keeps explicitly configured dependency sources eligible outside the vite root', async () => {
    const { appRoot, workspaceRoot } = await createTempWorkspace()
    const dependencyRoot = path.join(workspaceRoot, 'node_modules/example')
    const extractor = vi.fn(async (source: string) => [source])
    const { session, sourceCandidateCollector } = createSession({
      appRoot,
      extractor,
      sources: [{ base: dependencyRoot, pattern: '**/*.ts', negated: false }],
    })
    await session.sync()
    extractor.mockClear()

    const dependencyFile = path.join(dependencyRoot, 'index.ts')
    const unrelatedFile = path.join(workspaceRoot, 'node_modules/other/index.ts')
    await session.syncChangedFile(dependencyFile, 'text-blue-500')
    await session.syncChangedFile(unrelatedFile, 'text-red-500')

    expect(extractor).toHaveBeenCalledOnce()
    expect(extractor).toHaveBeenCalledWith('text-blue-500', 'ts')
    expect(sourceCandidateCollector.values()).toEqual(new Set(['text-blue-500']))
  })

  it('coalesces queued source changes into one flush while preserving the latest source per file', async () => {
    const { appRoot } = await createTempWorkspace()
    const firstFile = path.join(appRoot, 'src/First.vue')
    const secondFile = path.join(appRoot, 'src/Second.vue')
    await mkdir(path.dirname(firstFile), { recursive: true })
    await writeFile(firstFile, 'text-old')
    await writeFile(secondFile, 'text-second')
    const extractor = vi.fn(async (source: string) => [source])
    const { session, sourceCandidateCollector } = createSession({ appRoot, extractor })
    await session.sync()
    extractor.mockClear()

    session.queueChangedFile({ event: 'update', id: firstFile, source: 'text-intermediate' })
    session.queueChangedFile({ event: 'update', id: firstFile, source: 'text-latest' })
    session.queueChangedFile({ event: 'update', id: secondFile, source: 'text-second-next' })
    const changes = await session.flushChangedFiles()

    expect(extractor).toHaveBeenCalledTimes(2)
    expect(extractor).toHaveBeenCalledWith('text-latest', 'vue')
    expect(extractor).toHaveBeenCalledWith('text-second-next', 'vue')
    expect(changes.size).toBe(2)
    expect(sourceCandidateCollector.values()).toEqual(new Set(['text-latest', 'text-second-next']))
  })

  it('waits for a change queued during an active flush before completing the HMR batch', async () => {
    const { appRoot } = await createTempWorkspace()
    const file = path.join(appRoot, 'src/Queued.vue')
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, 'text-old')
    let releaseFirst!: () => void
    const firstBlocked = new Promise<void>(resolve => {
      releaseFirst = resolve
    })
    const extractor = vi.fn(async (source: string) => {
      if (source === 'queued-first-1127') {
        await firstBlocked
      }
      return [source]
    })
    const { session, sourceCandidateCollector } = createSession({ appRoot, extractor })
    await session.sync()
    extractor.mockClear()

    session.queueChangedFile({ event: 'update', id: file, source: 'queued-first-1127' })
    const firstFlush = session.flushChangedFiles()
    await vi.waitFor(() => expect(extractor).toHaveBeenCalledWith('queued-first-1127', 'vue'))
    session.queueChangedFile({ event: 'update', id: file, source: 'queued-latest-1127' })
    const secondFlush = session.flushChangedFiles()
    releaseFirst()
    await Promise.all([firstFlush, secondFlush])
    await session.waitForPendingSyncs()

    expect(extractor).toHaveBeenCalledTimes(2)
    expect(extractor).toHaveBeenLastCalledWith('queued-latest-1127', 'vue')
    expect(sourceCandidateCollector.values()).toEqual(new Set(['queued-latest-1127']))
  })
})
