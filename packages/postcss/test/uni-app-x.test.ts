import fs from 'fs-extra'
import path from 'pathe'
import { compileString } from 'sass'
import { normalizeUniAppXImportantApplyForSass, restoreUniAppXImportantApplyMarker } from '@/compat/uni-app-x'
import { applyUniAppXUvueCompatibility } from '@/compat/uni-app-x-uvue'
import { createStyleHandler, postcss } from '@/index'

const INVALID_UNI_APP_X_BASE_SELECTOR_RE = /(^|,)\s*(?:\*|view|text|::before|::after|:before|:after|::backdrop)\s*(?=,|\{)/m

describe('uni-app-x', () => {
  it('normalizes important utilities in author SCSS before Sass, including inline comments', () => {
    const source = [
      '$size: 3px;',
      '.author {',
      '  // 用户样式中的行内注释不能使 important 处理失效',
      '  width: $size;',
      '  @apply mt-24!;',
      '  &:hover { @apply !p-10; }',
      '}',
    ].join('\n')
    const normalized = normalizeUniAppXImportantApplyForSass(source)
    expect(normalized).toContain('@apply mt-24__weapp_tw_important__;')
    expect(normalized).toContain('@apply p-10__weapp_tw_important__;')
    expect(normalized).toContain('// 用户样式中的行内注释')
    expect(normalizeUniAppXImportantApplyForSass(normalized)).toBe(normalized)
    const css = compileString(normalized).css
    expect(css).toContain('width: 3px;')
    expect(restoreUniAppXImportantApplyMarker(css)).toContain('@apply mt-24!;')
  })

  it('round-trips important apply utilities across Sass and PostCSS', () => {
    const source = '.probe { @apply !mt-6 mt-6! text-sm; }'
    const sassSafe = normalizeUniAppXImportantApplyForSass(source)

    expect(sassSafe).toContain('@apply mt-6__weapp_tw_important__ mt-6__weapp_tw_important__ text-sm;')
    expect(restoreUniAppXImportantApplyMarker(sassSafe)).toContain('@apply mt-6! mt-6! text-sm;')
  })

  it('accepts Web local important apply syntax', async () => {
    const styleHandler = createStyleHandler({
      appType: 'uni-app-x',
      uniAppX: true,
      majorVersion: 4,
    })
    const options = {
      appType: 'uni-app-x' as const,
      uniAppX: true,
    }
    const result = await styleHandler('.wtu-important { @apply mt-6!; }', options)

    expect(result.css).toContain('@apply mt-6!;')
    await expect(
      styleHandler(".wtu-important { @apply mt-6#{'!'}; }", options),
    ).rejects.toThrow('Unknown word')
  })

  it('css', async () => {
    const styleHandler = createStyleHandler({
      // uniAppX: true,
    })
    const { css } = await styleHandler(
      await fs.readFile(
        path.resolve(__dirname, './fixtures/css/uni-app-x.css'),
        'utf8',
      ),
      {
        isMainChunk: true,
      },
    )
    expect(css).toMatchSnapshot('css')
  })

  it('app.uvue.css', async () => {
    const styleHandler = createStyleHandler({
      uniAppX: true,
    })
    const { css } = await styleHandler(
      await fs.readFile(
        path.resolve(__dirname, './fixtures/css/App.uvue.css'),
        'utf8',
      ),
      {
        isMainChunk: true,
      },
    )
    expect(css).toContain('.mt-_b32_d43rpx_B')
    expect(css).toContain('.bg-_b_h322323_B')
    expect(css).not.toMatch(INVALID_UNI_APP_X_BASE_SELECTOR_RE)
    expect(css).not.toContain('--tw-border-spacing-x: 0;')
  })

  it('removes unsupported carrier selectors and pushes required defaults to utility classes', async () => {
    const styleHandler = createStyleHandler({
      uniAppX: true,
      uniAppXCssTarget: 'uvue',
    })
    const { css } = await styleHandler(
      `view,text,:before,:after {
        --tw-translate-x: 0;
        --tw-translate-y: 0;
        --tw-rotate: 0;
        --tw-skew-x: 0;
        --tw-skew-y: 0;
        --tw-scale-x: 1;
        --tw-scale-y: 1;
        --tw-ring-offset-shadow: 0 0 #0000;
        --tw-ring-shadow: 0 0 #0000;
        --tw-shadow: 0 0 #0000;
      }
      .transform {
        transform: translate(var(--tw-translate-x), var(--tw-translate-y)) rotate(var(--tw-rotate)) skewX(var(--tw-skew-x)) skewY(var(--tw-skew-y)) scaleX(var(--tw-scale-x)) scaleY(var(--tw-scale-y));
      }
      .shadow {
        box-shadow: var(--tw-ring-offset-shadow), var(--tw-ring-shadow), var(--tw-shadow);
      }
      .bg-plain {
        color: rgb(0 0 0 / var(--tw-text-opacity, 1));
      }
      .border-\\[\\#999\\] {
        border-color: rgb(153 153 153 / 1);
      }`,
      {
        isMainChunk: true,
      },
    )

    expect(css).not.toMatch(INVALID_UNI_APP_X_BASE_SELECTOR_RE)
    expect(css).toContain('.transform {')
    expect(css).toContain('--tw-translate-x: 0;')
    expect(css).toContain('--tw-scale-y: 1;')
    expect(css).toContain('transform: translate(var(--tw-translate-x) var(--tw-translate-y))')
    expect(css).not.toContain('translate(var(--tw-translate-x), var(--tw-translate-y))')
    expect(css).toContain('.shadow {')
    expect(css).toContain('--tw-ring-offset-shadow: 0 0 rgba(0,0,0,0);')
    expect(css).toContain('--tw-shadow: 0 0 rgba(0,0,0,0);')
    expect(css).not.toContain('--tw-text-opacity:')
    expect(css).toContain('.border-_b_h999_B')
  })

  it('normalizes translate argument separators for uvue without changing nested commas', async () => {
    const source = '.issue-823{-webkit-transform:translate(var(--x, 0), var(--y, 0));transform:translate(var(--x, 0), var(--y, 0)) rotate(45deg)}'
    const result = await postcss().process(source, {
      from: '/src/pages/issue-823.uvue',
    })

    const filtered = applyUniAppXUvueCompatibility(result, {
      uniAppX: true,
      uniAppXCssTarget: 'uvue',
      uniAppXUnsupported: 'warn',
    })

    expect(filtered.css).toBe(
      '.issue-823{-webkit-transform:translate(var(--x, 0) var(--y, 0));transform:translate(var(--x, 0) var(--y, 0)) rotate(45deg)}',
    )
    expect(filtered.warnings()).toEqual([])
  })

  it('removes empty standard declarations before the Native style compiler', async () => {
    const result = await postcss().process([
      '.transform{transform: }',
      '.defaults{--tw-translate-x: }',
      '.keep{color:red}',
    ].join(''), {
      from: '/src/App.uvue',
    })

    const filtered = applyUniAppXUvueCompatibility(result, {
      uniAppX: true,
      uniAppXCssTarget: 'uvue',
      uniAppXUnsupported: 'warn',
    })

    expect(filtered.css).not.toContain('.transform')
    expect(filtered.css).toContain('.defaults{--tw-translate-x: }')
    expect(filtered.css).toContain('.keep{color:red}')
    expect(filtered.warnings()).toEqual([])
  })

  it('keeps translate argument separators for non-uvue targets', async () => {
    const source = '.issue-823{transform:translate(var(--x), var(--y))}'
    const result = await postcss().process(source, {
      from: '/src/pages/issue-823.vue',
    })

    const filtered = applyUniAppXUvueCompatibility(result, {
      uniAppX: true,
    })

    expect(filtered.css).toBe(source)
  })

  it('inlines adapted Tailwind theme tokens before removing the uvue root carrier', async () => {
    const styleHandler = createStyleHandler({
      appType: 'uni-app-x',
      uniAppX: true,
      uniAppXCssTarget: 'uvue',
      uniAppXUnsupported: 'warn',
      majorVersion: 4,
    })
    const result = await styleHandler(
      `page, .tw-root, wx-root-portal-content, :host {
        --color-white: #fff;
        --text-xs: 0.75rem;
        --text-xs--line-height: calc(1 / 0.75);
      }
      .text-white {
        color: var(--color-white);
      }
      .text-xs {
        font-size: var(--text-xs);
        line-height: var(--tw-leading, var(--text-xs--line-height));
      }
      .rounded-full {
        border-radius: calc(infinity * 1px);
      }`,
      {
        isMainChunk: false,
        postcssOptions: {
          options: {
            from: '/src/components/Issue1002.uvue',
          },
        },
      },
    )

    expect(result.css).toMatch(/\.text-white\s*\{\s*color:\s*#fff/)
    expect(result.css).toMatch(/\.text-xs\s*\{[^}]*font-size:\s*0\.75rem/)
    expect(result.css).toMatch(/\.text-xs\s*\{[^}]*line-height:\s*1\.33333/)
    expect(result.css).toMatch(/\.rounded-full\s*\{\s*border-radius:\s*9999px/)
    expect(result.css).not.toContain('.tw-root')
    expect(result.css).not.toContain('calc(infinity')
    expect(result.css).not.toContain('@property')
    expect(result.css).not.toContain('var(--color-white)')
    expect(result.css).not.toContain('var(--text-xs)')
    expect(result.warnings()).toEqual([])
  })

  it('keeps unresolved user variables while consuming known uvue theme aliases', async () => {
    const result = await postcss().process([
      ':root,:host{--color-brand:var(--runtime-brand, #0957DE)}',
      '.text-brand{color:var(--color-brand)}',
      '.issue-1002{font-size:var(--text-xs, 0.75rem);color:var(--color-white, #fff)}',
    ].join('\n'), {
      from: '/src/App.uvue',
    })

    const filtered = applyUniAppXUvueCompatibility(result, {
      uniAppX: true,
      uniAppXCssTarget: 'uvue',
      uniAppXUnsupported: 'warn',
    })

    expect(filtered.css).toBe([
      '.text-brand{color:#0957DE;color:var(--runtime-brand)}',
      '.issue-1002{font-size:0.75rem;color:#fff}',
    ].join('\n'))
    expect(filtered.warnings()).toEqual([])
  })

  it('splits protected author variable fallbacks after full uvue processing', async () => {
    const styleHandler = createStyleHandler({
      appType: 'uni-app-x',
      uniAppX: true,
      uniAppXCssTarget: 'uvue',
      uniAppXUnsupported: 'warn',
      majorVersion: 4,
      cssPresetEnv: {
        features: {
          'custom-properties': { preserve: false },
        },
      },
    })
    const result = await styleHandler(
      ':root,:host{--color-brand:var(--runtime-brand, #0957DE)}.text-brand{color:var(--color-brand)}',
      {
        isMainChunk: false,
        postcssOptions: {
          options: {
            from: '/src/App.uvue',
          },
        },
      },
    )

    expect(result.css).toContain('.text-brand{color:#0957DE;color:var(--runtime-brand)}')
    expect(result.css).not.toContain(':root')
    expect(result.warnings()).toEqual([])
  })

  it('splits author variable fallbacks for non-uvue uni-app x targets', async () => {
    const styleHandler = createStyleHandler({
      uniAppX: true,
      majorVersion: 4,
      cssPresetEnv: {
        features: {
          'custom-properties': { preserve: false },
        },
      },
    })
    const result = await styleHandler('.bg-primary{background-color:var(--theme-color, #0957DE)}')

    expect(result.css).toContain('background-color:#0957DE;background-color:var(--theme-color)')
  })

  it('preserves author variable fallbacks when uni-app x uses a WebView target', async () => {
    const styleHandler = createStyleHandler({
      appType: 'uni-app-x',
      uniAppX: false,
      majorVersion: 4,
      cssPresetEnv: {
        features: {
          'custom-properties': { preserve: false },
        },
      },
    })
    const result = await styleHandler('.bg-primary{background-color:var(--theme-color, #0957DE)}')

    expect(result.css).toContain('background-color:var(--theme-color, #0957DE)')
    expect(result.css).not.toContain('background-color:#0957DE;background-color:var(--theme-color)')
  })

  it('preserves local Web utility declarations and important priority', async () => {
    const styleHandler = createStyleHandler({
      appType: 'uni-app-x',
      uniAppX: false,
    })
    const result = await styleHandler([
      '.wtu-navbar{width:100rpx!important;height:100rpx;padding-left:30rpx;padding-right:30rpx;background-color:#0957de}',
      '.wtu-image{width:100rpx!important;height:100rpx;border-radius:10rpx}',
    ].join('\n'))

    expect(result.css).toContain('width:100rpx!important')
    expect(result.css).toContain('height:100rpx')
    expect(result.css).toContain('padding-left:30rpx')
    expect(result.css).toContain('padding-right:30rpx')
    expect(result.css).toContain('background-color:#0957de')
    expect(result.css).toContain('border-radius:10rpx')
  })

  it('filters unsupported uvue selectors and declarations with warnings', async () => {
    const styleHandler = createStyleHandler({
      uniAppX: true,
      uniAppXCssTarget: 'uvue',
      uniAppXUnsupported: 'warn',
    })
    const result = await styleHandler(
      `
      .space-y-4 > view + view {
        margin-top: 1rem;
      }
      .block {
        display: block;
      }
      .inline-flex {
        display: inline-flex;
      }
      .grid {
        display: grid;
      }
      .grid-cols-2 {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .gap-4 {
        gap: 1rem;
      }
      .gap-x-3 {
        column-gap: 0.75rem;
      }
      .gap-y-2 {
        row-gap: 0.5rem;
      }
      .min-h-screen {
        min-height: 100vh;
      }
      .flex {
        display: flex;
      }
      `,
      {
        isMainChunk: true,
        postcssOptions: {
          options: {
            from: '/src/App.uvue',
          },
        },
      },
    )

    expect(result.css).not.toContain('.space-y-4')
    expect(result.css).not.toContain('display: block')
    expect(result.css).not.toContain('display: inline-flex')
    expect(result.css).not.toContain('display: grid')
    expect(result.css).not.toContain('grid-template-columns')
    expect(result.css).not.toContain('gap: 1rem')
    expect(result.css).not.toContain('column-gap: 0.75rem')
    expect(result.css).not.toContain('row-gap: 0.5rem')
    expect(result.css).not.toContain('min-height: 100vh')
    expect(result.css).toContain('.flex')
    expect(result.css).toContain('display: flex')

    const warningTexts = result.warnings().map(item => item.text)
    expect(warningTexts).toEqual(expect.arrayContaining([
      expect.stringContaining('space-y-4'),
      expect.stringContaining('block'),
      expect.stringContaining('inline-flex'),
      expect.stringContaining('grid'),
      expect.stringContaining('grid-cols-2'),
      expect.stringContaining('gap-4'),
      expect.stringContaining('gap-x-3'),
      expect.stringContaining('gap-y-2'),
      expect.stringContaining('min-h-screen'),
    ]))
    expect(warningTexts.every(item => item.includes('/src/App.uvue'))).toBe(true)
  })

  it('throws for unsupported uvue utility when mode is error', async () => {
    const styleHandler = createStyleHandler({
      uniAppX: true,
      uniAppXCssTarget: 'uvue',
      uniAppXUnsupported: 'error',
    })

    await expect(styleHandler('.block { display: block; }', {
      isMainChunk: true,
      postcssOptions: {
        options: {
          from: '/src/pages/index.uvue',
        },
      },
    })).rejects.toThrow(/uni-app x uvue unsupported utility: block/)
  })

  it('keeps original behaviour for non-uvue uni-app-x targets', async () => {
    const styleHandler = createStyleHandler({
      uniAppX: true,
    })
    const result = await styleHandler(
      `
      .space-y-4 > :not([hidden]) ~ :not([hidden]) {
        margin-top: 1rem;
      }
      .block {
        display: block;
      }
      `,
      {
        isMainChunk: true,
      },
    )

    expect(result.css).toContain('.space-y-4>view+view')
    expect(result.css).toContain('display: block')
  })

  it('applies uvue compatibility directly with silent mode and malformed selector fallback', async () => {
    const result = await postcss().process([
      '.bad\\{selector{display:block}',
      '.flex{display:flex}',
      '@media screen{.gap{gap:1rem}}',
    ].join('\n'), {
      from: '/src/App.uvue',
    })

    const filtered = applyUniAppXUvueCompatibility(result, {
      uniAppX: true,
      uniAppXCssTarget: 'uvue',
      uniAppXUnsupported: 'silent',
    })

    expect(filtered.css).toContain('.flex{display:flex}')
    expect(filtered.css).not.toContain('display:block')
    expect(filtered.css).not.toContain('.gap')
    expect(filtered.css).not.toContain('@media')
    expect(filtered.warnings()).toEqual([])
  })

  it('dedupes repeated uvue warnings and reports selector text when no class is present', async () => {
    const result = await postcss().process([
      'view{color:red}',
      '.block{display:block}',
      '.block{display:block}',
    ].join('\n'), {
      from: '/src/App.uvue',
    })

    const filtered = applyUniAppXUvueCompatibility(result, {
      uniAppX: true,
      uniAppXCssTarget: 'uvue',
      uniAppXUnsupported: 'warn',
    })
    const warningTexts = filtered.warnings().map(item => item.text)

    expect(filtered.css).toBe('')
    expect(warningTexts.filter(text => text.includes('block'))).toHaveLength(1)
    expect(warningTexts).toEqual(expect.arrayContaining([
      expect.stringContaining('view'),
      expect.stringContaining('selector must be class-only'),
    ]))
  })

  it('uses default warning mode and source fallbacks for direct uvue compatibility', async () => {
    const result = await postcss().process('.block{display:block}', {
      from: undefined,
    })
    result.root.append(postcss.atRule({ name: 'media', params: 'screen' }))
    result.root.append(postcss.rule({ selector: '', nodes: [postcss.decl({ prop: 'display', value: 'block' })] }))

    const filtered = applyUniAppXUvueCompatibility(result, {
      uniAppX: true,
      uniAppXCssTarget: 'uvue',
    })
    const warningTexts = filtered.warnings().map(item => item.text)

    expect(filtered.css).toBe('')
    expect(warningTexts).toEqual(expect.arrayContaining([
      expect.stringContaining('unknown source'),
      expect.stringContaining('selector must be class-only'),
    ]))
  })

  it('preserves scoped author css while removing scoped tailwind carriers for uvue requests', async () => {
    const result = await postcss().process([
      '/*! tailwindcss v4.3.2 | MIT License | https://tailwindcss.com */',
      '[data-v-abc]:root,[data-v-abc]:host{--spacing:.25rem}',
      '*[data-v-abc],[data-v-abc]::after,[data-v-abc]::before{box-sizing:border-box;margin:0;padding:0}',
      'html.data-v-abc,.data-v-abc:host{line-height:1.5;-webkit-text-size-adjust:100%;-o-tab-size:4;tab-size:4;font-family:var(--default-font-family,sans-serif);font-feature-settings:var(--default-font-feature-settings,normal);font-variation-settings:var(--default-font-variation-settings,normal);-webkit-tap-highlight-color:transparent}',
      'abbr:where([title].data-v-abc){text-decoration:underline dotted}',
      'button.data-v-abc,input.data-v-abc{font:inherit;color:inherit;background-color:transparent}',
      'uni-progress.data-v-abc{vertical-align:baseline}',
      '.data-v-abc::file-selector-button{margin-inline-end:4px}',
      '.data-v-abc::placeholder{color:currentcolor}',
      '.data-v-abc::-webkit-datetime-edit{padding-block:0}',
      '.data-v-abc::-webkit-calendar-picker-indicator{line-height:1}',
      'view.data-v-abc,text.data-v-abc,.data-v-abc::after,.data-v-abc::before{--tw-content:""}',
      'view.data-v-abc{color:red}',
      'button.data-v-abc{color:blue}',
      'input.data-v-abc{border-color:#123456}',
      'img.data-v-abc{width:12px}',
      '.data-v-abc::before{content:"author"}',
      '.card.data-v-abc{padding:16px}',
      '.card.data-v-abc .title.data-v-abc{font-weight:700}',
      '@media (min-width:640px){button.data-v-abc{color:green}}',
      'text.data-v-abc{display:block}',
      '.up-button--primary.data-v-abc{display:inline-flex;min-height:100vh;gap:8px;background:var(--up-primary, #0957de)}',
      '.up-button--primary.data-v-abc::after{border:1px solid var(--up-border, #dcdfe6);border-radius:8px}',
      '@property --tw-content{syntax:"*";initial-value:"";inherits:false}',
    ].join(''), {
      from: '/src/components/ScopedChild.uvue?vue&type=style&index=0&scoped=abc&lang.css',
    })

    const filtered = applyUniAppXUvueCompatibility(result, {
      uniAppX: true,
      uniAppXCssTarget: 'uvue',
      uniAppXUnsupported: 'warn',
    })
    const warningTexts = filtered.warnings().map(item => item.text)

    expect(filtered.css).toContain('view.data-v-abc{color:red}')
    expect(filtered.css).toContain('button.data-v-abc{color:blue}')
    expect(filtered.css).toContain('input.data-v-abc{border-color:#123456}')
    expect(filtered.css).toContain('img.data-v-abc{width:12px}')
    expect(filtered.css).toContain('.data-v-abc::before{content:"author"}')
    expect(filtered.css).toContain('.card.data-v-abc{padding:16px}')
    expect(filtered.css).toContain('.card.data-v-abc .title.data-v-abc{font-weight:700}')
    expect(filtered.css).toContain('@media (min-width:640px){button.data-v-abc{color:green}}')
    expect(filtered.css).not.toContain('tailwindcss v4.3.2')
    expect(filtered.css).not.toContain('[data-v-abc]:root')
    expect(filtered.css).not.toContain('box-sizing:border-box')
    expect(filtered.css).not.toContain('--tw-content')
    expect(filtered.css).not.toContain('@property')
    expect(filtered.css).not.toContain('font:inherit')
    expect(filtered.css).not.toContain('vertical-align:baseline')
    expect(filtered.css).not.toContain('--default-font-family')
    expect(filtered.css).not.toContain('margin-inline-end')
    expect(filtered.css).not.toContain('currentcolor')
    expect(filtered.css).not.toContain('padding-block')
    expect(filtered.css).toContain('text.data-v-abc{display:block}')
    expect(filtered.css).toContain('.up-button--primary.data-v-abc{display:inline-flex;min-height:100vh;gap:8px;')
    expect(filtered.css).toContain('background:var(--up-primary)')
    expect(filtered.css).toContain('.up-button--primary.data-v-abc::after{border:1px solid var(--up-border, #dcdfe6);border-radius:8px}')
    expect(warningTexts).toEqual([])
  })

  it('keeps Native author apply selectors out of the generated css pipeline', async () => {
    const styleHandler = createStyleHandler({
      appType: 'uni-app-x',
      uniAppX: true,
      uniAppXCssTarget: 'uvue',
      majorVersion: 4,
    })
    const options = {
      isMainChunk: false,
      uniAppXCssSource: 'author-apply' as const,
      postcssOptions: {
        options: {
          from: '/src/components/UpButton.uvue?vue&type=style&index=0&scoped=abc&lang.css',
        },
      },
    }
    const source = [
      '.up-button--primary.data-v-abc:is(.is-active,.is-loading){transition-property:transform,opacity;-webkit-transform:translate(var(--x, 0),var(--y, 0));transform:translate(var(--x, 0),var(--y, 0));color:var(--up-primary, #0957de)}',
      '.up-list.data-v-abc :deep(.up-list-item__body){transition:transform .2s ease;--up-border:var(--runtime-border, #dcdfe6)}',
    ].join('')

    const result = await styleHandler(source, options)
    const pipeline = styleHandler.getPipeline(options)

    expect(pipeline.nodes.map(node => node.id)).not.toEqual(expect.arrayContaining([
      'pre:core',
      'normal:preset-env',
      'normal:autoprefixer',
      'post:core',
    ]))
    expect(result.css).toContain('.up-button--primary.data-v-abc:is(.is-active,.is-loading)')
    expect(result.css).toContain('.up-list.data-v-abc :deep(.up-list-item__body)')
    expect(result.css).toContain('transition-property:transform,opacity')
    expect(result.css).toContain('-webkit-transform:translate(var(--x, 0) var(--y, 0))')
    expect(result.css).toContain('transform:translate(var(--x, 0) var(--y, 0))')
    expect(result.css).not.toContain('-webkit-transform:;')
    expect(result.css).not.toContain('@apply')
    expect(result.warnings()).toEqual([])
  })

  it('preserves ambiguous scoped author reset and theme rules without Tailwind source evidence', async () => {
    const result = await postcss().process([
      '[data-v-abc]:root{--brand:#0957de}',
      '*[data-v-abc]{box-sizing:border-box;margin:0;padding:0}',
      'view{margin:0}',
      '[data-v-abc]:host{--tw-author-noise:0}',
      '*[data-v-abc]{--tw-reset-noise:0}',
      'text{--tw-mini-noise:0}',
    ].join(''), {
      from: '/src/components/ScopedChild.uvue?vue&type=style&index=0&scoped=abc&lang.css',
    })

    const filtered = applyUniAppXUvueCompatibility(result, {
      uniAppX: true,
      uniAppXCssTarget: 'uvue',
      uniAppXUnsupported: 'warn',
    })

    expect(filtered.css).toContain('[data-v-abc]:root{--brand:#0957de}')
    expect(filtered.css).toContain('*[data-v-abc]{box-sizing:border-box;margin:0;padding:0}')
    expect(filtered.css).toContain('view{margin:0}')
    expect(filtered.css).not.toContain('--tw-author-noise')
    expect(filtered.css).not.toContain('--tw-reset-noise')
    expect(filtered.css).not.toContain('--tw-mini-noise')
    expect(filtered.warnings()).toEqual([])
  })

  it('detects scoped uvue requests from the PostCSS input source when result options lose from', async () => {
    const id = '/src/components/ScopedChild.uvue?vue&type=style&index=0&scoped=abc&lang.css'
    const result = postcss.parse('button.data-v-abc{color:red}', { from: id }).toResult()

    expect(result.opts.from).toBeUndefined()
    expect(result.root.first?.source?.input.from).toBe(id)

    const filtered = applyUniAppXUvueCompatibility(result, {
      uniAppX: true,
      uniAppXCssTarget: 'uvue',
      uniAppXUnsupported: 'warn',
    })

    expect(filtered.css).toBe('button.data-v-abc{color:red}')
    expect(filtered.warnings()).toEqual([])
  })

  it('preserves author selectors for uvue SFC style requests that omit the scoped query', async () => {
    const result = await postcss().process('button{color:red}', {
      from: '/src/components/ScopedChild.uvue?vue&type=style&index=0&lang.css',
    })

    const filtered = applyUniAppXUvueCompatibility(result, {
      uniAppX: true,
      uniAppXCssTarget: 'uvue',
      uniAppXUnsupported: 'warn',
    })

    expect(filtered.css).toBe('button{color:red}')
    expect(filtered.warnings()).toEqual([])
  })

  it('keeps global uvue style entries on the class-only compatibility path', async () => {
    const result = await postcss().process('page{--color-primary:#0957DE}.bg-primary{background-color:#0957DE}', {
      from: '/src/App.uvue?vue&type=style&index=0&lang.css',
    })

    const filtered = applyUniAppXUvueCompatibility(result, {
      isMainChunk: true,
      uniAppX: true,
      uniAppXCssTarget: 'uvue',
      uniAppXUnsupported: 'warn',
    })

    expect(filtered.css).not.toContain('page{')
    expect(filtered.css).toContain('.bg-primary{background-color:#0957DE}')
    expect(filtered.warnings()).toHaveLength(1)
    expect(filtered.warnings()[0]?.text).toContain('selector must be class-only')
  })

  it('detects compiled scoped selectors when all uvue request metadata is lost', async () => {
    const result = await postcss().process('button[data-v-abc]{color:red}', {
      from: undefined,
    })

    const filtered = applyUniAppXUvueCompatibility(result, {
      uniAppX: true,
      uniAppXCssTarget: 'uvue',
      uniAppXUnsupported: 'warn',
    })

    expect(filtered.css).toBe('button[data-v-abc]{color:red}')
    expect(filtered.warnings()).toEqual([])
  })

  it('does not classify non-uvue Vue style requests as uvue author styles', async () => {
    const result = await postcss().process('button{color:red}', {
      from: '/src/components/ScopedChild.vue?vue&type=style&index=0&scoped=abc&lang.css',
    })

    const filtered = applyUniAppXUvueCompatibility(result, {
      uniAppX: true,
      uniAppXCssTarget: 'uvue',
      uniAppXUnsupported: 'warn',
    })

    expect(filtered.css).toBe('')
    expect(filtered.warnings()).toHaveLength(1)
    expect(filtered.warnings()[0]?.text).toContain('selector must be class-only')
  })

  it('uses incremental theme values when a uvue utility has no root carrier', async () => {
    const result = await postcss().process([
      '.text-white{color:var(--color-white)}',
      '.text-xs{font-size:var(--text-xs);line-height:var(--tw-leading,var(--text-xs--line-height))}',
    ].join('\n'), {
      from: '/src/pages/index/index.uvue',
    })

    const filtered = applyUniAppXUvueCompatibility(result, {
      uniAppX: true,
      uniAppXCssTarget: 'uvue',
      customPropertyValues: new Map([
        ['--color-white', '#fff'],
        ['--text-xs', '0.75rem'],
        ['--text-xs--line-height', 'calc(1 / 0.75)'],
      ]),
    })

    expect(filtered.css).toContain('color:#fff')
    expect(filtered.css).toContain('font-size:0.75rem')
    expect(filtered.css).toContain('line-height:1.33333')
    expect(filtered.css).not.toContain('var(--')
    expect(filtered.warnings()).toEqual([])
  })

  it('reduces static uvue calc expressions after theme and unit conversion', async () => {
    const result = await postcss().process([
      '.mt-3{margin-top:calc(8rpx * 3)}',
      '.text-sm{line-height:calc(1.25 / 0.875)}',
      '.dynamic{width:calc(100% - var(--runtime-offset))}',
      '@property --tw-content{syntax:"*";initial-value:"";inherits:false}',
    ].join('\n'), {
      from: '/src/pages/index/index.uvue',
    })

    const filtered = applyUniAppXUvueCompatibility(result, {
      uniAppX: true,
      uniAppXCssTarget: 'uvue',
    })

    expect(filtered.css).toContain('.mt-3{margin-top:24rpx}')
    expect(filtered.css).toContain('.text-sm{line-height:1.42857}')
    expect(filtered.css).not.toContain('.dynamic')
    expect(filtered.css).not.toContain('calc(')
    expect(filtered.css).not.toContain('@property')
    expect(filtered.warnings()).toHaveLength(1)
    expect(filtered.warnings()[0]?.text).toContain('dynamic')
    expect(filtered.warnings()[0]?.text).toContain('calc(100% - var(--runtime-offset))')
  })
})
