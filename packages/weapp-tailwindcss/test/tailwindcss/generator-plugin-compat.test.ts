import { access, mkdir, mkdtemp, symlink, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createTailwindV4Engine, resolveTailwindV4Source } from '@/tailwindcss/v4-engine'

const require = createRequire(import.meta.url)
const packageRoot = path.resolve(__dirname, '../..')
const workspaceRoot = path.resolve(packageRoot, '../..')
const pluginPackageRoots = [
  path.join(workspaceRoot, 'demo/uni-app-vite-tailwindcss-v4'),
  path.join(workspaceRoot, 'demo/uni-app-vite-tailwindcss-v4'),
  path.join(workspaceRoot, 'website'),
]
const tailwindcss4Root = path.dirname(require.resolve('tailwindcss/package.json'))
const linkedPackages = [
  '@egoist/tailwindcss-icons',
  '@iconify-json/lucide',
  '@iconify-json/mdi',
  '@tailwindcss/typography',
]
const pluginCandidates = [
  'prose',
  'i-mdi-home',
  'i-lucide-house',
  'ei-[mdi--home]',
  'icon-[mdi--home]',
  'plugin-card',
  'plugin-scrollbar',
  'plugin-size-card',
]
const v4CssPluginCandidates = [
  'daisy-btn',
  'daisy-card',
  'icon-[mdi--home]',
  'iconify-[mdi--home]',
  'iconify-options',
]

function compactCss(css: string) {
  return css.replace(/\s+/g, '')
}

async function findPackageRoot(resolvedFile: string) {
  let dir = path.dirname(resolvedFile)
  while (dir !== path.dirname(dir)) {
    try {
      await access(path.join(dir, 'package.json'))
      return dir
    }
    catch {
      dir = path.dirname(dir)
    }
  }
  throw new Error(`Unable to find package root for ${resolvedFile}`)
}

function resolvePluginPackage(packageName: string) {
  return require.resolve(packageName, {
    paths: pluginPackageRoots,
  })
}

function expectIconCss(css: string) {
  expect(css).toContain('--svg')
  expect(css).toMatch(/mask|background/)
}

async function createPluginFixture(tailwindcssRoot: string) {
  const root = await mkdtemp(path.join(tmpdir(), 'weapp-tw-plugin-compat-'))
  const nodeModulesDir = path.join(root, 'node_modules')
  await mkdir(nodeModulesDir, { recursive: true })
  await symlink(tailwindcssRoot, path.join(nodeModulesDir, 'tailwindcss'), 'dir')

  for (const packageName of linkedPackages) {
    const resolvedFile = resolvePluginPackage(packageName)
    const packageDir = await findPackageRoot(resolvedFile)
    const target = path.join(nodeModulesDir, ...packageName.split('/'))
    await mkdir(path.dirname(target), { recursive: true })
    await symlink(packageDir, target, 'dir')
  }

  return root
}

async function linkPackage(root: string, packageName: string) {
  const resolvedFile = resolvePluginPackage(packageName)
  const packageDir = await findPackageRoot(resolvedFile)
  const target = path.join(root, 'node_modules', ...packageName.split('/'))
  await mkdir(path.dirname(target), { recursive: true })
  await symlink(packageDir, target, 'dir')
}

async function createRealIconifyFixture(tailwindcssRoot: string) {
  const root = await mkdtemp(path.join(tmpdir(), 'weapp-tw-real-iconify-'))
  const nodeModulesDir = path.join(root, 'node_modules')
  await mkdir(nodeModulesDir, { recursive: true })
  await symlink(tailwindcssRoot, path.join(nodeModulesDir, 'tailwindcss'), 'dir')
  await linkPackage(root, '@iconify/tailwind4')
  return root
}

async function writePackageJson(root: string, packageName: string) {
  const packageDir = path.join(root, 'node_modules', ...packageName.split('/'))
  await mkdir(packageDir, { recursive: true })
  await writeFile(
    path.join(packageDir, 'package.json'),
    JSON.stringify({
      name: packageName,
      version: '0.0.0-test',
      main: './index.cjs',
    }),
    'utf8',
  )
  return packageDir
}

