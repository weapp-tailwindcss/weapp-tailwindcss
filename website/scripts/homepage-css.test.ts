import type { Declaration, Root } from 'postcss'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import postcss from 'postcss'
import { compile } from 'sass'
import { beforeAll, describe, expect, it, vi } from 'vitest'

const websiteRequire = createRequire(import.meta.url)
const coreRequire = createRequire(websiteRequire.resolve('@docusaurus/core/package.json'))
const bundlerRequire = createRequire(coreRequire.resolve('@docusaurus/bundler/package.json'))
const { getMinimizers } = bundlerRequire('./lib/minification.js')
const CssMinimizerPlugin = bundlerRequire('css-minimizer-webpack-plugin')
const { minify } = bundlerRequire('css-minimizer-webpack-plugin/dist/minify.js')
const selector = '.home-support__anchor-values strong'

interface MinificationResult {
  errors: unknown[]
  warnings: unknown[]
  outputs: { code: string }[]
}

function declarationsFor(root: Root, media?: string): Declaration[] {
  const declarations: Declaration[] = []
  root.walkRules((rule) => {
    if (!rule.selectors.includes(selector)) {
      return
    }
    const parentMedia = rule.parent?.type === 'atrule' && rule.parent.name === 'media'
      ? rule.parent.params
      : undefined
    if (parentMedia !== media) {
      return
    }
    rule.walkDecls((declaration) => {
      declarations.push(declaration)
    })
  })
  return declarations
}

describe('首页字体的生产 CSS 压缩', () => {
  let result: MinificationResult
  let root: Root

  beforeAll(async () => {
    const input = compile(fileURLToPath(new URL('../src/css/custom/_homepage.scss', import.meta.url))).css
    // 复用 Docusaurus 的真实配置和 worker 入口，避免另写一套压缩选项掩盖生产差异。
    vi.stubEnv('USE_SIMPLE_CSS_MINIFIER', 'false')
    try {
      const plugins = await getMinimizers({
        currentBundler: { name: 'webpack' },
        faster: { swcJsMinimizer: false, lightningCssMinimizer: false },
      })
      const plugin = plugins.find((candidate: object) => candidate instanceof CssMinimizerPlugin)
      expect(plugin).toBeDefined()
      result = await minify({ name: 'homepage.css', input, minimizer: plugin.options.minimizer })
      root = postcss.parse(result.outputs.at(-1)!.code)
    }
    finally {
      vi.unstubAllEnvs()
    }
  })

  it('保留字号、行高、等宽字体与 650 字重，不产生丢弃声明的警告', () => {
    expect.soft(result.errors).toEqual([])
    expect.soft(result.warnings).toEqual([])
    const declarations = declarationsFor(root)
    const font = declarations.filter(declaration => declaration.prop === 'font').at(-1)
    const weight = declarations.filter(declaration => declaration.prop === 'font-weight').at(-1)

    expect.soft(font?.value ?? '').toMatch(/^0?\.94rem\s*\/\s*1\.4\s+ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace$/)
    expect.soft(weight?.value).toBe('650')
    // 保留简写隐含的字体重置，并确保后置字重不会再次被 normal 覆盖。
    expect(declarations.indexOf(weight!)).toBeGreaterThan(declarations.indexOf(font!))
  })

  it('窄屏继续只覆盖字号，保留桌面规则的字重与字体', () => {
    const declarations = declarationsFor(root, '(max-width:760px)')
    expect(declarations.map(({ prop, value }) => [prop, value])).toEqual([
      ['font-size', '.82rem'],
    ])
  })
})
