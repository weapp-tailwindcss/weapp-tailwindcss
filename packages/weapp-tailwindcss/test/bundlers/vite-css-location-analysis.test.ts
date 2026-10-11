import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { processViteCssCacheTask } from '@/bundlers/vite/generate-bundle/css-cache-task'
import { createCssTransformShareScope } from '@/bundlers/vite/generate-bundle/css-share-scope'
import { resolveViteCssTransformCachePlan } from '@/bundlers/vite/generate-bundle/css-transform-decision-plan'
import { createCache } from '@/cache'

describe('CSS transform location dependencies', () => {
  it.each([
    String.raw`.a{background:u\72l(./icon.svg)}`,
    String.raw`@\69mport "./dep.css";`,
  ])('isolates cached transforms of escaped relative resources: %s', (css) => {
    const first = createCssTransformShareScope(path.join('screens', 'first', 'style.css'), css)
    const second = createCssTransformShareScope(path.join('screens', 'second', 'style.css'), css)
    expect(first).not.toBe(second)
    expect(first).toBe('dir:screens/first')
    expect(second).toBe('dir:screens/second')
  })

  it.each([
    '.a{content:"url(./icon.svg)"}',
    '/* @import "./dep.css"; */ .a{color:red}',
    '.a{content:"@import"}',
  ])('shares transforms when resource syntax is only literal text: %s', (css) => {
    expect(createCssTransformShareScope('style.css', css)).toBe('global')
  })

  it.each([
    String.raw`.a{background:u\72l(./icon.svg)}`,
    String.raw`@\69mport "./dep.css";`,
  ])('applies directory-specific results through the shared task cache: %s', async (css) => {
    const first = path.join('screens', 'first', 'style.css')
    const sibling = path.join('screens', 'first', 'sibling.css')
    const second = path.join('screens', 'second', 'style.css')
    const result = await runLocationCacheTasks(css, [first, sibling, second], file => (
      path.dirname(file) === path.dirname(first) ? '.a{color:red}' : '.a{color:blue}'
    ))

    expect(result.applied).toEqual(new Map([
      [first, '.a{color:red}'],
      [sibling, '.a{color:red}'],
      [second, '.a{color:blue}'],
    ]))
    expect(result.transform).toHaveBeenCalledTimes(2)
    expect(result.onSharedCacheHit).toHaveBeenCalledOnce()
    expect(result.onCacheHit).toHaveBeenCalledTimes(3)
  })

  it.each([
    '.a{content:"url(./icon.svg)"}',
    '/* @import "./dep.css"; */ .a{color:red}',
    String.raw`.a{background:u\72l(https://cdn.example.com/icon.svg)}`,
  ])('reuses location-independent results across directories: %s', async (css) => {
    const files = ['first', 'second'].map(dir => path.join('screens', dir, 'style.css'))
    const result = await runLocationCacheTasks(css, files, () => css)

    expect(result.applied).toEqual(new Map(files.map(file => [file, css])))
    expect(result.transform).toHaveBeenCalledOnce()
    expect(result.onSharedCacheHit).toHaveBeenCalledOnce()
    expect(result.onCacheHit).toHaveBeenCalledTimes(2)
  })
})

async function runLocationCacheTasks(css: string, files: string[], transformResult: (file: string) => string) {
  const cache = createCache()
  const sharedResultCache = new Map<string, Promise<string>>()
  const applied = new Map<string, string>()
  const transform = vi.fn(async (file: string) => transformResult(file))
  const onCacheHit = vi.fn()
  const onSharedCacheHit = vi.fn()
  const run = (outputFile: string) => {
    const plan = resolveViteCssTransformCachePlan({
      cssIsMainChunk: false,
      cssRuntimeAffectingHash: cache.computeHash(css),
      cssShareScope: createCssTransformShareScope(outputFile, css),
      linkedImpactSignature: '',
      outputFile,
      runtimeSignature: 'runtime',
      scopedGeneratorCandidateSignature: 'stable',
      sourceTraceSignature: '',
      tailwindcssMajorVersion: 4,
    })
    return processViteCssCacheTask({
      applyResult(source) {
        applied.set(outputFile, source)
      },
      cache,
      cacheKey: plan.cssCacheKey,
      hashKey: plan.cssHashKey,
      onCacheHit,
      onSharedCacheHit,
      onSharedResult: vi.fn(),
      onTransformResult: vi.fn(),
      sharedCacheKey: plan.cssSharedCacheKey,
      sharedResultCache,
      taskHash: plan.cssTaskHash,
      transform: () => transform(outputFile),
    })
  }

  await Promise.all(files.map(run))
  sharedResultCache.clear()
  applied.clear()
  await Promise.all(files.map(run))
  return { applied, transform, onCacheHit, onSharedCacheHit }
}