async function writeFakeDaisyuiPackage(root: string) {
  const packageDir = await writePackageJson(root, 'daisyui')
  await writeFile(
    path.join(packageDir, 'index.cjs'),
    [
      'const plugin = require("tailwindcss/plugin")',
      '',
      'function normalizeEmpty(value) {',
      '  return value === "" || value === 0 ? "empty" : String(value)',
      '}',
      '',
      'module.exports = plugin.withOptions((options = {}) => ({ addComponents }) => {',
      '  addComponents({',
      '    ".daisy-btn": {',
      '      "--daisy-root": options.root || "unset",',
      '      "--daisy-logs": String(options.logs),',
      '      "--daisy-prefix": normalizeEmpty(options.prefix),',
      '      "--daisy-include": normalizeEmpty(options.include),',
      '      "--daisy-exclude": normalizeEmpty(options.exclude),',
      '      color: "#123456",',
      '    },',
      '    ".daisy-card": {',
      '      "--daisy-themes": Array.isArray(options.themes) ? options.themes.join("|") : String(options.themes),',
      '      "border-radius": "12px",',
      '    },',
      '  })',
      '})',
    ].join('\n'),
    'utf8',
  )
}

async function writeFakeIconifyTailwind4Package(root: string) {
  const packageDir = await writePackageJson(root, '@iconify/tailwind4')
  await writeFile(
    path.join(packageDir, 'index.cjs'),
    [
      'const plugin = require("tailwindcss/plugin")',
      '',
      'function stringify(value) {',
      '  if (Array.isArray(value)) return value.join("|")',
      '  if (value === undefined) return "unset"',
      '  if (value === "") return "empty"',
      '  return String(value)',
      '}',
      '',
      'module.exports = plugin.withOptions((options = {}) => ({ addComponents, matchUtilities }) => {',
      '  const prefix = options.prefix || "icon"',
      '  const scale = Number(options.scale || 1)',
      '  addComponents({',
      '    ".iconify-options": {',
      '      "--iconify-prefix": stringify(options.prefix),',
      '      "--iconify-override-only": stringify(options.overrideOnly ?? options["override-only"] ?? options.overrideonly),',
      '      "--iconify-prefixes": stringify(options.prefixes),',
      '      "--iconify-icon-selector": stringify(options.iconSelector ?? options["icon-selector"] ?? options.iconselector),',
      '      "--iconify-mask-selector": stringify(options.maskSelector ?? options["mask-selector"] ?? options.maskselector),',
      '      "--iconify-background-selector": stringify(options.backgroundSelector ?? options["background-selector"] ?? options.backgroundselector),',
      '      "--iconify-icon-sets": stringify(options.iconSets ?? options["icon-sets"] ?? options.iconsets),',
      '      "--iconify-var-name": stringify(options.varName ?? options["var-name"] ?? options.varname),',
      '      "--iconify-square": stringify(options.square),',
      '      "--iconify-scale": stringify(options.scale),',
      '    },',
      '  })',
      '  matchUtilities({',
      '    [prefix]: (value) => ({',
      '      "--svg": `"${value}"`,',
      '      display: "inline-block",',
      '      width: `${scale}em`,',
      '      height: `${scale}em`,',
      '      mask: "var(--svg) no-repeat center / 100% 100%",',
      '    }),',
      '  })',
      '})',
    ].join('\n'),
    'utf8',
  )
}

async function createV4CssPluginDirectiveFixture() {
  const root = await createPluginFixture(tailwindcss4Root)
  await writeFakeDaisyuiPackage(root)
  await writeFakeIconifyTailwind4Package(root)
  return root
}

function createV4ConfigSource() {
  return [
    'const { iconsPlugin, dynamicIconsPlugin, getIconCollections } = require("@egoist/tailwindcss-icons")',
    'const addDynamicIconSelectors = require("@iconify/tailwind4").default',
    'const plugin = require("tailwindcss/plugin")',
    '',
    'module.exports = {',
    '  content: [],',
    '  theme: {',
    '    extend: {',
    '      colors: { brand: "#123456" },',
    '    },',
    '  },',
    '  plugins: [',
    '    require("@tailwindcss/typography"),',
    '    iconsPlugin({ collections: getIconCollections(["mdi", "lucide"]) }),',
    '    dynamicIconsPlugin({ prefix: "ei" }),',
    '    addDynamicIconSelectors(),',
    '    plugin(({ addComponents, addUtilities, matchUtilities, theme }) => {',
    '      addComponents({',
    '        ".plugin-card": { color: theme("colors.brand") },',
    '      })',
    '      addUtilities({',
    '        ".plugin-scrollbar": { "scrollbar-width": "thin" },',
    '      })',
    '      matchUtilities(',
    '        {',
    '          "plugin-size": (value) => ({',
    '            width: value,',
    '            height: value,',
    '          }),',
    '        },',
    '        { values: { card: "48rpx" } },',
    '      )',
    '    }),',
    '  ],',
    '}',
  ].join('\n')
}

