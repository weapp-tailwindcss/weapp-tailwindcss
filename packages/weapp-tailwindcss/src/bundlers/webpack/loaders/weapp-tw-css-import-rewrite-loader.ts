import type webpack from 'webpack'
import type { WebpackCssImportRewriteLoaderOptions } from './runtime-registry'
import type { AppType, InternalUserDefinedOptions } from '@/types'
import { Buffer } from 'node:buffer'
import path from 'node:path'
import process from 'node:process'
import { inspect } from 'node:util'
import { filterExistingCssRules, normalizeTailwindcssV4InfinityRadiusCss, rewriteCssConfigRequests, transformLynxCssCompat } from '@weapp-tailwindcss/postcss/transform'
import { ensurePosix } from '@weapp-tailwindcss/shared'
import { rewriteTailwindcssImportsInCode } from '@/bundlers/shared/css-imports'
import { createBundlerGeneratedCssMarker } from '@/bundlers/shared/generated-css-marker'
import { normalizeStyleHandlerMajorVersion } from '@/context/style-options'
import { hasTailwindApplyDirective, hasTailwindRootDirectives, hasTailwindRootImportDirectives, normalizeTailwindSourceForGenerator, removeTailwindSourceDirectives } from '@/generation/directives'
import { generateTailwindV4Css } from '@/generation/service'
import { normalizeWeappTailwindcssGeneratorOptions } from '@/generator'
import { resolveTailwindV4EntriesFromCssCached } from '@/project-sources'
import { createSourceCandidateStore, isSourceCandidateRequest } from '@/project-sources/candidates'
import { forEachSourceCandidateFile } from '@/project-sources/candidates/file-io'
import { resolveSourceCandidateScanFiles } from '@/project-sources/candidates/scan-root'
import { resolveTailwindcssOptions } from '@/tailwindcss/runtime-options'
import { resolveSourceScanPath } from '@/tailwindcss/source-scan'
import { collectWebpackBareSelectorUserCss } from '../BaseUnifiedPlugin/v5-assets/pipeline-helpers'
import { getLatestWebpackLoaderRuntime, getWebpackLoaderRuntime } from './runtime-registry'
import { registerWebpackSourceContexts, registerWebpackWatchFile } from './watch-dependencies'

interface CssImportRewriteLoaderOptions extends WebpackCssImportRewriteLoaderOptions {}

export function resolveWebpackCssPipelineLoaderOptions(options: CssImportRewriteLoaderOptions | undefined): CssImportRewriteLoaderOptions | undefined {
  const runtime = (getWebpackLoaderRuntime(options?.tailwindcssImportRewriteRuntimeKey)
    ?? getLatestWebpackLoaderRuntime())?.cssImportRewrite
  return runtime
    ? {
        ...options,
        tailwindcssImportRewrite: runtime,
      }
    : options
}

function joinPosixPath(base: string, subpath: string) {
  if (base.endsWith('/')) {
    return `${base}${subpath}`
  }
  return `${base}/${subpath}`
}

function applyCssImportRewrite(source: string, options: CssImportRewriteLoaderOptions | undefined) {
  const rewriteOptions = options?.tailwindcssImportRewrite
  const pkgDir = rewriteOptions?.pkgDir
  if (!pkgDir) {
    return source
  }
  const rewritten = rewriteTailwindcssImportsInCode(
    source,
    ensurePosix(pkgDir),
    {
      join: joinPosixPath,
      appType: rewriteOptions.appType,
    },
  )
  return rewritten ?? source
}

function isPackageJsonImportRequest(request: string) {
  return request.startsWith('#')
}

function normalizeCssConfigDirectives(source: string, resourcePath?: string) {
  if (!resourcePath) {
    return source
  }
  const base = path.dirname(resourcePath)
  return rewriteCssConfigRequests(source, (request) => {
    if (path.isAbsolute(request) || isPackageJsonImportRequest(request)) {
      return undefined
    }
    const resolved = path.resolve(base, request)
    return ensurePosix(resolved)
  })
}

function createCssHandlerOptions(
  options: InternalUserDefinedOptions,
  majorVersion: number | undefined,
  file: string,
  appType?: AppType,
) {
  const tailwindOptions = resolveTailwindcssOptions(options.tailwindcssRuntimeOptions)
  const cssEntries = [
    ...(options.cssEntries ?? []),
    ...(tailwindOptions?.v4?.cssEntries ?? []),
  ]
    .filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
    .map(entry => path.resolve(entry))
  const resolvedFile = path.resolve(file)
  const matchedCssEntryIndex = cssEntries.findIndex(entry => entry === resolvedFile)
  return {
    isMainChunk: matchedCssEntryIndex >= 0
      ? matchedCssEntryIndex === 0
      : options.mainCssChunkMatcher(file, appType),
    postcssOptions: {
      options: {
        from: file,
      },
    },
    ...(normalizeStyleHandlerMajorVersion(majorVersion) === undefined ? {} : { majorVersion: 4 as const }),
  }
}

