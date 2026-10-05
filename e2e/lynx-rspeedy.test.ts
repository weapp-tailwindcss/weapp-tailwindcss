import type { StaticEvidenceReport } from '../examples/react-lynx/src/compatibility/types'
import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import postcss from 'postcss'
import { describe, expect, it } from 'vitest'
import staticEvidenceJson from '../examples/react-lynx/src/compatibility/static-evidence.json'
import { buildCompatibilityBundle } from './lynx/build'
import { compatibilityDir, exampleDir, getCatalogHash, lynxIntermediateDir, repoRoot } from './lynx/catalog'
import { analyzeStaticEvidence } from './lynx/static-evidence'

const bundlePath = path.join(exampleDir, 'dist', 'main.lynx.bundle')
let encoderLog = ''
let decodedCss = ''

describe('ReactLynx Rspeedy compatibility evidence', () => {
  it('builds the public Lynx package and a development bundle with inspectable CSS', async () => {
    const build = await buildCompatibilityBundle()
    encoderLog = build.encoderLog
    const [bundle, css, tasm] = await Promise.all([
      fs.readFile(bundlePath),
      fs.readFile(path.join(lynxIntermediateDir, 'main.css'), 'utf8'),
      fs.readFile(path.join(lynxIntermediateDir, 'tasm.json'), 'utf8'),
    ])
    expect(bundle.byteLength).toBeGreaterThan(1024)
    expect(css).toContain('tailwindcss v4.3.3')
    expect(css).not.toContain('@source')
    expect((JSON.parse(tasm) as { css: { cssMap: object } }).css.cssMap).toBeTruthy()
  }, 300_000)

  it('decodes the real bundle with the pinned TASM decoder', async () => {
    const require = createRequire(path.join(repoRoot, 'e2e', 'package.json'))
    const tasm = require('@lynx-js/tasm') as { decode_napi: (source: Uint8Array) => unknown, decode_wasm: (source: Uint8Array) => Promise<unknown>, supportNapi: () => boolean }
    const source = new Uint8Array(await fs.readFile(bundlePath))
    const decoded = tasm.supportNapi() ? tasm.decode_napi(source) : await tasm.decode_wasm(source)
    expect(decoded).toBeTruthy()
    // decoder 以双花括号打印变量；仅恢复诊断文本语法，不改写被测字面量或实际 bundle。
    decodedCss = (decoded as { css: { text: string } }).css.text.replace(/\{\{(--[a-z0-9-]+)\}\}/gi, 'var($1)')
  }, 120_000)

  it.each(['layout-aspect', 'sizing-size', 'accessibility-sr'])('%s 的真实编码产物不允许通用最小尺寸覆盖被测尺寸', (id) => {
    const overrides: Record<string, string> = {}
    postcss.parse(decodedCss).walkRules((rule) => {
      if (rule.selectors.includes(`.probe-fixture-${id} .compat-probe`)) {
        rule.walkDecls((declaration) => {
          overrides[declaration.prop] = declaration.value
        })
      }
    })
    expect(overrides['min-width']).toMatch(/^0(?:px)?$/)
    expect(overrides['min-height']).toMatch(/^0(?:px)?$/)
    expect(overrides['box-sizing']).toBe('border-box')
  })

  it.each(['type-size', 'type-tracking'])('%s 的真实编码夹具让后续子节点位置反映文字宽度', (id) => {
    const declarations: Record<string, string> = {}
    postcss.parse(decodedCss).walkRules((rule) => {
      if (rule.selectors.includes(`.probe-fixture-${id} .compat-probe`)) {
        rule.walkDecls((declaration) => {
          declarations[declaration.prop] = declaration.value
        })
      }
    })
    expect(declarations.display).toBe('flex')
    expect(declarations['flex-direction']).toBe('row')
  })

  it('matches the committed CSS AST and encoder evidence for every catalog case', async () => {
    const actual = await analyzeStaticEvidence('ignored-by-comparison', encoderLog)
    const expected = staticEvidenceJson as StaticEvidenceReport
    expect(actual.catalogHash).toBe(getCatalogHash())
    expect(actual.versions).toEqual(expected.versions)
    expect(actual.catalogHash).toBe(expected.catalogHash)
    expect(actual.results).toEqual(expected.results)
    expect(actual.results.some(result => result.failureStage === 'encoder')).toBe(true)
    expect(actual.results.some(result => result.bundled)).toBe(true)
  })

  it('尺寸夹具在真实编码产物中提供可触发的对照并允许 utility 覆盖', async () => {
    const rules: Array<{ selector: string, declarations: Record<string, string> }> = []
    postcss.parse(decodedCss).walkRules((rule) => {
      const declarations: Record<string, string> = {}
      rule.walkDecls((declaration) => {
        declarations[declaration.prop] = declaration.value
      })
      for (const selector of rule.selectors) {
        rules.push({ selector, declarations })
      }
    })
    const box = rules.findIndex(rule => rule.selector === '.probe-box-sizing')
    const utility = rules.findIndex(rule => rule.selector === '.box-border')
    expect(box).toBeGreaterThanOrEqual(0)
    // decoder 的诊断文本按选择器重排；级联顺序必须读取真正送入 encoder 的 CSS。
    const encoderCss = await fs.readFile(path.join(lynxIntermediateDir, 'main.css'), 'utf8')
    expect(encoderCss.indexOf('.box-border {')).toBeGreaterThan(encoderCss.indexOf('.probe-box-sizing {'))
    expect(rules[box]?.declarations).toMatchObject({
      'width': '96px',
      'height': '64px',
      'box-sizing': 'content-box',
      'padding-top': '8px',
      'border-top-width': '2px',
    })
    const constrained = rules.find(rule => rule.selector === '.probe-constrained-size')
    expect(constrained?.declarations).toMatchObject({
      'width': '40px',
      'height': '300px',
      'box-sizing': 'border-box',
      'min-width': '0',
      'min-height': '0',
      'padding-top': '0',
    })
    expect(rules[utility]?.declarations['box-sizing']).toBe('border-box')
  })

  it('keeps generated evidence under the compatibility directory', () => {
    expect(path.dirname(path.join(compatibilityDir, 'static-evidence.json'))).toBe(compatibilityDir)
  })

  it.each([
    ['background-linear-gradient', 'probe-linear-gradient', '.bg-linear-to-r', 'background-image'],
    ['effect-shadow', 'probe-shadow', '.shadow-lg', 'box-shadow'],
    ['background-size', 'probe-background-size', '.bg-cover', 'background-size'],
  ])('%s 的默认像素夹具不能以更高权重覆盖 utility', async (id, fixture, utility, property) => {
    const css = await fs.readFile(path.join(lynxIntermediateDir, 'main.css'), 'utf8')
    let defaultIndex = -1
    let utilityIndex = -1
    let index = 0
    postcss.parse(css).walkRules((rule) => {
      index++
      rule.walkDecls(property, () => {
        expect(rule.selectors).not.toContain(`.probe-fixture-${id} .compat-probe`)
        if (rule.selectors.includes(`.${fixture}`)) {
          defaultIndex = index
        }
        if (rule.selectors.includes(utility)) {
          utilityIndex = index
        }
      })
    })
    expect(defaultIndex).toBeGreaterThan(0)
    expect(utilityIndex).toBeGreaterThan(defaultIndex)
    expect(decodedCss).toContain(`.${fixture}`)
  })
})