async function createV4Source(root: string) {
  const configFile = path.join(root, 'tailwind.config.cjs')
  const cssEntry = path.join(root, 'app.css')
  await writeFile(configFile, createV4ConfigSource(), 'utf8')
  const css = [
    '@config "./tailwind.config.cjs";',
    '@import "tailwindcss" source(none);',
    `@source inline("${pluginCandidates.join(' ')}");`,
  ].join('\n')
  await writeFile(cssEntry, css, 'utf8')
  return resolveTailwindV4Source({
    base: root,
    css,
    projectRoot: root,
  })
}

async function createV4CssPluginDirectiveSource(root: string) {
  const css = [
    '@import "tailwindcss" source(none);',
    '@plugin "daisyui";',
    '@plugin "daisyui" {',
    '  themes: light --default, dark --prefersdark;',
    '  root: ":root";',
    '  include: ;',
    '  exclude: ;',
    '  prefix: ;',
    '  logs: true;',
    '}',
    '@plugin "@iconify/tailwind4";',
    '@plugin "@iconify/tailwind4" {',
    '  prefix: "iconify";',
    '  scale: 1.2;',
    '  override-only: true;',
    '  prefixes: mdi, lucide;',
    '  icon-selector: ".ic-{prefix}-{name}";',
    '  mask-selector: ".mask-icon";',
    '  background-selector: ".bg-icon";',
    '  icon-sets: from-json(mdi, "./mdi.json"), from-folder(lucide, "./icons");',
    '  var-name: "icon";',
    '  square: false;',
    '}',
    `@source inline("${v4CssPluginCandidates.join(' ')}");`,
  ].join('\n')

  return resolveTailwindV4Source({
    base: root,
    css,
    projectRoot: root,
  })
}

async function createRealIconifyTailwind4OptionMatrixSource(root: string) {
  const iconSetFile = path.join(root, 'test-icons.json')
  await writeFile(iconSetFile, JSON.stringify({
    prefix: 'tst',
    icons: {
      home: {
        body: '<path d="M1 7L8 1l7 6v8H1z"/>',
        width: 16,
        height: 16,
      },
      wide: {
        body: '<path d="M0 0h24v12H0z"/>',
        width: 24,
        height: 12,
      },
    },
  }), 'utf8')
  const css = [
    '@import "tailwindcss" source(none);',
    "@plugin '@iconify/tailwind4' {",
    "  prefix: 'i';",
    '  scale: 1.5;',
    `  icon-sets: from-json(tst, '${iconSetFile.replace(/\\/g, '/')}');`,
    '}',
    "@plugin '@iconify/tailwind4' {",
    "  prefix: 'only';",
    '  override-only: true;',
    `  icon-sets: from-json(tst, '${iconSetFile.replace(/\\/g, '/')}');`,
    '}',
    "@plugin '@iconify/tailwind4' {",
    '  prefixes: tst;',
    '  icon-selector: ".ic-{prefix}-{name}";',
    '  mask-selector: ".mask-icon";',
    '  background-selector: ".bg-icon";',
    '  var-name: "icon";',
    '  square: false;',
    '  scale: 2;',
    `  icon-sets: from-json(tst, '${iconSetFile.replace(/\\/g, '/')}');`,
    '}',
    '@source inline("i-[tst--home] only-[tst--home]");',
  ].join('\n')

  return resolveTailwindV4Source({
    base: root,
    css,
    projectRoot: root,
  })
}

