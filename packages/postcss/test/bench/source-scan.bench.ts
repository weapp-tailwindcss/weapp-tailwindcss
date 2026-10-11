import { test } from 'vitest'
import { createSourceScanPattern, DEFAULT_SOURCE_SCAN_EXTENSIONS, postcss, resolveCssSourceEntries } from '@/index'

function createSourceCorpus(size: number) {
  const parts = [
    '@source "./src";',
    '@source "./components/**/*.{vue,ts}";',
    '@source not "./dist";',
    '@source inline("flex gap-3 rounded-[28rpx]");',
  ]
  for (let i = 0; i < size; i++) {
    parts.push(`.card-${i} { @apply flex flex-col gap-3 rounded-[28rpx]; }`)
  }
  return parts.join('\n')
}

const css = createSourceCorpus(500)
const base = process.cwd()
const pattern = createSourceScanPattern(DEFAULT_SOURCE_SCAN_EXTENSIONS)

test('source scan benchmark', async ({ bench }) => {
  await bench.compare(
    bench('resolve css source entries for each collector', async () => {
      const root = postcss.parse(css)
      await resolveCssSourceEntries(root, base, pattern)
      await resolveCssSourceEntries(root, base, pattern)
    }),
    bench('resolve css source entries once and reuse', async () => {
      const root = postcss.parse(css)
      const sourceEntries = await resolveCssSourceEntries(root, base, pattern)
      void sourceEntries
      void sourceEntries
    }),
  )
})
