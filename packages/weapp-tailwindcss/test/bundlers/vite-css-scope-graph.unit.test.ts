import type { OutputAsset, OutputBundle, OutputChunk } from 'rollup'
import { describe, expect, it } from 'vitest'
import { collectCssCalcScopes } from '@/bundlers/vite/css-finalizer/css-scope-graph'

function asset(fileName: string, source = ''): OutputAsset {
  return { type: 'asset', fileName, names: [], originalFileNames: [], source }
}

function chunk(fileName: string, options: {
  isEntry?: boolean
  isDynamicEntry?: boolean
  imports?: string[]
  dynamicImports?: string[]
  css?: string[]
} = {}): OutputChunk {
  return {
    type: 'chunk',
    fileName,
    isEntry: options.isEntry ?? true,
    isDynamicEntry: options.isDynamicEntry ?? false,
    imports: options.imports ?? [],
    dynamicImports: options.dynamicImports ?? [],
    viteMetadata: { importedCss: new Set(options.css ?? []) },
  } as unknown as OutputChunk
}

function collect(...outputs: (OutputAsset | OutputChunk)[]) {
  const bundle: OutputBundle = Object.fromEntries(outputs.map(output => [output.fileName, output]))
  return collectCssCalcScopes(bundle, { matchesCss: file => /\.(?:css|acss)$/.test(file) })
}

function visible(scopes: Map<string, Set<string>>, file: string) {
  return [...scopes.get(file)!].sort()
}

function collectConditional(...outputs: (OutputAsset | OutputChunk)[]) {
  const bundle: OutputBundle = Object.fromEntries(outputs.map(output => [output.fileName, output]))
  const conditional: string[] = []
  const scopes = collectCssCalcScopes(bundle, {
    matchesCss: file => file.endsWith('.css'),
    onConditionalSource: file => conditional.push(file),
  })
  return { scopes, conditional }
}

