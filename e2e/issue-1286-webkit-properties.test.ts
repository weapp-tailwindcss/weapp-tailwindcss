import { readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { postcss } from '@weapp-tailwindcss/postcss'
import fg from 'fast-glob'
import { beforeAll, describe, expect, it } from 'vitest'
import { ensureProjectBuilt } from './projectBuild'

const platform = process.env['E2E_ISSUE_1286_PLATFORM'] ?? 'weapp'
if (platform !== 'weapp' && platform !== 'alipay') {
  throw new Error(`不支持的 #1286 验证平台：${platform}，请使用 weapp 或 alipay。`)
}

const projectRoot = path.resolve(__dirname, '../demo/taro-webpack-react-tailwindcss-v4')
const outputRoot = path.join(projectRoot, 'dist')
const styleExtension = platform === 'weapp' ? '.wxss' : '.acss'
const fixtureSelectors = ['.issue-1286-icon', '.issue-1286-highlight', '.antialiased', '.subpixel-antialiased']
const declarations = new Map<string, Array<{ file: string, properties: Map<string, string[]> }>>()

function expectDeclaration(selector: string, property: string, value: string) {
  const rules = declarations.get(selector) ?? []
  expect(rules.length, `${platform} 应输出 ${selector}`).toBeGreaterThan(0)
  for (const rule of rules) {
    expect(rule.properties.get(property), `${platform} ${rule.file} ${selector} 应保留 ${property}: ${value}`)
      .toContain(value)
  }
}

describe(`issue #1286 WebKit 属性 ${platform} 产物`, () => {
  beforeAll(async () => {
    if (platform === 'alipay' && process.env['E2E_SKIP_BUILD'] !== '1') {
      throw new Error('支付宝验证只读取产物，请先执行 build:alipay，再设置 E2E_SKIP_BUILD=1。')
    }
    if (process.env['E2E_SKIP_BUILD'] !== '1') {
      await ensureProjectBuilt(projectRoot)
    }

    const files = (await fg('**/*', { cwd: outputRoot, absolute: true, onlyFiles: true }))
      .filter(file => path.extname(file).toLowerCase() === styleExtension)
      .sort()
    expect(files.length, `${platform} 应生成 ${styleExtension} 样式产物`).toBeGreaterThan(0)
    const fixtureFiles = new Set<string>()
    for (const file of files) {
      const root = postcss.parse(await readFile(file, 'utf8'), { from: file })
      root.walkRules((rule) => {
        for (const selector of fixtureSelectors) {
          if (!rule.selectors.includes(selector)) {
            continue
          }
          fixtureFiles.add(path.relative(outputRoot, file))
          const properties = new Map<string, string[]>()
          const rules = declarations.get(selector) ?? []
          rules.push({ file: path.relative(outputRoot, file), properties })
          declarations.set(selector, rules)
          rule.walkDecls((decl) => {
            const values = properties.get(decl.prop) ?? []
            values.push(decl.value)
            properties.set(decl.prop, values)
          })
        }
      })
    }
    expect([...declarations.keys()].sort()).toEqual([...fixtureSelectors].sort())
    console.info(`[issue-1286] ${platform} ${styleExtension} fixture 产物：${[...fixtureFiles].join(', ')}`)
  })

  it('作者样式保留字体平滑和自定义白名单，继续移除未配置前缀', () => {
    expectDeclaration('.issue-1286-icon', '-webkit-font-smoothing', 'antialiased')
    expectDeclaration('.issue-1286-icon', '-moz-osx-font-smoothing', 'grayscale')
    expectDeclaration('.issue-1286-icon', '-webkit-tap-highlight-color', 'transparent')
    for (const rule of declarations.get('.issue-1286-icon') ?? []) {
      expect(rule.properties.has('-webkit-appearance'), rule.file).toBe(false)
    }
  })

  it('生成的 Tailwind 工具类在最终清理后仍保留默认和自定义前缀', () => {
    expectDeclaration('.antialiased', '-webkit-font-smoothing', 'antialiased')
    expectDeclaration('.antialiased', '-moz-osx-font-smoothing', 'grayscale')
    expectDeclaration('.subpixel-antialiased', '-webkit-font-smoothing', 'auto')
    expectDeclaration('.subpixel-antialiased', '-moz-osx-font-smoothing', 'auto')
    expectDeclaration('.issue-1286-highlight', '-webkit-tap-highlight-color', 'transparent')
  })
})
