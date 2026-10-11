import {
  isTailwindCssImport,
  isUniAppXStyleSourceEmpty,
  parseCssImportSpecifier,
  parseCssSource,
  parseImportSourceParam,
  parseScssSource,
  parseTailwindCssDirectiveRequest,
  parseUniAppXStyleSource,
  quoteCssImportSpecifier,
  scss,
  stringifyScssSource,
} from '@/index'

const imports = [
  '/workspace/node_modules/tailwindcss/index.css',
  'C:/workspace/node_modules/tailwindcss/index.css',
  String.raw`C:\workspace\node_modules\tailwindcss\index.css`,
  String.raw`\\server\share\node_modules\tailwindcss\index.css`,
  String.raw`C:\workspace with spaces\node_modules\tailwindcss\index.css`,
  './node_modules/tailwindcss/index.css',
]

describe('css import syntax', () => {
  it.each(imports)('serializes and decodes %s at the CSS boundary', (file) => {
    const quoted = quoteCssImportSpecifier(file)
    const expected = file.includes('\\') ? file.replaceAll('\\', '/') : file
    expect(parseCssImportSpecifier(quoted)?.specifier).toBe(expected)
    expect(isTailwindCssImport(quoted)).toBe(true)
    expect(parseCssImportSpecifier(`url(${JSON.stringify(file)})`)?.specifier).toBe(file)
    expect(isTailwindCssImport(`url(${JSON.stringify(file)})`)).toBe(true)
  })

  it('decodes CSS escapes, quotes, comments and source strings', () => {
    expect(parseCssImportSpecifier(String.raw`/* entry */ "tailwind\63 ss" layer(utilities)`)?.specifier).toBe('tailwindcss')
    expect(parseCssImportSpecifier(String.raw`url("C:\\project's files\\tailwindcss\\index.css") source(none)`)?.specifier)
      .toBe(String.raw`C:\project's files\tailwindcss\index.css`)
    expect(parseCssImportSpecifier('url(./tailwindcss/index.css)')?.specifier).toBe('./tailwindcss/index.css')
    expect(parseImportSourceParam(String.raw`"tailwindcss" source("./my\20 content")`))
      .toEqual({ none: false, sourcePath: './my content' })
    expect(parseImportSourceParam('"tailwindcss" source(none)')).toEqual({ none: true, sourcePath: undefined })
    expect(isTailwindCssImport('"./other/index.css"')).toBe(false)
    expect(parseCssImportSpecifier('url("tailwindcss"')).toBeUndefined()
    expect(parseCssImportSpecifier(quoteCssImportSpecifier(`C:\\a"b\\tailwindcss\\index.css`))?.specifier)
      .toBe('C:/a"b/tailwindcss/index.css')
  })

  it('keeps the directive request parser on the tokenizer implementation', () => {
    expect(parseTailwindCssDirectiveRequest('url("tailwindcss") layer(theme)')).toBe('tailwindcss')
    expect(parseTailwindCssDirectiveRequest('url(tailwindcss/utilities)')).toBe('tailwindcss/utilities')
    expect(parseTailwindCssDirectiveRequest('"tailwindcss/theme.css"')).toBe('tailwindcss/theme.css')
    expect(parseTailwindCssDirectiveRequest(String.raw`/* entry */ "tailwind\63 ss"`)).toBe('tailwindcss')
    expect(parseTailwindCssDirectiveRequest('')).toBeUndefined()
    expect(parseTailwindCssDirectiveRequest('url("tailwindcss"')).toBeUndefined()
  })

  it('uses a quoted fast path that still preserves trailing layer/source params', () => {
    expect(parseCssImportSpecifier('  "tailwindcss" layer(theme)')).toEqual({
      specifier: 'tailwindcss',
      raw: '"tailwindcss"',
      quote: '"',
    })
    expect(parseCssImportSpecifier('url( "./local.css" ) source(none)')).toEqual({
      specifier: './local.css',
      raw: 'url( "./local.css" )',
      quote: '"',
    })
    expect(parseCssImportSpecifier('url(\'./theme.css\')')).toEqual({
      specifier: './theme.css',
      raw: 'url(\'./theme.css\')',
      quote: '\'',
    })
  })

  it('covers ident, empty input and Windows path package entries', () => {
    expect(parseCssImportSpecifier('')).toBeUndefined()
    expect(parseCssImportSpecifier('   ')).toBeUndefined()
    expect(parseCssImportSpecifier('tailwindcss')?.specifier).toBe('tailwindcss')
    expect(isTailwindCssImport('')).toBe(false)
    expect(isTailwindCssImport('layer(theme)')).toBe(false)
    expect(isTailwindCssImport('"tailwindcss/theme.css"')).toBe(true)
    expect(isTailwindCssImport(String.raw`"C:\\workspace\\node_modules\\tailwindcss\\index.css"`)).toBe(true)
    expect(isTailwindCssImport(String.raw`"C:\\workspace\\node_modules\\other\\index.css"`)).toBe(false)
    expect(quoteCssImportSpecifier('theme.css', '\'')).toBe("'theme.css'")
    expect(quoteCssImportSpecifier('a\nb')).toBe('"a\\a b"')
    expect(quoteCssImportSpecifier('a\rb')).toBe('"a\\d b"')
    expect(parseCssImportSpecifier('url( "tailwindcss" )')?.specifier).toBe('tailwindcss')
    expect(parseCssImportSpecifier('url( tailwindcss )')?.specifier).toBe('tailwindcss')
    expect(parseImportSourceParam('"tailwindcss"')).toBeUndefined()
    expect(parseImportSourceParam('"tailwindcss" source(')).toBeUndefined()
    expect(parseImportSourceParam('"tailwindcss" source(123)')).toBeUndefined()
  })
})

describe('uni-app x style source syntax', () => {
  it('parses standard CSS and round-trips SCSS comments', () => {
    const cssRoot = parseCssSource('.a { color: red; }')
    expect(cssRoot.nodes).toHaveLength(1)
    const scssRoot = parseScssSource('// x\n.a { color: red; }')
    expect(stringifyScssSource(scssRoot)).toContain('.a')
    expect(stringifyScssSource(scssRoot)).toContain('// x')
    expect(typeof scss.parse).toBe('function')
  })

  it('treats SCSS line comments as comments instead of selectors', () => {
    const root = parseUniAppXStyleSource('// comment\n.author { color: red; }')
    expect(root.nodes.some(node => node.type === 'comment')).toBe(true)
    expect(root.nodes.some(node => node.type === 'rule' && 'selector' in node && node.selector.includes('.author'))).toBe(true)
  })

  it.each(['', '//\n', '/* comment */'])('detects empty author style for %j', (source) => {
    expect(isUniAppXStyleSourceEmpty(source)).toBe(true)
  })

  it('does not treat author rules as empty', () => {
    expect(isUniAppXStyleSourceEmpty('.author { color: red; }')).toBe(false)
    expect(isUniAppXStyleSourceEmpty('{')).toBe(false)
  })
})
