import path from 'node:path'
import { normalizePath } from 'vite'
import { createStyleHandler, postcss } from '@weapp-tailwindcss/postcss'
import { compileString } from 'sass'
import { compile } from 'tailwindcss'
import { describe, expect, it, vi } from 'vitest'
import { createJsHandler } from '@/js'
import {
  collectUniAppXHarmonyApplyStyleSourcesFromSource,
  collectUniAppXHarmonyApplyUtilitiesFromSources,
  createStyleValueFromApplySources,
} from '@/uni-app-x/style-asset/style-value'
import { createUniAppXHarmonyApplyGeneratorSource, expandUniAppXHarmonyApplyStyles } from '@/uni-app-x/style-asset'
import { transformUVue } from '@/uni-app-x/transform'
import { createUniAppXHarmonyApplyExpander } from '@/uni-app-x/vite/harmony-apply'
import { createUniAppXWebLocalStyleBridge } from '@/uni-app-x/vite/web-local-style'

const generatedCss = '.probe { background-color: #ff7a00; border-radius: 9999px; }'
const apply = '.probe { @apply bg-[#ff7a00] rounded-full; }'

describe('issue 1164 Harmony scoped SCSS comments', () => {
  it('does not clear the SFC bridge when transforming a raw style subrequest', () => {
    const remember = vi.fn()
    transformUVue('// comment\n.author { padding: 12px; }', '/project/components/Probe.uvue?vue&type=style&lang.scss', createJsHandler({}), new Set(), {
      enableComponentLocalStyle: true,
      onWebLocalStyleRules: remember,
    })
    expect(remember).not.toHaveBeenCalled()
  })

  it.each(['', '//\n', '/* comment */'])('gives Web aliases a style carrier when the author block only contains %j', (style) => {
    const remember = vi.fn()
    const source = `<template><view class="bg-[#ff7a00]" /></template><style lang="scss" scoped>${style}</style>`
    const output = transformUVue(source, '/project/components/Probe.uvue', createJsHandler({}), new Set(['bg-[#ff7a00]']), {
      enableComponentLocalStyle: true,
      onWebLocalStyleRules: remember,
    })!.code!
    expect(output).toContain('@apply bg-[#ff7a00];')
    expect(output).toMatch(/:global\(\.wtu-/)
    expect(remember).toHaveBeenCalledWith(expect.stringContaining('@apply bg-[#ff7a00];'))
  })

  it.each(['', '<style scoped>//\n</style>', '<style lang="scss">.author { color: red; }</style>'])('replays generated Web carriers across HMR with %j', (authorStyle) => {
    const bridge = createUniAppXWebLocalStyleBridge(() => true)
    const id = '/project/components/Probe.uvue'
    const styleId = `${id}?vue&type=style&index=1&scoped=probe&lang.css`
    const options = {
      enableComponentLocalStyle: true,
      onWebLocalStyleRules: (rules: string) => bridge.remember(id, rules),
    }
    for (const utility of ['h-8', 'h-12', 'h-8']) {
      const source = `<template><view class="${utility}" /></template>${authorStyle}`
      const output = transformUVue(source, id, createJsHandler({}), new Set([utility]), options)!.code!
      expect(output).toContain(`@apply ${utility};`)
      transformUVue('.author { color: red; }', styleId, createJsHandler({}), new Set(), options)
      const replayed = bridge.appendToStyle('', styleId)
      expect(replayed).toContain(`@apply ${utility};`)
      expect(replayed).not.toContain(`@apply ${utility === 'h-8' ? 'h-12' : 'h-8'};`)
    }
    transformUVue(`<template><view /></template>${authorStyle}`, id, createJsHandler({}), new Set(), options)
    expect(bridge.appendToStyle('', styleId)).toBe('')
  })

  it('connects template aliases to native declarations through the real Tailwind compiler', async () => {
    const classes = ['bg-[#ff7a00]', 'text-[#ffffff]', 'h-[100px]', 'w-[48px]', 'rounded-full']
    const source = `<template><view class="${classes.join(' ')}" /></template><style lang="scss" scoped>//\n</style>`
    const transformed = transformUVue(source, '/project/components/Probe.uvue', createJsHandler({}), new Set(classes), {
      native: true,
      enableComponentLocalStyle: true,
    })!.code!
    const styleHandler = createStyleHandler({ majorVersion: 4, appType: 'uni-app-x', uniAppX: true, uniAppXCssTarget: 'uvue' })
    const expander = createUniAppXHarmonyApplyExpander({
      getResolvedConfig: () => undefined,
      isHarmonyBuildTarget: () => true,
      generateCss: async (_id, css) => (await compile(css)).build([]),
      transformCss: async css => (await styleHandler(css)).css,
    })
    const output = await expander.expandStyles(transformed, '/project/components/Probe.uvue', {})
    expect(output).not.toContain('@apply')
    const style = output.match(/<style[^>]*>([\s\S]*?)<\/style>/)![1]
    const css = postcss.parse(compileString(style).css)
    const selectors = new Set<string>()
    const declarations: Record<string, string> = {}
    css.walkRules(rule => { selectors.add(rule.selector) })
    css.walkDecls(decl => { declarations[decl.prop] = decl.value })
    const aliases = output.match(/class="([^"]+)"/)![1].split(/\s+/)
    expect(aliases.length).toBe(classes.length)
    for (const alias of aliases) {
      expect(selectors).toContain(`.${alias}`)
    }
    expect(declarations).toMatchObject({ 'background-color': '#ff7a00', color: '#ffffff', height: '100px', width: '48px' })
    expect(declarations['border-radius']).toBeDefined()
  })

  it.each(['', '//\n', '// comment\n// second\n', '// comment\r\n', '/* comment */\n'])('expands local styles after %j', (prefix) => {
    const source = `<style lang="scss" scoped>${prefix}${apply}</style>`
    const result = expandUniAppXHarmonyApplyStyles(source, generatedCss)
    expect(result).not.toContain('@apply')
    const css = compileString(result.slice(result.indexOf('>') + 1, result.lastIndexOf('</style>'))).css
    const rule = postcss.parse(css).nodes.find(node => node.type === 'rule')
    expect(rule).toMatchObject({ selector: '.probe' })
    expect(css).toContain('background-color: #ff7a00')
    expect(css).toContain('border-radius: 9999px')
  })

  it('normalizes comments for generator input without changing URL or string values', () => {
    const source = `// @apply invalid-candidate;
${apply}
.author { background-image: url("https://example.test/a//b.png"); content: "// literal"; }
// end`
    const sources = collectUniAppXHarmonyApplyStyleSourcesFromSource(`<style lang="scss" scoped>${source}</style>`)
    expect([...collectUniAppXHarmonyApplyUtilitiesFromSources(sources)]).toEqual(['bg-[#ff7a00]', 'rounded-full'])
    const generated = createUniAppXHarmonyApplyGeneratorSource(sources, [])
    const root = postcss.parse(generated)
    const selectors: string[] = []
    root.walkRules(rule => { selectors.push(rule.selector) })
    expect(selectors).toEqual(['.probe', '.author'])
    expect(generated).toContain('https://example.test/a//b.png')
    expect(generated).toContain('"// literal"')
  })

  it('finds local style values after a line comment in cached SFC sources', () => {
    const styles = createStyleValueFromApplySources(
      [`<style lang="scss" scoped>//\n${apply}</style>`],
      { 'bg-[#ff7a00]': { '': { backgroundColor: '#ff7a00' } }, 'rounded-full': { '': { borderRadius: '9999px' } } },
    )
    expect(styles?.probe).toEqual({ '': { backgroundColor: '#ff7a00', borderRadius: '9999px' } })
  })

  it.each([
    [normalizePath(path.resolve('/project/views/probe.uvue')), normalizePath(path.resolve('/project/main.css'))],
    ['C:\\project\\views\\probe.uvue', 'C:/project/main.css'],
    ['C:/project/views/probe.uvue?vue&type=style&lang.scss', 'C:/project/main.css'],
    [normalizePath(path.resolve('/probe.uvue')), normalizePath(path.resolve('/main.css'))],
  ])('resolves references after comments for %s', (id, expected) => {
    const [source] = collectUniAppXHarmonyApplyStyleSourcesFromSource(`<style lang="scss">//\n@reference "../main.css";\n${apply}</style>`, id)
    expect(source).toContain(`@reference "${expected}";`)
  })

  it('preserves unrelated blocks and author Sass through replacement', () => {
    const untouched = '<style>.untouched { color: red; }</style>'
    const source = `${untouched}<style lang="scss" scoped>$size: 12px;\n// comment\n${apply}\n.author { padding: $size; } // trailing</style>`
    const output = expandUniAppXHarmonyApplyStyles(source, generatedCss)
    expect(output).toContain(untouched)
    expect(output).toContain('$size: 12px;')
    expect(output).toContain('padding: $size;')
    expect(output).not.toContain('@apply')
    expect(expandUniAppXHarmonyApplyStyles(output, generatedCss)).toBe(output)
  })
})
