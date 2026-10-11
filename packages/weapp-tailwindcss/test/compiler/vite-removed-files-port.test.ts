import type { OutputAsset } from 'rollup'
import { afterEach, describe, expect, it, vi } from 'vitest'

function createAsset(fileName: string, sourceFile: string): OutputAsset {
  return {
    type: 'asset',
    fileName,
    name: undefined,
    names: [],
    needsCodeReference: false,
    originalFileName: sourceFile,
    originalFileNames: [sourceFile],
    source: '.candidate{}',
  }
}

function createAnonymousAsset(fileName: string): OutputAsset {
  return {
    ...createAsset(fileName, ''),
    originalFileName: null,
    originalFileNames: [],
  }
}

describe('vite removed files port', () => {
  afterEach(() => {
    vi.doUnmock('@/bundlers/vite/generate-bundle/runtime')
    vi.doUnmock('@/bundlers/vite/shared/create-framework-plugins-runtime')
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it.each([undefined, '/workspace'])('routes CSS metadata and exact template source deletions into production snapshots once (root=%s)', async (root) => {
    const snapshots: Array<{ removedFiles: Set<string> }> = []
    const runtimeCloseBundle = vi.fn()
    const sourceCandidates = new Map<string, string>()
    vi.doMock('@/bundlers/vite/generate-bundle/runtime', async () => {
      const {
        buildBundleSnapshot,
        createBundleBuildState,
      } = await import('@/bundlers/vite/bundle-state')
      return {
        createGenerateBundleHook: vi.fn((context: any) => {
          const state = createBundleBuildState()
          return async (_options: unknown, bundle: Record<string, OutputAsset>) => {
            const { resolveCurrentSourceCandidateFile } = await import('@/bundlers/vite/generate-bundle/source-candidate-source')
            for (const file of Object.keys(bundle)) {
              resolveCurrentSourceCandidateFile({
                file,
                getSourceCandidateSource: context.getSourceCandidateSource,
                getSourceCandidateSources: context.getSourceCandidateSources,
                outDir: '/workspace/dist',
                rootDir: '/workspace',
                sourceRoot: '/workspace/source',
              })
            }
            snapshots.push(buildBundleSnapshot(bundle, {
              cache: {
                computeHash: (source: string) => source,
              },
              cssMatcher: () => true,
              htmlMatcher: () => true,
              jsMatcher: () => true,
            } as any, '/workspace/dist', state, false, {
              hasOmittedKnownFiles: true,
            }))
          }
        }),
      }
    })
    vi.doMock('@/bundlers/vite/shared/create-framework-plugins-runtime', async () => {
      const { createGenerateBundleHook } = await import('@/bundlers/vite/generate-bundle')
      return {
        createViteFrameworkPlugins: vi.fn(() => [{
          name: 'mock-vite-port',
          generateBundle: createGenerateBundleHook({
            getResolvedConfig: () => root ? { root } : undefined,
            getSourceCandidateSource: (file: string) => sourceCandidates.get(file),
            getSourceCandidateSources: () => sourceCandidates,
            runtimeState: {
              tailwindRuntime: { majorVersion: 4 },
              readyPromise: Promise.resolve(),
            },
          } as any),
          closeBundle: runtimeCloseBundle,
          watchChange: vi.fn(),
        }]),
      }
    })

    const { createViteFrameworkPlugins } = await import('@/bundlers/vite/shared/create-framework-plugins')
    const plugins = createViteFrameworkPlugins({}, {
      frameworkName: 'generic',
      styleInjectorDelegate: vi.fn() as any,
    })
    const plugin = plugins?.[0]
    const generateBundle = plugin?.generateBundle as (this: object, options: unknown, bundle: Record<string, OutputAsset>) => Promise<void>
    const watchChange = plugin?.watchChange as (id: string, change: { event: string }) => Promise<void>
    const sourceFile = '/workspace/src/theme.css'
    const templateSourceFile = '/workspace/source/views/card.axml'
    sourceCandidates.set(templateSourceFile, '<view class="pt-2" />')

    await generateBundle.call({}, {}, {
      'styles/theme.acss': createAsset('styles/theme.acss', root ? 'src/theme.css' : sourceFile),
      'styles/other.ttss': createAsset('styles/other.ttss', root ? 'src/other.css' : '/workspace/src/other.css'),
      'views/card.axml': createAnonymousAsset('views/card.axml'),
    })
    await watchChange(sourceFile, { event: 'delete' })
    await generateBundle.call({}, {}, {})
    await watchChange(templateSourceFile, { event: 'delete' })
    await generateBundle.call({}, {}, {})
    await generateBundle.call({}, {}, {})

    expect(snapshots[0]?.removedFiles).toEqual(new Set())
    expect(snapshots[1]?.removedFiles).toEqual(new Set(['styles/theme.acss']))
    expect(snapshots[2]?.removedFiles).toEqual(new Set(['views/card.axml']))
    expect(snapshots[3]?.removedFiles).toEqual(new Set())
    await plugin?.closeBundle?.()
    expect(runtimeCloseBundle).toHaveBeenCalledOnce()
  })
})
