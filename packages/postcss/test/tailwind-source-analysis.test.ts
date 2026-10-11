import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { createTailwindV4SourceReferenceSource, hasTailwindApplyContextDirective } from '../src/compat/tailwindcss-v4/user-css/apply-reference'
import { insertTailwindThemeCss } from '../src/compat/tailwindcss-v4/theme-injection'
import { collectCssReferenceDirectives, createUniAppXHarmonyApplyGeneratorSource } from '../src/compat/uni-app-x/apply-source'
import { postcss } from '../src/postcss-runtime'
import { normalizeConfigDirective, prependConfigDirective } from '../src/generator-plugin/config-directive'
import { analyzeTailwindV4Source } from '../src/source-scan/tailwind-v4/fingerprint'
import { canProcessSourceStyleAsCss } from '../src/syntax/source-style'

describe('Tailwind 源码分析与组装', () => {
  it('配置指令保留缺省行为并转义跨平台请求', () => {
    expect(prependConfigDirective('.a{}', undefined)).toBe('.a{}')
    expect(prependConfigDirective('.a{}', 'C:\\workspace\\theme.js'))
      .toBe('@config "C:/workspace/theme.js";\n.a{}')
    expect(prependConfigDirective('@config "old"; .a{}', '/theme.js')).toBe('@config "old"; .a{}')
    expect(normalizeConfigDirective('@config "old"; .a{}', '/theme.js'))
      .toBe('@config "/theme.js"; .a{}')
    expect(normalizeConfigDirective('.a{}', '/theme.js')).toBe('.a{}')
  })

  it('仅允许可解析 CSS，预处理器语法保持拒绝', () => {
    expect(canProcessSourceStyleAsCss('.a { color: red; }', 'styles.css')).toBe(true)
    for (const source of ['$brand: red;', '// comment\n.a{}', '@mixin foo {}', '@use "theme";', '.a {']) {
      expect(canProcessSourceStyleAsCss(source, 'styles.scss')).toBe(false)
    }
  })

  it('指纹与显式指令共用解析结果，插件参数变化使指纹变化', () => {
    const parse = vi.spyOn(postcss, 'parse')
    try {
      const analysis = analyzeTailwindV4Source('@plugin "icons" { scale: 1; } @theme { --color-demo: red; }', path.basename)
      expect(analysis.hasExplicitDirectives).toBe(true)
      expect(analysis.getFingerprint()).toContain('theme-token:--color-demo')
      expect(analysis.getFingerprint()).toContain('plugin-option:icons:scale:1')
      expect(parse).toHaveBeenCalledTimes(1)
      const next = analyzeTailwindV4Source('@plugin "icons" { scale: 2; }', path.basename)
      expect(next.getFingerprint()).toContain('plugin-option:icons:scale:2')
      expect([...next.getFingerprint()].find(token => token.startsWith('plugin-options:')))
        .not.toBe([...analysis.getFingerprint()].find(token => token.startsWith('plugin-options:')))
    }
    finally {
      parse.mockRestore()
    }
  })

  it.each([
    ['/workspace/theme.js', path.posix.basename, 'theme.js'],
    ['./config/theme.js', path.posix.basename, 'theme.js'],
    ['C:\\workspace\\theme.js', path.win32.basename, 'theme.js'],
    ['\\theme.js', path.win32.basename, 'theme.js'],
    ['..\\config\\theme.js', path.win32.basename, 'theme.js'],
  ] as const)('配置请求的文件名处理由调用方提供：%s', (request, basename, expected) => {
    const tokens = analyzeTailwindV4Source(`@config "${request}";`, basename).getFingerprint()
    expect(tokens).toContain(`config:${expected}`)
    expect(tokens).toContain(`config-request:${request.replace(/\\/g, '/')}`)
  })

  it('非法 CSS、普通规则和源指令保持不同的分析结果', () => {
    const invalid = analyzeTailwindV4Source('@theme { --a: 1;', path.basename)
    expect(invalid.hasExplicitDirectives).toBe(false)
    expect(invalid.getFingerprint().size).toBe(0)
    expect(analyzeTailwindV4Source('.a {}', path.basename).hasExplicitDirectives).toBe(false)
    const source = analyzeTailwindV4Source('@import "tailwindcss" source(none); @source not inline("flex");', path.basename)
    expect(source.hasExplicitDirectives).toBe(true)
    expect(source.getFingerprint()).toEqual(new Set(['import-source:none', 'source:inline:not:"flex"']))
  })

  it('apply 引用仅补充缺失的上下文与已发现的候选', () => {
    const css = '.card { @apply p-4 flex; }'
    expect(createTailwindV4SourceReferenceSource(css, {}, '@reference "./theme.css";'))
      .toBe('@reference "./theme.css";\n@source inline("flex p-4");\n' + css)
    const entry = '@import "custom-tailwind"; ' + css
    expect(createTailwindV4SourceReferenceSource(entry, { packageName: 'custom-tailwind' })).toBe(entry)
    expect(createTailwindV4SourceReferenceSource('.card { color: red; }', {})).toBe('.card { color: red; }')
    expect(hasTailwindApplyContextDirective('@theme { --spacing: 1px; }')).toBe(true)
    expect(hasTailwindApplyContextDirective('@config "./theme.js";')).toBe(true)
    expect(hasTailwindApplyContextDirective('@theme {')).toBe(false)
  })

  it('Harmony 组装去掉相对 reference，保留包引用与非法片段', () => {
    const source = '@reference "./theme.css"; @reference "theme"; .a { @apply flex; }'
    const result = createUniAppXHarmonyApplyGeneratorSource([source, '.broken {'])
    expect(result).not.toContain('./theme.css')
    expect(result).toContain('@reference "theme";')
    expect(result).toContain('.a { @apply flex; }')
    expect(result).toContain('.broken {')
    expect(collectCssReferenceDirectives(source)).toEqual(new Set(['@reference "./theme.css";', '@reference "theme";']))
    expect(collectCssReferenceDirectives('@reference "theme"; .broken {')).toEqual(new Set())
  })

  it('主题注入保留原有 import 后位置和 CSS 字面格式', () => {
    expect(insertTailwindThemeCss('.a{}', '@theme{}')).toBe('@theme{}\n.a{}')
    expect(insertTailwindThemeCss('@import "a";\n.a{}', '@theme{}'))
      .toBe('@import "a";\n@theme{}\n\n.a{}')
    expect(insertTailwindThemeCss('@import "a";\n.a{}\n@import "b";', '@theme{}'))
      .toBe('@import "a";\n.a{}\n@import "b";\n@theme{}\n')
  })
})
