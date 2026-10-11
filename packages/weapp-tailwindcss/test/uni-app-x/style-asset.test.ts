import path from 'node:path'
import { normalizePath } from 'vite'
import type { OutputAsset, OutputChunk } from 'rollup'
import { describe, expect, it } from 'vitest'
import {
  collectUniAppXHarmonyApplyStyleSources,
  collectUniAppXHarmonyApplyUtilities,
  createUniAppXBundleAssetSourceGetter,
  createUniAppXHarmonyApplyGeneratorSource,
  expandUniAppXHarmonyApplyStyles,
  injectUniAppXHarmonyBundleStyles,
  injectUniAppXHarmonyGlobalStyles,
  injectUniAppXStylePlaceholder,
  isUniAppXHarmonyBundle,
} from '@/uni-app-x/style-asset'
import {
  collectChunkMapSourcesContent,
  collectUniAppXHarmonyApplyStyleSourcesFromSource,
  collectUniAppXHarmonyApplyUtilitiesFromSources,
  createMergedStyleValue,
  createMergedStyleValues,
  createStyleValueFromApplySources,
  createUtsStyleArrayFromAppStyles,
  cssSourceToStyleValue,
  mergeStyleValues,
  parseSourceMapSourcesContent,
  parseStyleExport,
  parseStyleObject,
  styleExportToUtsMap,
} from '@/uni-app-x/style-asset/style-value'

function asset(fileName: string, source: string): OutputAsset {
  return {
    type: 'asset',
    fileName,
    names: [],
    originalFileNames: [],
    source,
  }
}

function chunk(fileName: string, code: string, extra: Partial<OutputChunk> = {}): OutputChunk {
  return {
    type: 'chunk',
    fileName,
    code,
    name: fileName,
    isEntry: false,
    isDynamicEntry: false,
    facadeModuleId: null,
    moduleIds: [],
    imports: [],
    dynamicImports: [],
    implicitlyLoadedBefore: [],
    importedBindings: {},
    referencedFiles: [],
    exports: [],
    modules: {},
    preliminaryFileName: fileName,
    sourcemapFileName: null,
    ...extra,
  }
}

const componentCode = [
  'const _style_0 = {"base":{"":{color:"red"}}};',
  'const _sfc_main = { class: "app page green" };',
  'export default _export_sfc(_sfc_main, [["__file","pages/index.uvue"]]);',
].join('\n')

