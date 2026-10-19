import fs from 'node:fs/promises'
import path from 'node:path'
import { beforeAll, expect, it } from 'vitest'
import { encodeLynxCss } from './lynx/batch-encode'
import { decodeLynxBundle } from './lynx/decoder'
import { assertOverflowRules } from './lynx/overflow-static'
import { parseDecodedRules, parseGeneratedRules } from './lynx/static-evidence'

let source: string
beforeAll(async () => {
  source = `.overflow-hidden{overflow:hidden}${await fs.readFile(path.join(import.meta.dirname, '..', 'examples', 'react-lynx', 'src', 'styles', 'overflow-fixtures.css'), 'utf8')}`
})

async function rules(css: string, stage: 'generation' | 'encoding') {
  if (stage === 'generation') {
    return parseGeneratedRules(css)
  }
  const bundle = (await encodeLynxCss(css, { mode: 'wasm', applyCompatibility: false })).buffer
  return parseDecodedRules((await decodeLynxBundle(bundle)).css.text)
}

for (const stage of ['generation', 'encoding'] as const) {
  it(`${stage} 必须保留候选及完整独立父/子、visible control夹具`, async () => {
    const actual = await rules(source, stage)
    expect(() => assertOverflowRules(actual, stage)).not.toThrow()
  })

  it(`${stage} 的control专属visible前后重排均无竞争，probe基础规则不能声明overflow`, async () => {
    const visible = '.probe-overflow-control{overflow:visible}'
    const withoutControl = source.replace(/\.probe-overflow-control\s*\{[^}]*\}/, '')
    for (const css of [`${visible}${withoutControl}`, `${withoutControl}${visible}`]) {
      const actual = await rules(css, stage)
      expect(() => assertOverflowRules(actual, stage)).not.toThrow()
    }
  })

  it.each([
    ['candidate', (css: string) => css.replace('.overflow-hidden{overflow:hidden}', '')],
    ['fixture-hidden', (css: string) => css.replaceAll('overflow: visible', 'overflow: hidden')],
    ['min-width', (css: string) => css.replace('min-width: 0', 'min-width: 120px')],
    ['child-no-overflow', (css: string) => css.replace('left: 72px', 'left: 20px')],
    ['extra-selector', (css: string) => `${css}.probe-overflow-panel.extra{overflow:hidden}`],
    ['parent-visible', (css: string) => css.replace('.probe-overflow-panel {', '.probe-overflow-panel {overflow:visible;')],
    ['parent-hidden', (css: string) => css.replace('.probe-overflow-panel {', '.probe-overflow-panel {overflow:hidden;')],
    ['control-on-parent', (css: string) => css.replace('.probe-overflow-control {', '.probe-overflow-control.probe-overflow-panel {')],
    ['extra-probe-id', (css: string) => `${css}#probe-layout-overflow{overflow:hidden}`],
    ['extra-escaped-id', (css: string) => `${css}${String.raw`#probe-layout-overfl\6fw{overflow:hidden}`}`],
    ['extra-outer-fixture', (css: string) => `${css}.probe-fixture-layout-overflow view{overflow:hidden}`],
    ['extra-important', (css: string) => css.replace('width: 96px', 'width: 96px!important')],
    ['partial-declaration', (css: string) => css.replace('height: 40px;', '')],
    ['media-guard', (css: string) => `@media(width > 0px){${css}}`],
    ['supports-guard', (css: string) => `@supports(display:grid){${css}}`],
  ] as const)(`${stage} 的 %s 篡改必须拒绝`, async (_mode, mutate) => {
    const awaited = await rules(mutate(source), stage)
    expect(() => assertOverflowRules(awaited, stage)).toThrow(/overflow/)
  })
}
