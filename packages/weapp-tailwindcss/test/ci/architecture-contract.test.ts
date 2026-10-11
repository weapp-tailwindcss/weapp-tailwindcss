import fs from 'node:fs'
import path from 'node:path'
import { build } from 'esbuild'
import { describe, expect, it } from 'vitest'

const repoRoot = path.resolve(import.meta.dirname, '../../../..')

const forbiddenCssProcessingDeps = [
  '@csstools/css-color-parser',
  '@csstools/css-parser-algorithms',
  '@csstools/css-tokenizer',
  'autoprefixer',
  'lightningcss',
  'postcss',
  'postcss-preset-env',
  'postcss-pxtrans',
  'postcss-rem-to-responsive-pixel',
  'postcss-rule-unit-converter',
  'postcss-scss',
  'postcss-selector-parser',
  'postcss-value-parser',
] as const

const forbiddenCssProcessingImportRe = /from\s+['"](?:postcss-scss|@csstools\/css-tokenizer|@csstools\/css-parser-algorithms|@csstools\/css-color-parser|postcss-selector-parser|postcss-value-parser|lightningcss|postcss)['"]/

function readPackage(relativePath: string) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')) as {
    name: string
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
    peerDependencies?: Record<string, string>
  }
}

function collectTsFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...collectTsFiles(fullPath))
      continue
    }
    if (entry.isFile() && entry.name.endsWith('.ts')) {
      files.push(fullPath)
    }
  }
  return files
}

