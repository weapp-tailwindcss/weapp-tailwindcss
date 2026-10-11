import type { Plugin, PluginContainer, ResolvedConfig } from 'vite'
import type { SubpackageStyleRules } from '../subpackage'
import type { ResolvedSubPackage, UniAppStyleScopeInput, UniAppSubPackageConfig } from '../uni-app'

import type { ViteWeappStyleInjectorOptions } from '../vite'
import fs from 'node:fs'
import { createRequire } from 'node:module'

import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { assignDefined, collectPresetConfigs, createStyleRuleTargets } from '../preset-resolution'
import { resolveUniAppStyleScopes, splitUniAppStyleScopes } from '../uni-app'
import weappStyleInjector from '../vite'

export type { SubpackageStyleRule, SubpackageStyleRules } from '../subpackage'
export type { UniAppStyleScopeInput, UniAppSubPackageConfig } from '../uni-app'

export interface ViteUniAppStyleInjectorOptions extends Omit<ViteWeappStyleInjectorOptions, 'uniAppSubPackages'> {
  pagesJsonPath?: string | string[]
  subPackages?: UniAppSubPackageConfig | UniAppSubPackageConfig[]
  sourceFileName?: string | string[]
  outputName?: string
  files?: string | string[]
  include?: string | string[]
  exclude?: string | string[]
  indexFileName?: string | string[]
  styleScopes?: UniAppStyleScopeInput | UniAppStyleScopeInput[]
  rules?: SubpackageStyleRules
}

function resolveDefaultPagesJsonPaths(): string[] {
  const cwd = process.cwd()
  return [
    path.resolve(cwd, 'src/pages.json'),
    path.resolve(cwd, 'pages.json'),
  ]
}

// 使用 Tailwind 插件的 transform 钩子时需要兼容多种写法，这里先抽象出统一的处理函数。
type TransformHandler = (this: unknown, code: string, id: string, options?: { ssr?: boolean } | undefined) => unknown
type PreprocessCSS = typeof import('vite')['preprocessCSS']

function getTransformHandler(hook: Plugin['transform'] | undefined): TransformHandler | undefined {
  if (!hook) {
    return undefined
  }

  if (typeof hook === 'function') {
    return hook as TransformHandler
  }

  if (typeof hook === 'object' && hook !== null && 'handler' in hook && typeof hook.handler === 'function') {
    return hook.handler as TransformHandler
  }

  return undefined
}

