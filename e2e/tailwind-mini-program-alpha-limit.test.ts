import { fileURLToPath } from 'node:url'
import { miniProgramRuntimeColorWeightLimit } from '@weapp-tailwindcss/test-catalog'
import { describe, expect, it } from 'vitest'
import { escape } from 'weapp-tailwindcss/escape'
import { cssDeclarations } from './tailwind-capabilities/css'
import { withGeneratorFixture } from './tailwind-capabilities/fixture'

const root = fileURLToPath(new URL('..', import.meta.url))

function backgrounds(css: string, candidate: string) {
  return (cssDeclarations(css).contextsByClass.get(candidate) ?? [])
    .filter(context => context.declaration.property === 'background-color')
}

function background(selector: string, value: string, atRules: string[] = []) {
  return { selector, atRules, declaration: { property: 'background-color', value, important: false } }
}

describe('小程序颜色权重的预声明限制', () => {
  it('未知运行时权重保留 Web 语义，小程序不透明 fallback 只能作为限制证据', async () => {
    const limit = miniProgramRuntimeColorWeightLimit
    expect(limit.support).toBe('unsupported')
    expect(limit.stage).toBe('encoding')
    expect(limit.reason).toMatch(/百分比.*范围.*alpha.*无效变量/)
    expect(limit.runtimeEvidence).toBe('not-run')
    await withGeneratorFixture(root, '@import "tailwindcss" source(none);', {}, async (generator) => {
      const web = await generator.generate({ target: 'web', candidates: [limit.candidate], scanSources: false })
      const weapp = await generator.generate({ target: 'weapp', candidates: [limit.candidate], scanSources: false })
      const source = 'color-mix(in oklab, var(--color-sky-500) var(--my-alpha-value), transparent)'
      expect(web.classSet.has(limit.candidate)).toBe(true)
      expect(weapp.classSet.has(limit.candidate)).toBe(true)
      const selector = String.raw`.bg-sky-500\/\(--my-alpha-value\)`
      const expectedWeb = [
        background(selector, 'oklch(68.5% 0.169 237.323)'),
        background(selector, source, ['@supports (color: color-mix(in lab, red, red))']),
      ]
      expect(backgrounds(web.rawCss, limit.candidate)).toEqual(expectedWeb)
      expect(backgrounds(weapp.rawCss, limit.candidate)).toEqual(expectedWeb)
      expect(backgrounds(web.css, limit.candidate)).toEqual(expectedWeb)
      expect(backgrounds(weapp.css, escape(limit.candidate))).toEqual([background(`.${escape(limit.candidate)}`, 'rgb(0, 165, 234)')])
      expect(weapp.css).not.toContain('var(--my-alpha-value)')
      expect(weapp.css).not.toContain('color-mix(')
      // 非空规则只证明候选被处理；这里明确拒绝把不透明色当作动态透明度支持。
      expect(backgrounds(weapp.css, escape(limit.candidate))).not.toEqual(expectedWeb)
    })
  })

  it('字面量百分比保留 0、100 和小数边界，并乘以原色 alpha', async () => {
    const cases = [
      ['bg-probe/0', 'rgba(255, 0, 0, 0)'],
      ['bg-probe/25', 'rgba(255, 0, 0, 0.25)'],
      ['bg-probe/50', 'rgba(255, 0, 0, 0.5)'],
      ['bg-probe/100', 'rgb(255,0,0)'],
      ['bg-probe/[.33]', 'rgba(255, 0, 0, 0.33)'],
      ['bg-translucent/50', 'rgba(255, 0, 0, 0.2)'],
    ] as const
    const css = '@import "tailwindcss" source(none);@theme inline{--color-probe:rgb(255,0,0);--color-translucent:rgba(255,0,0,.4)}'
    await withGeneratorFixture(root, css, {}, async (generator) => {
      const weapp = await generator.generate({ target: 'weapp', candidates: cases.map(([candidate]) => candidate), scanSources: false })
      for (const [candidate, expected] of cases) {
        expect(backgrounds(weapp.css, escape(candidate)), candidate).toEqual([background(`.${escape(candidate)}`, expected)])
      }
    })
  })

  it('完整静态 root 权重与别名链保留百分比边界和原色 alpha', async () => {
    const cases = [
      ['bg-translucent/(--weight-zero)', 'rgba(255, 0, 0, 0)'],
      ['bg-translucent/(--weight-quarter)', 'rgba(255, 0, 0, 0.1)'],
      ['bg-translucent/(--weight-alias)', 'rgba(255, 0, 0, 0.2)'],
      ['bg-translucent/(--weight-full)', 'rgba(255, 0, 0, 0.4)'],
      ['bg-translucent/(--weight-fraction)', 'rgba(255, 0, 0, 0.05)'],
    ] as const
    const css = [
      '@import "tailwindcss" source(none);',
      ':root{--weight-zero:0%;--weight-quarter:25%;--weight-half:50%;--weight-alias:var(--weight-half);--weight-full:100%;--weight-fraction:12.5%}',
      '@theme inline{--color-translucent:rgba(255,0,0,.4)}',
    ].join('\n')
    await withGeneratorFixture(root, css, {}, async (generator) => {
      const weapp = await generator.generate({ target: 'weapp', candidates: cases.map(([candidate]) => candidate), scanSources: false })
      for (const [candidate, expected] of cases) {
        expect(weapp.classSet.has(candidate), candidate).toBe(true)
        expect(backgrounds(weapp.css, escape(candidate)), candidate).toEqual([
          background(`.${escape(candidate)}`, 'rgba(255,0,0,.4)'),
          background(`.${escape(candidate)}`, expected),
        ])
      }
    })
  })

  it.each([
    '.probe .child{background-color:red}',
    '@media print{.probe{background-color:red}}',
    '.probe{background-color:red!important}',
  ])('颜色相同也不能忽略选择器、条件或 important：%s', (css) => {
    expect(backgrounds(css, 'probe')).not.toEqual([background('.probe', 'red')])
  })
})
