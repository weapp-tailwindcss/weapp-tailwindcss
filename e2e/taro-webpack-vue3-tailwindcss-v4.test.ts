import fs from 'node:fs/promises'
import process from 'node:process'
import { postcss } from '@weapp-tailwindcss/postcss'
import fg from 'fast-glob'
import path from 'pathe'
import { describe, expect, it } from 'vitest'
import { getE2EProject } from './projectEntries'
import { defineProjectTest, ensureProjectBuilt } from './projectTest'
import { defineTaroBareSelectorRegression } from './taroBareSelectorRegression'

const project = getE2EProject('taro-webpack-vue3-tailwindcss-v4')

defineProjectTest(project, {
  suite: 'e2e',
  fixturesDir: '../demo',
})

defineTaroBareSelectorRegression(project)

function compactCss(css: string) {
  return css.replace(/\s+/g, '')
}

describe('e2e', () => {
  it('keeps both font-smoothing declarations in every NutUI font rule', async () => {
    const root = path.resolve(__dirname, '../demo', project.name)
    await ensureProjectBuilt(root)
    const outputRoot = path.resolve(root, 'dist')
    const files = await fg('**/*.wxss', { cwd: outputRoot, absolute: true, onlyFiles: true })
    let rules = 0
    for (const file of files) {
      const css = postcss.parse(await fs.readFile(file, 'utf8'), { from: file })
      css.walkRules((rule) => {
        if (!rule.selectors.includes('.nutui-iconfont')) {
          return
        }
        rules++
        const declarations = new Map<string, string[]>()
        rule.walkDecls((decl) => {
          declarations.set(decl.prop, [...(declarations.get(decl.prop) ?? []), decl.value])
        })
        expect(declarations.get('-webkit-font-smoothing'), file).toContain('antialiased')
        expect(declarations.get('-moz-osx-font-smoothing'), file).toContain('grayscale')
      })
    }
    expect(rules).toBeGreaterThan(0)
  })

  it('keeps Tailwind CSS v4 css entries isolated and emits mini-program preflight reset per full Tailwind entry', async () => {
    const projectBase = path.resolve(__dirname, '../demo')
    const root = path.resolve(projectBase, project.name)
    const projectPath = path.resolve(projectBase, project.projectPath)

    if (process.env.E2E_SKIP_BUILD !== '1') {
      await ensureProjectBuilt(root)
    }

    const appCss = await fs.readFile(path.resolve(projectPath, 'dist/app.wxss'), 'utf8')
    const subNormalCss = await fs.readFile(path.resolve(projectPath, 'dist/sub-normal/pages/index.wxss'), 'utf8')
    const subIndependentCss = await fs.readFile(path.resolve(projectPath, 'dist/sub-independent/pages/index.wxss'), 'utf8')

    const normalizedAppCss = compactCss(appCss)
    const normalizedSubNormalCss = compactCss(subNormalCss)
    const normalizedSubIndependentCss = compactCss(subIndependentCss)
    expect(normalizedAppCss).toContain('view,text,::after,::before')
    expect(normalizedAppCss).toContain('box-sizing:border-box')
    expect(normalizedAppCss).toContain('margin:0')
    expect(normalizedAppCss).toContain('padding:0')
    expect(normalizedAppCss).toContain('border:0solid')
    expect(normalizedSubNormalCss).toContain('view,text,::after,::before')
    expect(normalizedSubNormalCss).toContain('box-sizing:border-box')
    expect(normalizedSubNormalCss).toContain('margin:0')
    expect(normalizedSubNormalCss).toContain('padding:0')
    expect(normalizedSubNormalCss).toContain('border:0solid')
    expect(normalizedSubIndependentCss).toContain('view,text,::after,::before')
    expect(normalizedSubIndependentCss).toContain('box-sizing:border-box')
    expect(normalizedSubIndependentCss).toContain('margin:0')
    expect(normalizedSubIndependentCss).toContain('padding:0')
    expect(normalizedSubIndependentCss).toContain('border:0solid')
    expect(subNormalCss).toContain('.bg-normal-subpackage-marker')
    expect(subNormalCss).not.toContain('.bg-independent-subpackage-marker')
    expect(subIndependentCss).toContain('.bg-independent-subpackage-marker')
    expect(subIndependentCss).not.toContain('.bg-normal-subpackage-marker')
    const independentContentSelector = '.before_ccontent-_b_aindependent_subpackage_taro-webpack-vue3-tailwindcss-v4_a_B::before'
    expect(subIndependentCss.split(independentContentSelector)).toHaveLength(2)
    const contentRuleStart = subIndependentCss.indexOf(independentContentSelector)
    const contentRule = subIndependentCss.slice(contentRuleStart, subIndependentCss.indexOf('}', contentRuleStart))
    const literalContent = 'content: \'independent subpackage taro-webpack-vue3-tailwindcss-v4\';'
    expect(contentRule).toContain(literalContent)
    expect(contentRule.indexOf(literalContent)).toBeLessThan(contentRule.indexOf('content: var(--tw-content)'))
  })

  it('does not emit Tailwind CSS v4 empty content init for v4 output', async () => {
    const projectBase = path.resolve(__dirname, '../demo')
    const root = path.resolve(projectBase, project.name)
    const projectPath = path.resolve(projectBase, project.projectPath)

    if (process.env.E2E_SKIP_BUILD !== '1') {
      await ensureProjectBuilt(root)
    }

    const css = await fs.readFile(
      path.resolve(projectPath, 'dist/app.wxss'),
      'utf8',
    )

    expect(css).not.toMatch(
      /^::before,\s*::after\s*\{\s*--tw-content:\s*(?:''|"")\s*(?:;|\})/m,
    )
  })
})