describe('uni-app-x style asset helpers', () => {
  it('detects harmony bundles and reads bundle sources by suffix', () => {
    const bundle = {
      'assets/App.js': chunk('assets/App.js', 'app-code'),
      'import/app-service.ets': asset('import/app-service.ets', 'marker'),
    }
    const getSource = createUniAppXBundleAssetSourceGetter(bundle)

    expect(isUniAppXHarmonyBundle(bundle)).toBe(true)
    expect(isUniAppXHarmonyBundle({})).toBe(false)
    expect(getSource('App.js')).toBe('app-code')
    expect(getSource('missing.js')).toBeUndefined()
  })

  it('creates generator source from apply style sources', () => {
    expect(createUniAppXHarmonyApplyGeneratorSource(['.a{@apply flex}', '.b{@apply block}'], ['flex'])).toBe('.a{@apply flex}\n.b{@apply block}')
    expect(createUniAppXHarmonyApplyGeneratorSource([
      '@reference "../../main.css"; .a{@apply flex}',
      '@reference "/project/main.css"; .b{@apply block}',
    ], ['flex', 'block'])).toBe('.a{@apply flex}\n@reference "/project/main.css"; .b{@apply block}')
  })

  it('expands harmony apply rules with generated platform-safe declarations', () => {
    const source = [
      '<template><view class="rounded" /></template>',
      '<style scoped>',
      '@reference "../../main.css";',
      '.rounded { @apply rounded-full text-xs; }',
      '.plain { color: red; }',
      '</style>',
    ].join('\n')

    const next = expandUniAppXHarmonyApplyStyles(source, [
      '.rounded { border-top-left-radius: 9999px; border-bottom-left-radius: 9999px; font-size: 24rpx; }',
    ].join('\n'))

    expect(next).toContain('border-top-left-radius: 9999px')
    expect(next).toContain('border-bottom-left-radius: 9999px')
    expect(next).toContain('font-size: 24rpx')
    expect(next).toContain('.plain { color: red; }')
    expect(next).not.toContain('@apply')
    expect(next).not.toContain('@reference')
  })

  it('resolves apply references against the original uvue module', () => {
    expect(collectUniAppXHarmonyApplyStyleSourcesFromSource(`
<style scoped>
@reference "../../main.css";
.card { @apply px-4; }
</style>
`, normalizePath(path.resolve('/project/pages/index/index.uvue')))).toEqual([
      `@reference "${normalizePath(path.resolve('/project/main.css'))}";\n.card { @apply px-4; }`,
    ])
  })

  it('injects style placeholders from app styles or fallback css assets', () => {
    const appCode = 'const GenAppStyles = [];\nAppStyles = [{"base":{"":{color:"red"}}}]'
    expect(injectUniAppXStylePlaceholder('pages/index.uvue.ts', 'const GenPageStyles = []', file => file === 'App.uvue.ts' ? appCode : undefined)).toContain('GenPageStyles')
    expect(injectUniAppXStylePlaceholder('pages/index.js', 'const GenPageStyles = []')).toBe('const GenPageStyles = []')
    expect(injectUniAppXStylePlaceholder('pages/index.uvue.ts', 'const GenPageStyles = []', file => file === 'pages/index.uvue' ? '.text{color:red}' : undefined)).toContain('color')
    expect(injectUniAppXStylePlaceholder('pages/index.uvue.ts', 'const GenPageStyles = []', () => undefined)).toBe('const GenPageStyles = []')
  })

  it('combines used App styles with processed CSS for native style placeholders', () => {
    const code = '_cE("view", _uM({ class: "template text-xs text-white rounded-full" }))\n/*GenPageStyles*/'
    const appCode = 'const GenAppStyles = [_uM([["template", _pS(_uM([["display", "flex"]]))]])]'
    const next = injectUniAppXStylePlaceholder(
      'pages/index.uvue.ts',
      code,
      file => file === 'App.uvue.ts' ? appCode : undefined,
      ['.text-xs{font-size:24rpx}.text-white{color:#fff}.rounded-full{border-radius:9999px}'],
    )

    expect(next).toContain('["template", _pS(_uM([["display", "flex"]]))]')
    expect(next).toContain('["text-xs", _pS(_uM([["fontSize", "24rpx"]]))]')
    expect(next).toContain('["text-white", _pS(_uM([["color", "#fff"]]))]')
    expect(next).toContain('["rounded-full", _pS(_uM([["borderRadius", 9999]]))]')
  })

  it('injects global styles into chunks and preserves unsupported files', () => {
    expect(injectUniAppXHarmonyGlobalStyles('App.js', componentCode, () => '.root{color:red}')).toBe(componentCode)
    expect(injectUniAppXHarmonyGlobalStyles('components/button.js', componentCode, () => '.root{color:red}', { excludeComponents: true })).toBe(componentCode)

    const next = injectUniAppXHarmonyGlobalStyles('pages/index.js', [
      'const _sfc_main = { class: "green" };',
      'export default _export_sfc(_sfc_main, [["__file","pages/index.uvue"]]);',
    ].join('\n'), file => file === 'App.js' ? 'const _style_0 = {"base":{"":{color:"blue"}}};' : undefined, {
      cssSources: ['.green{color:green}'],
    })

    expect(next).toContain('const _style_wt =')
    expect(next).toContain('["styles", [_style_wt]]')
    expect(next).toContain('green')
  })

  it('excludes custom component directories using harmony source metadata', () => {
    const layoutCode = [
      'const _sfc_main = { class: "green" };',
      'export default _export_sfc(_sfc_main, [["__file", "layouts/default.uvue"]]);',
    ].join('\n')
    const matcher = (id: string) => id.startsWith('layouts/')

    expect(injectUniAppXHarmonyGlobalStyles(
      'assets/layouts/default.js',
      layoutCode,
      undefined,
      {
        componentMatcher: matcher,
        cssSources: ['.green{color:green}'],
        excludeComponents: true,
      },
    )).toBe(layoutCode)

    expect(injectUniAppXHarmonyGlobalStyles(
      'assets/views/default.js',
      layoutCode.replace('layouts/default.uvue', 'views/default.uvue'),
      undefined,
      {
        componentMatcher: matcher,
        cssSources: ['.green{color:green}'],
        excludeComponents: true,
      },
    )).toContain('const _style_wt =')
  })

  it('inserts generated style declarations at a statement boundary and remains idempotent', () => {
    const code = 'const cls = "green"; const page = /* @__PURE__ */ _export_sfc(_sfc_main, [["__file","pages/index.uvue"]]);'
    const next = injectUniAppXHarmonyGlobalStyles('pages/index.js', code, undefined, {
      cssSources: ['.green{color:green}'],
    })

    expect(next).toMatch(/^const _style_wt = .*;\nconst cls = "green"; const page = \/\* @__PURE__ \*\//)
    expect(next.match(/const _style_wt\s*=/g)).toHaveLength(1)
    expect(next.match(/\["styles", \[_style_wt\]\]/g)).toHaveLength(1)
    expect(injectUniAppXHarmonyGlobalStyles('pages/index.js', next, undefined, {
      cssSources: ['.green{color:green}'],
    })).toBe(next)

    const existingStyle = 'let _style_wt = {"green":{"":{"color":"green"}}};const page = _export_sfc(_sfc_main, [["styles", [_style_wt]], ["__file","pages/index.uvue"]]);'
    expect(injectUniAppXHarmonyGlobalStyles('pages/index.js', existingStyle, undefined, {
      cssSources: ['.green{color:green}'],
    })).toBe(existingStyle)

    const existingDeclaration = 'var _style_wt = {"green":{"":{"color":"green"}}};const page = _export_sfc(_sfc_main, [["__file","pages/index.uvue"]]);'
    const withExistingDeclaration = injectUniAppXHarmonyGlobalStyles('pages/index.js', existingDeclaration, undefined, {
      cssSources: ['.green{color:green}'],
    })
    expect(withExistingDeclaration).toContain('var _style_wt = {"green":{"":{"color":"green"}}};')
    expect(withExistingDeclaration).toContain('[["styles", [_style_wt]], ["__file"')
    expect(withExistingDeclaration.match(/(?:const|let|var) _style_wt\s*=/g)).toHaveLength(1)
  })

  it('reconciles generated styles across every parseable harmony style object', () => {
    const code = [
      'const _style_0 = {"local":{"":{"color":"red"}},"shared":{"":{"borderRadius":9999}}};',
      'const _style_1 = {"shared":{"":{"borderRadius":"calc(infinity * 1px)"}},"untouched":{"":{"width":10}}};',
      'function render(){return createElementVNode("view", { class: "shared added" })}',
      'const index = _export_sfc(_sfc_main, [["render", render], ["styles", [_style_0, _style_1]], ["__file", "pages/index/index.uvue"]]);',
    ].join('\n')

    const next = injectUniAppXHarmonyGlobalStyles('pages/index/index.js', code, undefined, {
      cssSources: ['.shared{border-radius:9999px}.added{color:#fff}'],
    })

    expect(next).toContain('const _style_0 = {"local":{"":{"color":"red"}},"shared":{"":{"borderRadius":9999}},"added":{"":{"color":"#fff"}}};')
    expect(next).toContain('const _style_1 = {"shared":{"":{"borderRadius":9999}},"untouched":{"":{"width":10}}};')
    expect(next).toContain('["styles", [_style_0, _style_1]]')
    expect(next).not.toContain('calc(infinity')
    expect(next).not.toContain('const _style_wt')
  })

  it('appends generated styles when existing harmony style objects cannot be parsed', () => {
    const code = [
      'const _style_0 = {"icon":{"":{"maskImage":`url(${icon})`}}};',
      'function render(){return createElementVNode("view", { class: "added" })}',
      'const index = _export_sfc(_sfc_main, [["render", render], ["styles", [_style_0]], ["__file", "pages/index/index.uvue"]]);',
    ].join('\n')

    const next = injectUniAppXHarmonyGlobalStyles('pages/index/index.js', code, undefined, {
      cssSources: ['.added{color:#fff}'],
    })

    expect(next).toContain('const _style_0 = {"icon":{"":{"maskImage":`url(${icon})`}}};')
    expect(next).toContain('const _style_wt = {"added":{"":{"color":"#fff"}}};')
    expect(next).toContain('["styles", [_style_0, _style_wt]]')
  })

  it('collects apply sources from uvue assets, chunks, and sourcemaps', () => {
    const map = JSON.stringify({
      version: 3,
      sourcesContent: ['.from-map{@apply flex}'],
    })
    const bundle = {
      'pages/index.uvue': asset('pages/index.uvue', '.from-asset{@apply block}'),
      'pages/index.js': chunk('pages/index.js', '', {
        map: {
          version: 3,
          mappings: '',
          sources: [],
          names: [],
          sourcesContent: ['.from-chunk{@apply grid}'],
        } as any,
      }),
      'pages/index.js.map': asset('pages/index.js.map', map),
      'App.js': chunk('App.js', '.ignored{@apply hidden}'),
    }

    expect(collectUniAppXHarmonyApplyStyleSources(bundle)).toEqual(expect.arrayContaining([
      '.from-asset{@apply block}',
      '.from-chunk{@apply grid}',
      '.from-map{@apply flex}',
    ]))
    expect([...collectUniAppXHarmonyApplyUtilities(bundle)]).toEqual(expect.arrayContaining(['grid', 'flex']))
  })

  it('injects bundle styles from imported css metadata', () => {
    const bundle = {
      'assets/App.js': chunk('assets/App.js', 'const _style_0 = {"base":{"":{color:"blue"}}};', {
        viteMetadata: { importedCss: new Set(['app.css']) },
      } as any),
      'pages/index.js': chunk('pages/index.js', [
        'const _sfc_main = { class: "app page" };',
        'export default _export_sfc(_sfc_main, [["__file","pages/index.uvue"]]);',
      ].join('\n'), {
        viteMetadata: { importedCss: new Set(['page.css']) },
      } as any),
      'app.css': asset('app.css', '.app{color:blue}'),
      'page.css': asset('page.css', '.page{color:green}'),
    }

    expect(injectUniAppXHarmonyBundleStyles(bundle)).toBe(true)
    expect(bundle['pages/index.js'].code).toContain('page')
    expect(bundle['pages/index.js'].code).toContain('app')
  })

  it('parses style values and handles empty or malformed sources conservatively', () => {
    expect(parseStyleExport('')).toBeUndefined()
    expect(parseStyleExport('export default {"btn":{"":{"font-size":"12px","color":"rgb(1, 2, 3)"}}}')).toEqual({
      btn: { '': { 'font-size': '12px', color: 'rgb(1, 2, 3)' } },
    })
    expect(parseStyleExport('export default {')).toBeUndefined()
    expect(parseStyleObject('{')).toBeUndefined()
    expect(parseSourceMapSourcesContent('{')).toEqual([])
    expect(parseSourceMapSourcesContent(JSON.stringify({ sourcesContent: ['.a{}', 1] }))).toEqual(['.a{}'])
    expect(collectChunkMapSourcesContent(chunk('empty.js', '', { map: null }))).toEqual([])
    expect(collectChunkMapSourcesContent(chunk('mapped.js', '', {
      map: { sourcesContent: ['.a{}', false] } as any,
    }))).toEqual(['.a{}'])

    expect(styleExportToUtsMap({ empty: { '': {} } })).toBe('[]')
    expect(styleExportToUtsMap({
      btn: { '': { 'font-size': '12px', color: 'rgb(1, 2, 3)' } },
    })).toContain('"fontSize", 12')
    expect(styleExportToUtsMap({
      'leading-_b26px_B': { '': { '--tw-leading': '26px', 'line-height': '26px' } },
    })).toBe('[_uM([["leading-_b26px_B", _pS(_uM([["-TwLeading", 26], ["lineHeight", "26px"]]))]])]')
    expect(styleExportToUtsMap({
      unitless: { '': { lineHeight: 1.5, width: 26 } },
    })).toContain('["lineHeight", "1.5"], ["width", 26]')
  })

  it('creates and merges style values from css, app styles, and apply sources', () => {
    const utilityStyles = cssSourceToStyleValue([
      '.flex{display:flex}',
      '.w-\\[12px\\]{width:12px}',
      '.leading-_b26px_B{--tw-leading:26px;line-height:26px}',
      '.leading-_b1d5_B{--tw-leading:1.5;line-height:1.5}',
      '.leading-_b52rpx_B{--tw-leading:52rpx;line-height:52rpx}',
      '.text-xs{font-size:24rpx;line-height:1.33333}',
    ].join(''))!
    expect(cssSourceToStyleValue('.broken{')).toBeUndefined()
    expect(utilityStyles.flex['']).toMatchObject({ display: 'flex' })
    expect(utilityStyles['w-[12px]']['']).toMatchObject({ width: 12 })
    expect(utilityStyles['leading-_b26px_B']['']).toMatchObject({
      '-TwLeading': 26,
      lineHeight: '26px',
    })
    expect(utilityStyles['leading-_b1d5_B'][''].lineHeight).toBe('1.5')
    expect(utilityStyles['leading-_b52rpx_B'][''].lineHeight).toBe('52rpx')
    expect(utilityStyles['text-xs']['']).toMatchObject({ fontSize: '24rpx', lineHeight: '1.33333' })
    expect(mergeStyleValues(undefined, { local: { '': { color: 'red' } } })?.local[''].color).toBe('red')

    const appSource = 'const GenAppStyles = [_uM([["app", _pS(_uM([["color", "red"]]))], ["unused", _pS(_uM([["color", "blue"]]))]])]'
    expect(createUtsStyleArrayFromAppStyles('const cls = "app"', appSource)).toContain('"app"')
    expect(createUtsStyleArrayFromAppStyles('const cls = "none"', appSource)).toBeUndefined()
    expect(createUtsStyleArrayFromAppStyles('const cls = "app"')).toBeUndefined()

    const applied = createStyleValueFromApplySources([
      '<template></template><style>.card{@apply flex w-[12px]}</style>',
      '.broken{',
      '.plain{color:red}',
    ], utilityStyles)
    expect(applied?.card['']).toMatchObject({ display: 'flex', width: 12 })
    expect(createStyleValueFromApplySources(['.card{@apply flex}'], undefined)).toBeUndefined()

    expect(collectUniAppXHarmonyApplyStyleSourcesFromSource('<style>.a{@apply flex}</style><style>.b{color:red}</style>')).toEqual(['.a{@apply flex}'])
    expect([...collectUniAppXHarmonyApplyUtilitiesFromSources(['.a{@apply flex block}', '.broken{'])]).toEqual(['flex', 'block'])
    expect(createMergedStyleValue('const cls = "app"', undefined, { app: { '': { color: 'red' } } })?.app[''].color).toBe('red')
    expect(createMergedStyleValue('const cls = "app"', { app: { '': { color: 'blue' } } }, { app: { '': { color: 'red' } } })).toEqual({
      app: { '': { color: 'red' } },
    })
    expect(createMergedStyleValue('const cls = "leading-_b26px_B"', {
      'leading-_b26px_B': { '': { color: 'blue' } },
    }, {
      'leading-_b26px_B': { '': { lineHeight: '26px' } },
    })).toEqual({
      'leading-_b26px_B': { '': { color: 'blue', lineHeight: '26px' } },
    })
    expect(createMergedStyleValue('const cls = "app"', {
      app: { '': { color: 'blue', padding: 12 }, dark: { color: 'white' } },
    }, {
      app: { '': { color: 'red', margin: 8 }, dark: { backgroundColor: 'black' } },
    })).toEqual({
      app: { '': { color: 'red', padding: 12, margin: 8 }, dark: { color: 'white', backgroundColor: 'black' } },
    })
    expect(createMergedStyleValue('const cls = "none"', undefined, { app: { '': { color: 'red' } } })).toBeUndefined()
    expect(createMergedStyleValues('const cls = "app added"', [
      { app: { '': { color: 'blue' } } },
      { app: { '': { color: 'green' } }, untouched: { '': { width: 10 } } },
    ], {
      app: { '': { color: 'red' } },
      added: { '': { height: 20 } },
    })).toEqual([
      { app: { '': { color: 'red' } }, added: { '': { height: 20 } } },
      { app: { '': { color: 'red' } }, untouched: { '': { width: 10 } } },
    ])
    expect(createMergedStyleValues('const cls = "shared"', [
      { shared: { '': { color: 'blue', padding: 12 } } },
      { shared: { '': { borderRadius: 4 } } },
    ], {
      shared: { '': { color: 'red', margin: 8 } },
    })).toEqual([
      { shared: { '': { color: 'red', padding: 12, margin: 8 } } },
      { shared: { '': { borderRadius: 4, color: 'red', margin: 8 } } },
    ])
  })
})