// 构建阶段生成分包入口样式时，提前触发 Tailwind 的 transform 逻辑并缓存结果
function createUniAppSubPackageStyleGeneratorPlugin(subPackages: ResolvedSubPackage[]): {
  plugin: Plugin
  generate: ViteWeappStyleInjectorOptions['generateSubpackageStyle']
  loadTargetStyle: NonNullable<ViteWeappStyleInjectorOptions['loadSubpackageTargetStyle']>
} {
  const existing = [...subPackages]

  let resolvedConfig: ResolvedConfig | undefined
  let preprocessConfig: ResolvedConfig | undefined
  let preprocessCSSFn: PreprocessCSS | undefined
  let pluginContainer: PluginContainer | undefined
  let tailwindTransformHandler: TransformHandler | undefined
  const processedSourceCache = new Map<string, string>()
  const targetStyleSourceCache = new Map<string, string>()
  const outputCache = new Map<string, string>()

  const transformContext = {
    addWatchFile() {},
  }

  // Vite 配置里 plugins 可能是多层嵌套数组，统一拍平成线性列表便于检索
  const flattenPlugins = (plugins: ReadonlyArray<Plugin | Plugin[] | null | undefined | false>): Plugin[] => {
    const flat: Plugin[] = []
    for (const entry of plugins) {
      if (Array.isArray(entry)) {
        flat.push(...flattenPlugins(entry))
      }
      else if (entry) {
        flat.push(entry)
      }
    }
    return flat
  }

  const processEntry = async (entry: ResolvedSubPackage) => {
    const sourcePath = entry.sourceAbsolutePath
    if (!fs.existsSync(sourcePath)) {
      return undefined
    }

    const cacheKey = `${sourcePath}::${entry.preprocess !== false ? '1' : '0'}`
    let processedSource = processedSourceCache.get(cacheKey)

    if (typeof processedSource !== 'undefined') {
      return processedSource
    }

    let rawSource: string
    try {
      rawSource = await fs.promises.readFile(sourcePath, 'utf8')
    }
    catch {
      return undefined
    }

    if (entry.preprocess !== false && resolvedConfig) {
      try {
        let transformedSource = rawSource
        const cssConfig = getPreprocessConfig()
        const preprocess = await getPreprocessCSS()

        const initialResult = await preprocess(transformedSource, sourcePath, cssConfig)
        transformedSource = initialResult.code

        const transformIds = new Set<string>([sourcePath, `${sourcePath}?direct`])

        if (pluginContainer) {
          try {
            const resolvedId = await pluginContainer.resolveId(sourcePath)
            if (resolvedId?.id) {
              transformIds.add(resolvedId.id)
              transformIds.add(`${resolvedId.id}?direct`)
            }
          }
          catch {
            // ignore resolution errors and fall back to raw path
          }
        }

        for (const id of transformIds) {
          let transformResult: unknown

          if (pluginContainer) {
            transformResult = await pluginContainer.transform(transformedSource, id)
          }
          else if (tailwindTransformHandler) {
            transformResult = await tailwindTransformHandler.call(transformContext, transformedSource, id)
          }

          if (
            transformResult
            && typeof transformResult === 'object'
            && 'code' in transformResult
            && typeof (transformResult as { code?: unknown }).code === 'string'
          ) {
            transformedSource = (transformResult as { code: string }).code
            break
          }
        }

        const finalResult = await preprocess(transformedSource, sourcePath, cssConfig)
        processedSource = finalResult.code
      }
      catch (error) {
        throw Object.assign(
          new Error(`[weapp-style-injector] Failed to preprocess "${sourcePath}": ${(error as Error).message}`),
          { cause: error },
        )
      }
    }
    else {
      processedSource = rawSource
    }

    processedSourceCache.set(cacheKey, processedSource)
    return processedSource
  }

  function getPreprocessConfig(): ResolvedConfig {
    if (preprocessConfig) {
      return preprocessConfig
    }
    if (!resolvedConfig) {
      throw new Error('Vite config has not been resolved.')
    }
    const config = resolvedConfig
    const css: Partial<ResolvedConfig['css']> = {
      transformer: config.css.transformer,
      devSourcemap: false,
    }
    if (config.css.preprocessorMaxWorkers !== undefined) {
      css.preprocessorMaxWorkers = config.css.preprocessorMaxWorkers
    }
    preprocessConfig = {
      ...config,
      css: css as ResolvedConfig['css'],
      plugins: [],
    }
    return preprocessConfig
  }

  async function getPreprocessCSS(): Promise<PreprocessCSS> {
    if (preprocessCSSFn) {
      return preprocessCSSFn
    }
    if (!resolvedConfig) {
      throw new Error('Vite config has not been resolved.')
    }

    const requireFromRoot = createRequire(pathToFileURL(path.join(resolvedConfig.root, 'package.json')))
    const vitePackageJsonPath = requireFromRoot.resolve('vite/package.json')
    const vitePackageJson = JSON.parse(fs.readFileSync(vitePackageJsonPath, 'utf8')) as {
      exports?: {
        '.'?: {
          import?: string | { default?: string }
        }
      }
      module?: string
    }
    const viteImportEntry = typeof vitePackageJson.exports?.['.']?.import === 'string'
      ? vitePackageJson.exports['.'].import
      : vitePackageJson.exports?.['.']?.import?.default
    const viteEntry = path.resolve(path.dirname(vitePackageJsonPath), viteImportEntry ?? vitePackageJson.module ?? 'dist/node/index.js')
    const vite = await import(pathToFileURL(viteEntry).href) as { preprocessCSS?: PreprocessCSS }
    if (typeof vite.preprocessCSS !== 'function') {
      throw new TypeError('Resolved Vite entry does not export preprocessCSS.')
    }
    preprocessCSSFn = vite.preprocessCSS
    return preprocessCSSFn
  }

  const plugin: Plugin = {
    name: 'weapp-style-injector:uni-app-sub-packages',
    apply: 'build' as const,
    async buildStart() {
      processedSourceCache.clear()
      outputCache.clear()
      targetStyleSourceCache.clear()
      for (const entry of existing) {
        for (const sourceFile of entry.sourceFiles ?? [entry.sourceAbsolutePath]) {
          this.addWatchFile(sourceFile)
        }
        await processEntry(entry)
        for (const targetSourceFile of entry.targetSourceFiles ?? []) {
          this.addWatchFile(targetSourceFile.sourceAbsolutePath)
          if (!targetStyleSourceCache.has(targetSourceFile.sourceAbsolutePath) && fs.existsSync(targetSourceFile.sourceAbsolutePath)) {
            const source = await fs.promises.readFile(targetSourceFile.sourceAbsolutePath, 'utf8')
            targetStyleSourceCache.set(targetSourceFile.sourceAbsolutePath, source)
          }
        }
      }
    },
    async load(id) {
      const cleanId = id.split('?', 1)[0]?.split('#', 1)[0] ?? ''
      const targetSourceFile = existing
        .flatMap(entry => entry.targetSourceFiles ?? [])
        .find(entry => entry.sourceAbsolutePath === cleanId)
      if (!targetSourceFile) {
        return undefined
      }

      const source = await fs.promises.readFile(targetSourceFile.sourceAbsolutePath, 'utf8')
      targetStyleSourceCache.set(targetSourceFile.sourceAbsolutePath, source)
      return undefined
    },
    async transform(code, id) {
      const cleanId = id.split('?', 1)[0]?.split('#', 1)[0] ?? ''
      const targetSourceFile = existing
        .flatMap(entry => entry.targetSourceFiles ?? [])
        .find(entry => entry.sourceAbsolutePath === cleanId)
      if (targetSourceFile) {
        targetStyleSourceCache.set(targetSourceFile.sourceAbsolutePath, code)
      }
      return undefined
    },
    configResolved(config: ResolvedConfig) {
      resolvedConfig = config
      // Vite 在 build 阶段不会暴露 pluginContainer，这里通过类型断言尝试读取，失败时会退回到手动调用 Tailwind transform
      pluginContainer = (config as ResolvedConfig & { pluginContainer?: PluginContainer }).pluginContainer
      if (!tailwindTransformHandler) {
        const tailwindCandidates = flattenPlugins(config.plugins)
          .filter(entry => entry?.name === '@tailwindcss/vite:generate:build')
        const matched = tailwindCandidates.find(entry => typeof entry?.transform !== 'undefined')
        if (matched?.transform) {
          tailwindTransformHandler = getTransformHandler(matched.transform)
        }
      }
    },
  }

  return {
    plugin,
    async generate(context) {
      const entry = existing.find(item => item.root === context.root && item.sourceAbsolutePath === context.sourcePath)
      if (!entry) {
        return undefined
      }
      if (entry.generate) {
        return entry.generate(context)
      }
      const cached = outputCache.get(context.outputFileName)
      if (typeof cached !== 'undefined') {
        return cached
      }
      const processed = await processEntry(entry)
      if (typeof processed !== 'undefined') {
        outputCache.set(context.outputFileName, processed)
      }
      return processed
    },
    async loadTargetStyle(_fileName, sourceAbsolutePath) {
      return targetStyleSourceCache.get(sourceAbsolutePath)
    },
  }
}

