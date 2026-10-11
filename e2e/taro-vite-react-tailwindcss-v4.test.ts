import fs from 'node:fs/promises'
import process from 'node:process'
import path from 'pathe'
import postcss from 'postcss'
import { describe, expect, it } from 'vitest'
import { getE2EProject } from './projectEntries'
import { defineProjectTest, ensureProjectBuilt } from './projectTest'
import { getProjectCssFiles } from './shared'
import { defineTaroBareSelectorRegression } from './taroBareSelectorRegression'

const project = getE2EProject('taro-vite-react-tailwindcss-v4')

defineProjectTest(project, {
  suite: 'e2e',
  fixturesDir: '../demo',
})

defineTaroBareSelectorRegression(project)

function collectCssRuleBlocks(css: string, selector: string) {
  const blocks: string[] = []
  const rulePattern = /(?:^|\n)([^@{}][^{]*)\{([^{}]*)\}/g
  for (const match of css.matchAll(rulePattern)) {
    const selectorList = match[1]?.split(',').map(item => item.trim()) ?? []
    if (selectorList.includes(selector)) {
      blocks.push(`${match[1]}{${match[2]}}`)
    }
  }
  return blocks.join('\n')
}

async function readCssWithLocalImports(projectPath: string, file: string, seen = new Set<string>()) {
  const filePath = path.resolve(projectPath, file)
  if (seen.has(filePath)) {
    return ''
  }
  seen.add(filePath)
  const css = await fs.readFile(filePath, 'utf8')
  const imports = [...css.matchAll(/@import\s+(?:"([^"]+)"|'([^']+)')/g)]
    .map(match => match[1] ?? match[2])
    .filter((request): request is string => Boolean(request) && !/^(?:[a-z]+:|\/|tailwindcss\b)/i.test(request))
  if (imports.length === 0) {
    return css
  }
  const importedCss = await Promise.all(imports.map(request =>
    readCssWithLocalImports(path.dirname(filePath), request, seen),
  ))
  return `${css}\n${importedCss.join('\n')}`
}

describe('e2e', () => {
  it('保留 NutUI 多选择器规则之后的单选择器覆盖', async () => {
    const root = path.resolve(__dirname, '../demo', project.projectPath)
    if (process.env.E2E_SKIP_BUILD !== '1') {
      await ensureProjectBuilt(root)
    }
    const css = (await Promise.all(getProjectCssFiles(project).map(file => readCssWithLocalImports(root, file)))).join('\n')
    const parsed = postcss.parse(css)
    const values = (selector: string, property: string) => {
      const result: string[] = []
      parsed.walkRules((rule) => {
        if (rule.selectors.includes(selector)) {
          rule.walkDecls(property, (decl) => {
            result.push(decl.value.replace(/\s*,\s*/g, ','))
          })
        }
      })
      return result
    }
    // NutUI 原始 CSS 先声明组合选择器，再对其中一个选择器覆盖；覆盖必须继续生效。
    expect(values('.nut-tabs-titles-item-smile', 'bottom').at(-1))
      .toBe('var(--nutui-tabs-titles-item-smile-bottom,-10%)')
    expect(values('.nut-tabs-titles-item-line', 'bottom').at(-1))
      .toBe('var(--nutui-tabs-line-bottom,15%)')
    expect(values('.nut-indicator-white .nut-indicator-line', 'opacity').at(-1)).toBe('0')
    expect(values('.nut-indicator-white .nut-indicator-dot', 'opacity').at(-1)).toBe('1')
  })

  it('converts Tailwind v4 spacing variables with Taro designWidth in issue 998 page CSS', async () => {
    const projectBase = path.resolve(__dirname, '../demo')
    const root = path.resolve(projectBase, project.name)
    const projectPath = path.resolve(projectBase, project.projectPath)

    if (process.env.E2E_SKIP_BUILD !== '1') {
      await ensureProjectBuilt(root)
    }

    const css = await fs.readFile(path.resolve(projectPath, 'dist/pages/issue-998/index.wxss'), 'utf8')
    expect(css).toMatch(/--spacing\s*:\s*8rpx/)
    expect(css).toMatch(/padding\s*:\s*calc\(var\(--spacing\)\s*\*\s*4\)/)
    expect(css).not.toMatch(/--spacing\s*:\s*4px/)
  })

  it('keeps non-class JSX and WXML text unescaped in Taro Vite React v4 output', async () => {
    const projectBase = path.resolve(__dirname, '../demo')
    const root = path.resolve(projectBase, project.name)
    const projectPath = path.resolve(projectBase, project.projectPath)

    if (process.env.E2E_SKIP_BUILD !== '1') {
      await ensureProjectBuilt(root)
    }

    const pageJs = await fs.readFile(path.resolve(projectPath, 'dist/pages/index/index.js'), 'utf8')
    const pageWxml = await fs.readFile(path.resolve(projectPath, 'dist/pages/index/index.wxml'), 'utf8')

    expect(pageJs).toContain('Hello world!')
    expect(pageJs).toContain('at App.vue:4 index.ts:120:3')
    expect(pageJs).toContain('size > 4 ? keep-[business] : App.vue:4')
    expect(pageJs).toContain('before content ["not-generated"]')
    expect(pageJs).toContain('https://example.com/a[b]?q=Hello world!')
    expect(pageJs).not.toContain('Hello world_e')
    expect(pageWxml).not.toContain('Hello world_e')
    expect(pageJs).not.toContain('App_dvue_c4')
    expect(pageJs).not.toContain('index_dts_c120_c3')
    expect(pageJs).not.toContain('keep-_bbusiness_B')
    expect(pageJs).not.toContain('not-generated_q_B')
  })

  it('keeps Tailwind CSS v4 bg-linear-to-r variable gradient without lab supports guard', async () => {
    const projectBase = path.resolve(__dirname, '../demo')
    const root = path.resolve(projectBase, project.name)
    const projectPath = path.resolve(projectBase, project.projectPath)

    if (process.env.E2E_SKIP_BUILD !== '1') {
      await ensureProjectBuilt(root)
    }

    const css = await readCssWithLocalImports(projectPath, 'dist/app.wxss')
    const linearBlocks = collectCssRuleBlocks(css, '.bg-linear-to-r')

    expect(css).toContain('.bg-linear-to-r')
    expect(css).not.toMatch(/^::before,\s*::after\s*\{\s*--tw-content:\s*(?:''|"")\s*(?:;|\})/m)
    expect(css).toMatch(/--tw-gradient-position:\s*to right\s*;/)
    expect(css).toMatch(/background-image:\s*linear-gradient\(var\(--tw-gradient-stops\)\)/)
    expect(css).not.toContain('@supports (background-image: linear-gradient(in lab, red, red))')
    expect(linearBlocks).not.toContain('in oklab')
  })
})