async function resolveWebpackLoaderSourceCandidates(
  source: string,
  loaderContext: webpack.LoaderContext<CssImportRewriteLoaderOptions>,
  options: CssImportRewriteLoaderOptions | undefined,
) {
  const compilerOptions = options?.tailwindcssImportRewrite?.compilerOptions
  if (!compilerOptions) {
    return undefined
  }
  const root = compilerOptions.tailwindcssBasedir ?? process.cwd()
  const file = loaderContext.resourcePath
  const resolved = await resolveTailwindV4EntriesFromCssCached(source, path.dirname(file))
  if (!resolved) {
    return undefined
  }
  const collector = createSourceCandidateStore({
    bareArbitraryValues: compilerOptions.arbitraryValues?.bareArbitraryValues,
    customAttributesEntities: compilerOptions.customAttributesEntities,
    disabledDefaultTemplateHandler: compilerOptions.disabledDefaultTemplateHandler,
  })
  collector.syncInline(resolved.inlineCandidates)
  const outDir = loaderContext._compiler?.options.output.path
  await registerWebpackSourceContexts(loaderContext, { ...resolved, root })
  for (const dependency of resolved.dependencies) {
    await registerWebpackWatchFile(loaderContext, dependency)
  }
  const scanFiles = await resolveSourceCandidateScanFiles({
    entries: resolved.entries,
    explicit: resolved.explicit,
    filter: isSourceCandidateRequest,
    outDir,
    root,
  })
  await forEachSourceCandidateFile(scanFiles, async (file) => {
    const normalizedFile = resolveSourceScanPath(file)
    await registerWebpackWatchFile(loaderContext, normalizedFile)
    await collector.syncFile(normalizedFile)
  })
  const candidates = collector.valuesForEntries(resolved.entries)
  if (candidates.size === 0) {
    return undefined
  }
  return {
    candidates,
    getSourceCandidatesForEntries: collector.valuesForEntries,
  }
}

export async function generateCssForWebpackPipeline(
  source: string,
  loaderContext: webpack.LoaderContext<CssImportRewriteLoaderOptions>,
  options: CssImportRewriteLoaderOptions | undefined,
) {
  const rewriteOptions = options?.tailwindcssImportRewrite
  const compilerOptions = rewriteOptions?.compilerOptions
  const runtimeState = rewriteOptions?.runtimeState
  const getRuntimeSet = rewriteOptions?.getRuntimeSet
  if (!compilerOptions || !runtimeState || !getRuntimeSet) {
    return undefined
  }
  await runtimeState.readyPromise
  const runtime = await getRuntimeSet()
  const generatorOptions = normalizeWeappTailwindcssGeneratorOptions(compilerOptions.generator, {
    appType: compilerOptions.appType,
    platform: compilerOptions.cssOptions?.platform ?? compilerOptions.platform,
    tailwindcssMajorVersion: runtimeState.tailwindRuntime.majorVersion,
    uniAppX: compilerOptions.uniAppX,
  })
  if (!generatorOptions.enabled) {
    return undefined
  }
  const generatorTarget = generatorOptions.target
  if (generatorTarget !== 'web' && generatorTarget !== 'weapp') {
    return undefined
  }
  const file = loaderContext.resourcePath
  const normalizedSource = normalizeCssConfigDirectives(source, file)
  const cssHandlerOptions = createCssHandlerOptions(
    compilerOptions,
    runtimeState.tailwindRuntime.majorVersion,
    file,
    rewriteOptions.appType,
  )
  const sourceCandidateScan = await resolveWebpackLoaderSourceCandidates(normalizedSource, loaderContext, options)
  const generated = await generateTailwindV4Css({
    opts: compilerOptions,
    runtimeState,
    runtime,
    rawSource: normalizedSource,
    file,
    outputFile: file,
    getSourceCandidatesForEntries: sourceCandidateScan?.getSourceCandidatesForEntries,
    sourceCandidates: sourceCandidateScan?.candidates,
    cssHandlerOptions,
    cssUserHandlerOptions: {
      ...cssHandlerOptions,
      isMainChunk: false,
    },
    cssStage: 'raw',
    styleHandler: compilerOptions.styleHandler,
    incrementalCache: false,
    debug: process.env['WEAPP_TW_LOADER_DEBUG']
      ? (message, ...args) => process.stdout.write(`[weapp-tw-css-import-rewrite-loader] ${message} ${inspect(args)}\n`)
      : () => undefined,
    deferCssAdaptation: generatorTarget !== 'web',
  })
  if (!generated) {
    return undefined
  }
  rewriteOptions.markGeneratedCssSource?.(file)
  for (const dependency of generated.dependencies) {
    await registerWebpackWatchFile(loaderContext, dependency)
  }
  const generatedCssSource = removeTailwindSourceDirectives(generated.css, { importFallback: true })
  const generatedCss = (compilerOptions.cssOptions?.platform ?? compilerOptions.platform) === 'lynx'
    ? transformLynxCssCompat(generatedCssSource)
    : generatedCssSource
  const bareUserCss = generatorTarget === 'web' ? '' : collectWebpackBareSelectorUserCss(normalizedSource)
  const missingBareUserCss = bareUserCss.trim().length === 0
    ? ''
    : filterExistingCssRules(generatedCss, bareUserCss)
  const combinedCss = missingBareUserCss.trim().length === 0
    ? generatedCss
    : `${generatedCss}\n${missingBareUserCss}`
  // 先消除旧版 calc 无法解析的无限圆角，其余适配仍留在最终产物阶段。
  const css = generatorTarget === 'weapp' && runtimeState.tailwindRuntime.majorVersion === 4
    ? normalizeTailwindcssV4InfinityRadiusCss(combinedCss)
    : combinedCss
  if (process.env['WEAPP_TW_LOADER_DEBUG']) {
    process.stdout.write(`[weapp-tw-css-import-rewrite-loader] generated ${inspect({
      classes: generated.classSet.size,
      cssLength: css.length,
      file,
      preview: css.slice(0, 160),
      target: generated.target,
    })}\n`)
  }
  rewriteOptions.registerGeneratedCss?.({
    classSet: generated.classSet,
    css,
    dependencies: generated.dependencies,
    file,
  })
  return `${createBundlerGeneratedCssMarker('webpack', file)}\n${css}`
}