export function StyleInjector(options: ViteUniAppStyleInjectorOptions = {}) {
  const {
    pagesJsonPath,
    subPackages,
    sourceFileName,
    outputName,
    files,
    include,
    exclude,
    indexFileName,
    styleScopes,
    rules,
    ...rest
  } = options

  const { subPackages: scopedSubPackages, manual: manualStyleScopes } = splitUniAppStyleScopes(styleScopes)
  const explicitConfigs = Array.isArray(subPackages)
    ? subPackages
    : subPackages
      ? [subPackages]
      : []
  const configs = collectPresetConfigs<UniAppSubPackageConfig>({
    explicitConfigs: [...explicitConfigs, ...scopedSubPackages],
    requestedPaths: pagesJsonPath,
    defaultPaths: resolveDefaultPagesJsonPaths(),
    getConfigPath: config => config.pagesJsonPath,
    createDiscoveredConfig: (candidate) => {
      const config: UniAppSubPackageConfig = {
        pagesJsonPath: candidate,
      }
      assignDefined(config, { indexFileName, sourceFileName, outputName, files, include, exclude })
      if (rules !== undefined) {
        config.rules = rules
      }
      else if (sourceFileName === undefined && indexFileName === undefined) {
        config.rules = [{ from: { ref: 'app.css' }, to: createStyleRuleTargets(files, include, exclude) }]
      }
      return config
    },
  })

  const entries = configs.length > 0 ? configs : undefined
  const manualEntries = manualStyleScopes.length > 0 ? manualStyleScopes : undefined
  const resolvedSubPackages = resolveUniAppStyleScopes(entries, manualEntries)

  const injectorOptions: ViteWeappStyleInjectorOptions = {
    ...rest,
  }
  if (entries !== undefined) {
    injectorOptions.uniAppSubPackages = entries
  }
  if (manualEntries !== undefined) {
    injectorOptions.uniAppStyleScopes = manualEntries
  }

  const generator = createUniAppSubPackageStyleGeneratorPlugin(resolvedSubPackages)

  if (resolvedSubPackages.length > 0) {
    injectorOptions.subpackageStyleScopes = resolvedSubPackages
    if (generator.generate !== undefined) {
      injectorOptions.generateSubpackageStyle = generator.generate
    }
    injectorOptions.loadSubpackageTargetStyle = generator.loadTargetStyle
  }

  const plugins = [
    weappStyleInjector(injectorOptions),
  ]

  if (resolvedSubPackages.length > 0) {
    plugins.unshift(generator.plugin)
  }

  return plugins.length === 1 ? plugins[0] : plugins
}
