import { describe, expect, it } from 'vitest'
import { classifyChangedPerformanceFiles } from '../scripts/change-relevance.mjs'

describe('release changelog performance relevance', () => {
  it('classifies generated demo changelogs as release metadata', async () => {
    const files = ['demo/weapp-vite-tailwindcss-v4/CHANGELOG.md', 'demo/web/react/CHANGELOG.md']
    const readManifest = () => { throw new Error('Changelogs are not manifests') }
    expect(await classifyChangedPerformanceFiles(files, readManifest)).toEqual({
      relevant: false,
      relevantFiles: [],
      ignoredReleaseMetadataFiles: [...files].sort(),
      ignoredNonPerformanceFiles: [],
    })
  })

  it.each(['src/index.ts', 'src/content.md', 'vite.config.ts', 'CHANGELOG.md.ts'])('preserves the guard for demo %s changes alongside release metadata', async (file) => {
    const source = `demo/weapp-vite-tailwindcss-v4/${file}`
    const result = await classifyChangedPerformanceFiles([
      'demo/weapp-vite-tailwindcss-v4/CHANGELOG.md',
      source,
    ], async () => undefined)
    expect(result.relevant).toBe(true)
    expect(result.relevantFiles).toEqual([source])
  })

  it('preserves dependency and build script guards alongside changelogs', async () => {
    const manifest = 'demo/weapp-vite-tailwindcss-v4/package.json'
    const result = await classifyChangedPerformanceFiles([
      'demo/weapp-vite-tailwindcss-v4/CHANGELOG.md', manifest,
    ], async () => ({
      baseline: { dependencies: { vite: '^7.0.0' }, scripts: { build: 'vite build' } },
      current: { dependencies: { vite: '^8.0.0' }, scripts: { build: 'vite build --minify' } },
    }))
    expect(result.relevantFiles).toEqual([manifest])
  })
})