export function registerWebpackCssGeneratorSource(
  source: string,
  resourcePath: string,
  options: CssImportRewriteLoaderOptions | undefined,
) {
  const css = normalizeCssConfigDirectives(
    normalizeTailwindSourceForGenerator(source, { importFallback: true }),
    resourcePath,
  )
  if (process.env['WEAPP_TW_LOADER_DEBUG']) {
    process.stdout.write(`[weapp-tw-css-import-rewrite-loader] register source ${inspect({
      cssLength: css.length,
      file: resourcePath,
      preview: css.slice(0, 240),
    })}\n`)
  }
  options?.tailwindcssImportRewrite?.registerCssSourceFile?.({
    file: resourcePath,
    css,
    processed: false,
  })
  return options?.tailwindcssImportRewrite?.registerCssSource?.({
    file: resourcePath,
    css,
  })
}

export function transformCssImportRewriteSource(
  source: string | Buffer,
  options: CssImportRewriteLoaderOptions | undefined,
) {
  const isBuffer = Buffer.isBuffer(source)
  const input = isBuffer ? source.toString('utf-8') : source
  const rewritten = applyCssImportRewrite(input, options)
  // If unchanged, return original to preserve type.
  if (rewritten === input) {
    return source
  }
  if (process.env['WEAPP_TW_LOADER_DEBUG']) {
    process.stdout.write(`[weapp-tw-css-import-rewrite-loader] rewritten import ${inspect({
      before: input.slice(0, 80),
      after: rewritten.slice(0, 80),
    })}\n`)
  }
  return rewritten
}

const WeappTwCssImportRewriteLoader: webpack.LoaderDefinitionFunction<CssImportRewriteLoaderOptions> = function (
  this: webpack.LoaderContext<CssImportRewriteLoaderOptions>,
  source: string | Buffer,
) {
  if (process.env['WEAPP_TW_LOADER_DEBUG']) {
    process.stdout.write(`[weapp-tw-css-import-rewrite-loader] executing for ${this.resourcePath}\n`)
  }
  const opt = resolveWebpackCssPipelineLoaderOptions(this.getOptions())
  const input = Buffer.isBuffer(source) ? source.toString('utf-8') : source
  const hasTailwindGeneratorSource = typeof input === 'string' && (
    hasTailwindRootDirectives(input, { importFallback: true })
    || hasTailwindApplyDirective(input)
  )
  const isLynxPipeline = opt?.tailwindcssImportRewrite?.compilerOptions?.platform === 'lynx'
  const hasLynxEntrySource = !isLynxPipeline || (
    hasTailwindRootImportDirectives(input, { importFallback: true })
    || hasTailwindApplyDirective(input)
  )
  const shouldRegisterGeneratorSource = hasTailwindGeneratorSource
    && hasLynxEntrySource
    && (!isLynxPipeline || opt?.generateCss === true)
  const register = shouldRegisterGeneratorSource
    ? () => registerWebpackCssGeneratorSource(input, this.resourcePath, opt)
    : undefined
  const transform = () => {
    const transformed = transformCssImportRewriteSource(source, opt)
    if (typeof transformed === 'string') {
      return normalizeCssConfigDirectives(transformed, this.resourcePath)
    }
    return transformed
  }
  const canGenerate = opt?.generateCss === true
    && hasTailwindGeneratorSource
    && hasLynxEntrySource
    && opt?.tailwindcssImportRewrite?.compilerOptions
    && opt.tailwindcssImportRewrite.runtimeState
    && opt.tailwindcssImportRewrite.getRuntimeSet
  const generate = canGenerate
    ? async () => {
      const generated = await generateCssForWebpackPipeline(input, this, opt)
      return generated ?? transform()
    }
    : undefined
  if (generate) {
    return Promise.resolve().then(async () => {
      await register?.()
      return generate()
    })
  }
  const registerTask = register?.()
  if (registerTask && typeof (registerTask as PromiseLike<void>).then === 'function') {
    return Promise.resolve(registerTask).then(async () => {
      return transform()
    })
  }
  return transform()
}

export default WeappTwCssImportRewriteLoader