describe('tailwindcss generator plugin compatibility', () => {
  it('supports config-loaded official plugins, custom plugins, and icon plugins in the v4 engine', async () => {
    const root = await createPluginFixture(tailwindcss4Root)
    await linkPackage(root, '@iconify/tailwind4')
    const source = await createV4Source(root)
    const engine = createTailwindV4Engine(source)

    const result = await engine.generate()
    const css = compactCss(result.css)

    expect(result.classSet).toEqual(new Set(pluginCandidates))
    expect(result.css).toContain('.prose')
    expect(result.css).toContain('.plugin-card')
    expect(result.css).toContain('color: #123456')
    expect(result.css).toContain('.plugin-scrollbar')
    expect(result.css).toContain('scrollbar-width: thin')
    expect(result.css).toContain('.plugin-size-card')
    expect(result.css).toContain('width: 48rpx')
    expectIconCss(result.css)
    expect(result.css).not.toContain('ei-\\[mdi--home\\]')
    expect(result.css).not.toContain('icon-\\[mdi--home\\]')
    expect(result.css).not.toContain('@media')
  })

  it('supports CSS @plugin directives and option blocks in the v4 engine', async () => {
    const root = await createV4CssPluginDirectiveFixture()
    const source = await createV4CssPluginDirectiveSource(root)
    const engine = createTailwindV4Engine(source)

    const result = await engine.generate()

    expect(result.classSet).toEqual(new Set(v4CssPluginCandidates))
    expect(result.rawCss).toContain('.daisy-btn')
    expect(result.rawCss).toContain('.daisy-card')
    expect(result.rawCss).toContain('--daisy-root: :root')
    expect(result.rawCss).toContain('--daisy-logs: true')
    expect(result.rawCss).toContain('--daisy-prefix: empty')
    expect(result.rawCss).toContain('--daisy-include: empty')
    expect(result.rawCss).toContain('--daisy-exclude: empty')
    expect(result.rawCss).toContain('light --default')
    expect(result.rawCss).toContain('dark --prefersdark')
    expect(result.rawCss).toContain('.icon-\\[mdi--home\\]')
    expect(result.rawCss).toContain('.iconify-\\[mdi--home\\]')
    expect(result.rawCss).toContain('width: 1.2em')
    expect(result.rawCss).toContain('height: 1.2em')
    expect(result.rawCss).toContain('mask:')
    expect(result.rawCss).toContain('.iconify-options')
    expect(result.rawCss).toContain('--iconify-prefix: iconify')
    expect(result.rawCss).toContain('--iconify-override-only: true')
    expect(result.rawCss).toContain('--iconify-prefixes: mdi|lucide')
    expect(result.rawCss).toContain('--iconify-icon-selector: .ic-{prefix}-{name}')
    expect(result.rawCss).toContain('--iconify-mask-selector: .mask-icon')
    expect(result.rawCss).toContain('--iconify-background-selector: .bg-icon')
    expect(result.rawCss).toContain('--iconify-icon-sets: from-json(mdi, "./mdi.json")|from-folder(lucide, "./icons")')
    expect(result.rawCss).toContain('--iconify-var-name: icon')
    expect(result.rawCss).toContain('--iconify-square: false')
    expect(result.rawCss).toContain('--iconify-scale: 1.2')
    expect(result.css).toContain('.icon-_bmdi--home_B')
    expect(result.css).toContain('.iconify-_bmdi--home_B')
    expect(result.css).toContain('.iconify-options')
    expect(result.css).not.toContain('@plugin')
  })

  it('supports real Iconify Tailwind v4 CSS @plugin option blocks in the v4 engine', async () => {
    const root = await createRealIconifyFixture(tailwindcss4Root)
    const source = await createRealIconifyTailwind4OptionMatrixSource(root)
    const engine = createTailwindV4Engine(source)

    const result = await engine.generate()

    expect(result.classSet).toEqual(new Set([
      'i-[tst--home]',
      'only-[tst--home]',
    ]))
    expect(result.rawCss).toContain('.i-\\[tst--home\\]')
    expect(result.rawCss).toContain('width: 1.5em')
    expect(result.rawCss).toContain('height: 1.5em')
    expect(result.rawCss).toContain('.only-\\[tst--home\\]')
    expect(result.rawCss).toContain('background-image: url("data:image/svg+xml')
    expect(result.css).toContain('.i-_btst--home_B')
    expect(result.css).toContain('.only-_btst--home_B')
    expect(result.css).toContain('width: 1.5em')
    expect(result.css).toContain('background-image: url("data:image/svg+xml')
    expect(result.css).not.toContain('@plugin')
  })
})