describe('架构边界契约', () => {
  it('keeps uni-app x property and value normalization in PostCSS', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'packages/weapp-tailwindcss/src/uni-app-x/style-asset/style-value.ts'), 'utf8')
    expect(source).toContain('normalizeUniAppXStyleProperty')
    expect(source).toContain('normalizeUniAppXStyleValue')
    expect(source).not.toMatch(/STRING_STYLE_PROPERTIES|function (?:toCamelCase|normalizeValue|normalizeStyleValue)\(/)
  })

  it('keeps migrated CSS transforms and diagnostics behind the PostCSS facade', () => {
    for (const file of [
      'src/core/compiler/transforms.ts',
      'src/compiler/runtime-affecting-signature.ts',
      'src/bundlers/vite/generate-bundle/css-share-scope.ts',
      'src/tailwindcss/v4-engine/miniprogram.ts',
      'src/tailwindcss/runtime-factory.ts',
      'src/tailwindcss/source-scan/inline-source.ts',
      'src/bundlers/shared/css-source-trace.ts',
      'src/project-sources/css-entries.ts',
      'src/bundlers/shared/css-imports.ts',
      'src/bundlers/vite/rewrite-css-imports.ts',
      'src/generation/candidates.ts',
      'src/generation/config-directive.ts',
      'src/generation/legacy-selectors.ts',
      'src/tailwindcss/v4-engine/generator/rpx-candidates.ts',
      'src/bundlers/vite/generate-bundle/css-config-directives.ts',
      'src/bundlers/vite/generate-bundle/web-css-module.ts',
      'src/bundlers/webpack/loaders/weapp-tw-css-import-rewrite-loader.ts',
      'src/bundlers/vite/css-output.ts',
      'src/bundlers/vite/generate-bundle/tailwind-v4-css-source.ts',
      'src/generation/source-resolver/apply-reference.ts',
      'src/uni-app-x/style-asset.ts',
      'src/uni-app-x/vite/harmony-apply.ts',
      'src/tailwindcss/v4-engine/generator/incremental-cache.ts',
      'src/tailwindcss/v4/rpx-theme-warning.ts',
      'src/generation/scoped-rules.ts',
      'src/generation/user-layer-order.ts',
      'src/generation/user-css/apply-only.ts',
      'src/generation/user-css/compile-functions.ts',
      'src/generation/user-css/at-rules.ts',
      'src/generation/user-css/generated-cleanup.ts',
      'src/generation/user-css/source-fragments.ts',
      'src/generation/user-css/user-layers.ts',
      'src/generation/user-css/transform.ts',
      'src/generation/directives.ts',
      'src/generation/directives/fallback.ts',
      'src/generation/markers.ts',
      'src/generation/class-selectors.ts',
      'src/generation/result-helpers.ts',
      'src/generation/framework-css-composition.ts',
      'src/generation/framework-user-css.ts',
      'src/tailwindcss/v4/preflight.ts',
      'src/bundlers/webpack/BaseUnifiedPlugin/v5-assets/pipeline-helpers/preflight-runtime.ts',
      'src/bundlers/webpack/BaseUnifiedPlugin/v5-assets/pipeline-helpers/generated-css.ts',
      'src/bundlers/webpack/BaseUnifiedPlugin/v5-assets/pipeline-helpers/user-css-markers.ts',
      'src/bundlers/webpack/BaseUnifiedPlugin/v5-assets/pipeline-helpers/user-css.ts',
      'src/bundlers/webpack/BaseUnifiedPlugin/v5-assets/pipeline-helpers/sources.ts',
      'src/bundlers/webpack/loaders/weapp-tw-runtime-classset-loader.ts',
      'src/bundlers/vite/processed-css-assets/cleanup.ts',
      'src/bundlers/vite/processed-css-assets/markers-imports.ts',
      'src/bundlers/vite/processed-css-assets/coverage.ts',
      'src/bundlers/vite/processed-css-assets/scoped-tailwind-noise.ts',
      'src/bundlers/vite/processed-css-assets/injection-plan.ts',
      'src/bundlers/shared/generated-css-marker.ts',
      'src/generation/generation-helpers/source-order.ts',
      'src/generation/output-import-shell.ts',
      'src/generation/legacy-compat.ts',
      'src/uni-app-x/style-asset/harmony-apply.ts',
      'src/uni-app-x/style-asset/style-value.ts',
    ]) {
      const source = fs.readFileSync(path.join(repoRoot, 'packages/weapp-tailwindcss', file), 'utf8')
      expect(source).toContain('@weapp-tailwindcss/postcss')
      expect(source).not.toMatch(/postcss\.parse|\.walkDecls\(|\.walkRules\(|\.walkAtRules\(|\.walkComments\(/)
    }
  })

  it('keeps runtime and native packages independent from bundler packages', () => {
    const forbiddenForRuntime = new Set(['weapp-tailwindcss', '@weapp-tailwindcss/postcss', 'webpack', 'vite', 'rspack'])
    const packageFiles = [
      'packages-runtime/runtime/package.json',
      'packages-runtime/merge/package.json',
      'packages-runtime/variants/package.json',
      'packages-runtime/cva/package.json',
      'packages/react-native/package.json',
      'packages/lynx/package.json',
    ]

    for (const file of packageFiles) {
      const pkg = readPackage(file)
      const dependencies = Object.keys(pkg.dependencies ?? {})
      const forbidden = dependencies.filter(name => forbiddenForRuntime.has(name))
      if (file === 'packages/react-native/package.json') {
        // 编译入口可以使用生成器和独立 CSS 编译子路径；运行时依赖闭包另行验证。
        expect(forbidden.filter(name => name !== 'weapp-tailwindcss' && name !== '@weapp-tailwindcss/postcss')).toEqual([])
      }
      else if (file === 'packages/lynx/package.json') {
        // P2 抽出 generator 前保留根包 facade；禁止继续增加其它 bundler 直依赖。
        expect(forbidden.filter(name => name !== 'weapp-tailwindcss'), `${pkg.name} must not add direct bundler dependencies`).toEqual([])
      }
      else {
        expect(forbidden, `${pkg.name} must stay runtime-only`).toEqual([])
      }
    }
  })

  it('keeps the native runtime bundle free of compiler dependencies', async () => {
    const entry = path.join(repoRoot, 'packages/react-native/src/runtime.ts')
    const result = await build({
      entryPoints: [entry],
      bundle: true,
      platform: 'browser',
      format: 'esm',
      write: false,
      metafile: true,
    })
    expect(Object.keys(result.metafile.inputs).map(file => path.resolve(file))).toEqual([entry])
    expect(Object.values(result.metafile.outputs).flatMap(output => output.imports)).toEqual([])

    const compiler = fs.readFileSync(path.join(repoRoot, 'packages/react-native/src/compiler.ts'), 'utf8')
    expect(compiler).toContain('@weapp-tailwindcss/postcss/native')
    expect(compiler).not.toMatch(/postcss\.parse|\.walkDecls\(|\.walkRules\(/)
    expect(readPackage('packages/react-native/package.json').dependencies?.postcss).toBeUndefined()
  })

  it('isolates experimental transforms and injector orchestration', async () => {
    const experimentalEntry = path.join(repoRoot, 'packages/postcss/src/experimental/lightningcss/index.ts')
    const experimental = await build({
      entryPoints: [experimentalEntry],
      bundle: true,
      packages: 'external',
      platform: 'node',
      write: false,
      metafile: true,
    })
    const imports = Object.values(experimental.metafile.outputs).flatMap(output => output.imports.map(item => item.path))
    expect(imports).not.toContain('lightningcss')
    const stable = await build({
      entryPoints: [path.join(repoRoot, 'packages/postcss/src/index.ts')],
      bundle: true,
      packages: 'external',
      platform: 'node',
      write: false,
      metafile: true,
    })
    const stableFiles = Object.keys(stable.metafile.inputs).map(file => path.resolve(file))
    expect(stableFiles).not.toContain(experimentalEntry)
    expect(stableFiles).not.toContain(path.join(repoRoot, 'packages/postcss/src/native.ts'))
    expect(Object.values(stable.metafile.outputs).flatMap(output => output.imports.map(item => item.path))).not.toContain('lightningcss')
    for (const name of ['options', 'selector-transform', 'selector-utils']) {
      const source = fs.readFileSync(path.join(repoRoot, 'packages/experimental/src/lightningcss', `${name}.ts`), 'utf8')
      expect(source).toContain('@weapp-tailwindcss/postcss/experimental/lightningcss')
      expect(source).not.toMatch(/function |=>/)
    }
    const injector = fs.readFileSync(path.join(repoRoot, 'packages/tailwindcss-injector/src/postcss.ts'), 'utf8')
    expect(injector).toContain('injectTailwindDirectives')
    expect(injector).not.toMatch(/root\.(insertAfter|prepend)|walkAtRules/)
    expect(readPackage('packages/tailwindcss-injector/package.json').dependencies?.postcss).toBeUndefined()
  })

  it('uses catalogs for shared compiler and runtime utility versions', () => {
    const workspace = fs.readFileSync(path.join(repoRoot, 'pnpm-workspace.yaml'), 'utf8')
    expect(workspace).toContain('compilerUtilities:')
    expect(workspace).toContain('postcssCompat:')
    expect(workspace).toContain('runtimeVariants:')
    expect(workspace).toContain('runtimeLodash:')

    const packages = [
      readPackage('packages/weapp-tailwindcss/package.json'),
      readPackage('packages/postcss/package.json'),
      readPackage('packages-runtime/variants/package.json'),
      readPackage('packages-runtime/typography/package.json'),
    ]
    expect(packages[0].dependencies?.['oxc-parser']).toBe('catalog:compilerUtilities')
    expect(packages[1].dependencies?.['postcss-scss']).toBe('catalog:postcssCompat')
    expect(packages[2].dependencies?.['tailwind-variants']).toBe('catalog:runtimeVariants')
    expect(packages[3].dependencies?.['lodash.merge']).toBe('catalog:runtimeLodash')
  })

  it('keeps CSS processing dependencies inside @weapp-tailwindcss/postcss', () => {
    const main = readPackage('packages/weapp-tailwindcss/package.json')
    const postcss = readPackage('packages/postcss/package.json')
    const mainDeps = {
      ...main.dependencies,
      ...main.devDependencies,
    }

    for (const name of forbiddenCssProcessingDeps) {
      expect(mainDeps[name], `${name} must not be a weapp-tailwindcss dependency`).toBeUndefined()
    }

    expect(main.dependencies?.['@weapp-tailwindcss/postcss']).toBe('workspace:*')
    expect(postcss.dependencies?.['postcss-scss']).toBe('catalog:postcssCompat')
    expect(postcss.dependencies?.['@csstools/css-tokenizer']).toBe('catalog:csstools')
    expect(postcss.dependencies?.postcss).toBe('catalog:postcss85tilde')
  })

  it('keeps the v4 engine independent from product adapters and legacy engines', () => {
    const engine = readPackage('packages/engine/package.json')
    const dependencies = { ...engine.dependencies, ...engine.devDependencies }
    for (const name of ['@weapp-tailwindcss/postcss', 'weapp-tailwindcss', '@tailwindcss-mangle/engine', 'tailwindcss-patch', '@tailwindcss/vite', '@tailwindcss/postcss', 'tailwindcss-3']) {
      expect(dependencies[name], name).toBeUndefined()
    }
    expect(engine.dependencies?.postcss).toBe('catalog:postcss85tilde')
    expect(engine.dependencies?.['@tailwindcss/node']).toBe('catalog:tailwindcss4')
    const sources = collectTsFiles(path.join(repoRoot, 'packages/engine/src'))
      .map(file => fs.readFileSync(file, 'utf8'))
    for (const source of sources) {
      expect(source).not.toMatch(/@tailwindcss-mangle\/engine|from ['"](?:.*\/v3|@weapp-tailwindcss\/postcss|weapp-tailwindcss)['"]/)
    }
  })

  it('keeps product source free of legacy engine references after code moves', () => {
    const hits = ['engine', 'postcss', 'weapp-tailwindcss', 'cli']
      .flatMap(name => collectTsFiles(path.join(repoRoot, 'packages', name, 'src')))
      .filter(file => fs.readFileSync(file, 'utf8').includes('@tailwindcss-mangle/engine'))
      .map(file => path.relative(repoRoot, file))

    expect(hits).toEqual([])
  })

  it('does not import CSS processors from weapp-tailwindcss source', () => {
    const srcRoot = path.join(repoRoot, 'packages/weapp-tailwindcss/src')
    const hits = collectTsFiles(srcRoot)
      .flatMap((file) => {
        const content = fs.readFileSync(file, 'utf8')
        return forbiddenCssProcessingImportRe.test(content)
          ? [path.relative(repoRoot, file)]
          : []
      })

    expect(hits).toEqual([])
  })
})