describe('vite CSS calc output scopes', () => {
  it('includes author overrides imported beside utilities by the same output root', () => {
    const scopes = collect(
      asset('entry.acss', '@import "./utilities.acss"; @import url("./author.acss");'),
      asset('utilities.acss', 'page { --spacing: 1rpx }'),
      asset('author.acss', '.scope { --spacing: 2rpx }'),
    )
    const expected = ['author.acss', 'entry.acss', 'utilities.acss']
    expect(visible(scopes, 'utilities.acss')).toEqual(expected)
    expect(visible(scopes, 'author.acss')).toEqual(expected)
  })

  it('isolates unrelated roots even when variable names are identical', () => {
    const scopes = collect(
      asset('one/root.css', '@import "./theme.css";'),
      asset('one/theme.css', ':root { --spacing: 1rpx }'),
      asset('two/root.css', '@import "./theme.css";'),
      asset('two/theme.css', ':root { --spacing: 2rpx }'),
    )
    expect(visible(scopes, 'one/theme.css')).toEqual(['one/root.css', 'one/theme.css'])
    expect(visible(scopes, 'two/theme.css')).toEqual(['two/root.css', 'two/theme.css'])
  })

  it('unions shared asset consumers without propagating one root into another', () => {
    const scopes = collect(
      chunk('one.js', { css: ['one.css', 'shared.css', 'override.css'] }),
      chunk('two.js', { css: ['two.css', 'shared.css'] }),
      asset('one.css'),
      asset('two.css'),
      asset('shared.css', ':root { --spacing: 1rpx }'),
      asset('override.css', '.compact { --spacing: 2rpx }'),
    )
    expect(visible(scopes, 'shared.css')).toEqual(['one.css', 'override.css', 'shared.css', 'two.css'])
    expect(visible(scopes, 'one.css')).toEqual(['one.css', 'override.css', 'shared.css'])
    expect(visible(scopes, 'two.css')).toEqual(['shared.css', 'two.css'])
    expect(visible(scopes, 'override.css')).toEqual(['one.css', 'override.css', 'shared.css'])
  })

  it('follows static chunk dependencies and their CSS imports without loading dynamic chunks', () => {
    const scopes = collect(
      chunk('entry.js', { css: ['entry.css'], imports: ['chunks/one.js'], dynamicImports: ['lazy.js'] }),
      chunk('chunks/one.js', { isEntry: false, imports: ['./two.js'], css: ['author.css'] }),
      chunk('chunks/two.js', { isEntry: false, imports: ['chunks/one.js'], css: ['utilities.css'] }),
      chunk('lazy.js', { isEntry: false, css: ['lazy.css'] }),
      asset('entry.css'),
      asset('author.css', '@import "nested.css";'),
      asset('nested.css'),
      asset('utilities.css'),
      asset('lazy.css'),
    )
    expect(visible(scopes, 'utilities.css')).toEqual(['author.css', 'entry.css', 'nested.css', 'utilities.css'])
    expect(visible(scopes, 'lazy.css')).toEqual(['lazy.css'])
  })

  it('uses an entry stylesheet only when its directory and stem identify a unique asset', () => {
    const scopes = collect(
      chunk('routes/home.js', { css: ['utilities.css'] }),
      chunk('routes/ambiguous.js', { css: ['separate.css'] }),
      asset('routes/home.acss', '.scope { --spacing: 2rpx }'),
      asset('utilities.css'),
      asset('routes/ambiguous.css'),
      asset('routes/ambiguous.acss'),
      asset('separate.css'),
      asset('other/home.css'),
    )
    expect(visible(scopes, 'utilities.css')).toEqual(['routes/home.acss', 'utilities.css'])
    expect(visible(scopes, 'separate.css')).toEqual(['separate.css'])
    expect(visible(scopes, 'other/home.css')).toEqual(['other/home.css'])
  })

  it('gives each dynamic entry its own static CSS closure', () => {
    const scopes = collect(
      chunk('entry.js', { css: ['entry.css'], dynamicImports: ['lazy.js'] }),
      chunk('lazy.js', { isEntry: false, isDynamicEntry: true, css: ['lazy.css', 'author.css'] }),
      asset('entry.css'),
      asset('lazy.css'),
      asset('author.css'),
    )
    expect(visible(scopes, 'entry.css')).toEqual(['entry.css'])
    expect(visible(scopes, 'lazy.css')).toEqual(['author.css', 'lazy.css'])
  })

  it('groups standalone cycles and their descendants without merging other roots', () => {
    const scopes = collect(
      asset('shared.css'),
      asset('cycle-b.css', '@import "cycle-a.css"; @import "shared.css";'),
      asset('cycle-a.css', '@import "cycle-b.css";'),
      asset('other.css', '@import "shared.css";'),
    )
    expect(visible(scopes, 'cycle-a.css')).toEqual(['cycle-a.css', 'cycle-b.css', 'shared.css'])
    expect(visible(scopes, 'other.css')).toEqual(['other.css', 'shared.css'])
    expect(visible(scopes, 'shared.css')).toEqual(['cycle-a.css', 'cycle-b.css', 'other.css', 'shared.css'])
  })

  it('starts orphan scopes at source cycles even when downstream cycles appear first', () => {
    const scopes = collect(
      asset('down-a.css', '@import "down-b.css";'),
      asset('down-b.css', '@import "down-a.css";'),
      asset('up-a.css', '@import "up-b.css"; @import "down-a.css";'),
      asset('up-b.css', '@import "up-a.css"; @import "author.css";'),
      asset('author.css'),
    )
    expect(visible(scopes, 'down-b.css')).toEqual(['author.css', 'down-a.css', 'down-b.css', 'up-a.css', 'up-b.css'])
  })

  it('ignores remote, absolute, unresolved and fragment-only CSS requests', () => {
    const scopes = collect(
      asset('root.css', `
        @import "https://example.test/remote.css";
        @import url(//example.test/remote.css);
        @import "/absolute.css";
        @import "data:text/css,.x{}";
        @import "C:/absolute.css";
        @import "#fragment";
        @import "missing.css";
        @import "./local.css?version=2#sheet" screen;
      `),
      asset('local.css'),
      asset('absolute.css'),
      asset('remote.css'),
      asset('C:/absolute.css'),
    )
    expect(visible(scopes, 'root.css')).toEqual(['local.css', 'root.css'])
    expect(visible(scopes, 'C:/absolute.css')).toEqual(['C:/absolute.css'])
  })

  it('normalizes backslash output names, relative segments, drive roots and metadata', () => {
    const scopes = collect(
      chunk('C:\\output\\routes\\entry.js', { css: ['C:\\output\\shared.css'] }),
      asset('C:\\output\\routes\\entry.acss', '@import "../theme.acss";'),
      asset('C:\\output\\routes\\..\\theme.acss'),
      asset('C:\\output\\shared.css'),
      asset('/root/entry.css', '@import "./nested/../theme.css";'),
      asset('/root/theme.css'),
      asset('relative\\entry.css', '@import "./theme.css";'),
      asset('relative\\theme.css'),
    )
    expect(visible(scopes, 'C:/output/shared.css')).toEqual(['C:/output/routes/entry.acss', 'C:/output/shared.css', 'C:/output/theme.acss'])
    expect(visible(scopes, '/root/theme.css')).toEqual(['/root/entry.css', '/root/theme.css'])
    expect(visible(scopes, 'relative/theme.css')).toEqual(['relative/entry.css', 'relative/theme.css'])
  })

  it('reads binary CSS assets and leaves the output graph untouched', () => {
    const root = asset('root.css')
    root.source = new TextEncoder().encode('@import "./theme.css";')
    const original = root.source.slice()
    const scopes = collect(root, asset('theme.css'), asset('ignored.json', 'invalid CSS'))
    expect(visible(scopes, 'root.css')).toEqual(['root.css', 'theme.css'])
    expect(root.source).toEqual(original)
    expect(scopes.has('ignored.json')).toBe(false)
  })

  it.each(['screen', 'supports(display: grid)', 'layer', 'layer(theme)', '/* retained comment */'])(
    'marks the imported theme and its dependencies conditional for %s',
    (condition) => {
      const { scopes, conditional } = collectConditional(
        asset('root.css', `@import './theme.css' ${condition}; .w-32 { width: calc(var(--spacing) * 32) }`),
        asset('theme.css', '@import "tokens.css"; :root { --spacing: 1rpx }'),
        asset('tokens.css', ':root { --other: 2rpx }'),
        asset('independent.css', ':root { --spacing: 3rpx }'),
      )
      expect(conditional.sort()).toEqual(['theme.css', 'tokens.css'])
      expect(visible(scopes, 'root.css')).toEqual(['root.css', 'theme.css', 'tokens.css'])
      expect(visible(scopes, 'independent.css')).toEqual(['independent.css'])
    },
  )

  it('propagates nested import conditions through cycles without marking sibling assets', () => {
    const { scopes, conditional } = collectConditional(
      asset('root.css', '@media screen { @layer theme { @import "./theme.css"; } } @import "./author.css";'),
      asset('theme.css', '@import "./tokens.css";'),
      asset('tokens.css', '@import "./theme.css";'),
      asset('author.css'),
      asset('independent.css'),
    )
    expect(conditional.sort()).toEqual(['theme.css', 'tokens.css'])
    expect(visible(scopes, 'author.css')).toEqual(['author.css', 'root.css', 'theme.css', 'tokens.css'])
    expect(visible(scopes, 'independent.css')).toEqual(['independent.css'])
  })

  it('does not mark plain imports or unresolved conditional URLs', () => {
    const { conditional } = collectConditional(
      asset('root.css', `
        @import /* before request */ "./theme.css";
        @import url('./author.css')   ;
        @import "./missing.css" screen;
        @import "https://example.test/remote.css" screen;
      `),
      asset('theme.css'),
      asset('author.css'),
      asset('remote.css'),
    )
    expect(conditional).toEqual([])
  })
})
