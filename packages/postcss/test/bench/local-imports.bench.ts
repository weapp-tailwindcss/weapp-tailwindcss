import { test } from 'vitest'
import {
  cleanLocalCssImportWrapperTailwindDirectives,
  cleanLocalCssImportWrapperTailwindDirectivesRoot,
  isPureLocalCssImportWrapper,
  isPureLocalCssImportWrapperRoot,
  postcss,
  rewriteLocalCssImportRequestsForOutput,
  rewriteLocalCssImportRequestsForOutputRoot,
  splitLocalCssImports,
  splitLocalCssImportsRoot,
} from '@/index'

function createImportCorpus(size: number) {
  const parts = [
    '@import "./src/theme.css";',
    '@import "./src/components/card.scss?inline";',
    '@import "tailwindcss";',
    '@source "../src";',
  ]
  for (let i = 0; i < size; i++) {
    parts.push([
      `.card-${i} {`,
      '  display: flex;',
      '  gap: 12rpx;',
      '  border-radius: 28rpx;',
      '  background-image: linear-gradient(to bottom right, rgb(15 23 42 / 0.95), rgb(51 65 85 / 0.95));',
      '}',
    ].join('\n'))
  }
  return parts.join('\n')
}

const css = createImportCorpus(500)
const wrapperCss = [
  '@import "./index.wxss";',
  '@import "../components/card.wxss";',
  '@source "../src";',
].join('\n')

test('local css import benchmark', async ({ bench }) => {
  await bench.compare(
    bench('generator pipeline with string helpers', () => {
      isPureLocalCssImportWrapper(css)
      splitLocalCssImports(css)
      rewriteLocalCssImportRequestsForOutput(css, { styleOutputExtension: 'wxss' })
    }),
    bench('generator pipeline with one parsed root', () => {
      const root = postcss.parse(css)
      isPureLocalCssImportWrapperRoot(root)
      splitLocalCssImportsRoot(root)
      rewriteLocalCssImportRequestsForOutputRoot(root, { styleOutputExtension: 'wxss' })
    }),
    bench('clean wrapper string helper', () => {
      cleanLocalCssImportWrapperTailwindDirectives(wrapperCss)
    }),
    bench('clean wrapper root helper', () => {
      cleanLocalCssImportWrapperTailwindDirectivesRoot(postcss.parse(wrapperCss))
    }),
  )
})
