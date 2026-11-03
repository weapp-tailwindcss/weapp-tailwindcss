import type { Plugin, ResolvedConfig } from 'vite'
import { parse } from '@vue/compiler-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { createViteCssMemory } from '@/bundlers/vite/css-memory'
import { createFrameworkCssAssets } from '@/bundlers/vite/shared/framework-css-assets'
import { createFrameworkWatchCssCacheAdapter } from '@/bundlers/vite/shared/framework-watch-css-adapter'
import { createWatchCssGenerator } from './helpers/css-watch-generator'

vi.mock('@/context/generation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/context/generation')>()
  return {
    ...actual,
    generateTailwindV4Css: vi.fn(async ({ rawSource }: { rawSource: string }) => ({ css: rawSource, dependencies: [], classSet: new Set() })),
  }
})

vi.mock('@vue/compiler-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@vue/compiler-dom')>()
  return { ...actual, parse: vi.fn(actual.parse) }
})

afterEach(() => vi.clearAllMocks())

function adapter(memory: ReturnType<typeof createViteCssMemory>) {
  const getCssHandlerOptions = vi.fn((_file: string) => ({}))
  const plugin: Plugin = { name: 'vite:css-post', transform: css => css }
  createFrameworkWatchCssCacheAdapter({
    shouldAdapt: () => true,
    getKnownSfcStyleSnapshot: memory.getKnownSfcStyleSnapshot,
    getCssHandlerOptions,
    styleHandler: async css => ({ css }),
    debug() {},
  })({ plugins: [plugin] } as ResolvedConfig)
  return {
    getCssHandlerOptions,
    transform: plugin.transform as (css: string, id: string) => Promise<unknown>,
  }
}

it('shares a full-source snapshot with watch requests while honoring their explicit style index', async () => {
  const file = '/project/Label.vue'
  const source = '<template><view /></template><style>.same{}</style><style scoped>.same{}</style>'
  const memory = createViteCssMemory({ debug() {}, getSourceCandidateSource: () => source })
  memory.rememberKnownSfcSource(file, source)
  const first = memory.getKnownSfcStyleSnapshot(file)
  const fixture = adapter(memory)
  await fixture.transform('.compiled{}', `${file}?vue&type=style&index=1&lang.css`)
  await fixture.transform('.compiled{}', `${file}?vue&type=style&index=0&lang.css`)
  const requests = fixture.getCssHandlerOptions.mock.calls.map(call => new URLSearchParams(call[0]?.split('?')[1]))
  expect(requests.map(query => query.get('index'))).toEqual(['1', '0'])
  expect(requests.map(query => query.get('scoped'))).toEqual(['true', null])
  expect(memory.getKnownSfcStyleSnapshot(file)).toBe(first)
  expect(parse).toHaveBeenCalledOnce()
  memory.dispose()
})

it('preserves the missing-source SFC fallback and non-SFC request identity', async () => {
  const memory = createViteCssMemory({ debug() {}, getSourceCandidateSource() {} })
  const fixture = adapter(memory)
  await fixture.transform('.compiled{}', '/project/Unknown.vue?vue&type=style&index=1&scoped=true&lang.css')
  await fixture.transform('.compiled{}', '/project/theme.css?direct')
  expect(fixture.getCssHandlerOptions.mock.calls).toEqual([['/project/Unknown.vue'], ['/project/theme.css?direct']])
  expect(parse).not.toHaveBeenCalled()
  memory.dispose()
})

it('reuses one document parse across generator and watch consumers and one snapshot read per generation', async () => {
  const file = '/project/Label.vue'
  const source = '<template><view /></template><style>.same{}</style><style scoped>.same{}</style>'
  const getSourceCandidateSource = vi.fn(() => source)
  const assets = createFrameworkCssAssets({ debug() {}, getSourceCandidateSource })
  const memory = assets.cssMemory
  memory.rememberKnownSfcSource(file, source)
  const first = memory.getKnownSfcStyleSnapshot(file)
  const getSnapshot = vi.spyOn(memory, 'getKnownSfcStyleSnapshot')
  const generate = createWatchCssGenerator(assets)
  const fixture = adapter(memory)
  getSourceCandidateSource.mockClear()
  for (const index of [1, 0]) {
    const id = `${file}?vue&type=style&index=${index}&lang.css`
    expect(await generate(id, '.same{}')).toContain('.same{}')
    expect(getSnapshot).toHaveBeenCalledTimes(1)
    expect(getSourceCandidateSource).toHaveBeenCalledTimes(1)
    const request = [...memory.getRememberedCssSources().values()].at(-1)?.sourceFile
    const query = new URLSearchParams(request?.split('?')[1])
    expect(query.get('index')).toBe(String(index))
    expect(query.get('scoped')).toBe(index === 1 ? 'true' : null)
    await fixture.transform('.same{}', id)
    getSnapshot.mockClear()
    getSourceCandidateSource.mockClear()
  }
  expect(memory.getKnownSfcStyleSnapshot(file)).toBe(first)
  expect(parse).toHaveBeenCalledOnce()
  await generate.dispose()
  memory.dispose()
})
